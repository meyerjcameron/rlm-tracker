import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCbsOdds } from './lib/cbsOdds.mjs';
import { fetchSbdData, findSbdEntry } from './lib/sportsBettingDime.mjs';
import { fetchHandlePercents, findHandleForGame } from './lib/cleatz.mjs';
import { formatKickoffCentral } from './lib/format.mjs';
import { conferenceForSchool } from './lib/conferences.mjs';
import { fetchTop25 } from './lib/rankings.mjs';
import { canonicalSchool } from './lib/schoolNames.mjs';
import { fetchInjuryReport } from './lib/injuries.mjs';
import { fetchStarters } from './lib/depthChart.mjs';
import { getHistoryMaps } from './lib/history.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'seed-games.json');

// Tuesday-to-Monday week boundary in Central time, matching the client's
// own week bucketing (see weekBucketStart in LineMovementTracker.jsx) --
// used to scope SBD's early game discovery to exactly the *next* such
// week. A fixed day offset from "whatever CBS's latest listed kickoff
// happens to be" drifts depending on CBS's own quirks (CFB's Tue-Sat
// schedule especially); this doesn't, since it's purely a function of
// today's date.
function weekBucketStart(ts) {
  const central = new Date(new Date(ts).toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const daysSinceTuesday = (central.getDay() - 2 + 7) % 7;
  central.setHours(0, 0, 0, 0);
  central.setDate(central.getDate() - daysSinceTuesday);
  return central.getTime();
}

const SOURCES = [
  { sport: 'NFL', oddsUrl: 'https://www.cbssports.com/nfl/odds/' },
  { sport: 'CFB', oddsUrl: 'https://www.cbssports.com/college-football/odds/' },
];

// One-time manual overrides for a starter confirmed out by strong reporting
// before CBS's own injury report has caught up and labeled them "Out" (CBS
// typically doesn't finalize designations until the Friday injury report).
// Remove each entry once CBS's site reflects the real status -- the normal
// automated report+depth-chart cross-reference takes over from there.
const MANUAL_INJURY_OVERRIDES = [
  { team: 'SEA', name: 'S. Darnold', position: 'QB', status: 'Out' },
];

// NFL only for now -- CBS doesn't maintain depth charts for the ~130 CFB
// teams the way it does for all 32 NFL teams.
async function fetchStartersOutByTeam(nflGames) {
  let injuryReport;
  try {
    injuryReport = await fetchInjuryReport();
  } catch (e) {
    console.error('[NFL] injury report fetch failed (continuing without injury flags):', e.message);
    return new Map();
  }

  const teams = new Map();
  nflGames.forEach((g) => {
    if (g.slugA) teams.set(g.sideA, g.slugA);
    if (g.slugB) teams.set(g.sideB, g.slugB);
  });

  const result = new Map();
  const entries = [...teams.entries()].filter(([code]) => injuryReport.get(code)?.length);
  const CONCURRENCY = 5;
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async ([code, slug]) => {
      try {
        const starters = await fetchStarters(code, slug);
        const startersOut = injuryReport.get(code).filter((p) => starters.has(p.name));
        if (startersOut.length) result.set(code, startersOut);
      } catch (e) {
        console.error(`[NFL] depth chart fetch failed for ${code}:`, e.message);
      }
    }));
  }

  MANUAL_INJURY_OVERRIDES.forEach(({ team, name, position, status }) => {
    const existing = result.get(team) || [];
    if (existing.some((p) => p.name === name)) return;
    result.set(team, [...existing, { name, position, status }]);
  });

  return result;
}

function buildSeedGame(cbsGame, sbdData, cleatzData, top25, startersOutByTeam, firstSeenMap, kickoffMap) {
  const firstSeenTs = firstSeenMap?.get(cbsGame.matchup.toLowerCase());
  const openMeta = firstSeenTs !== undefined ? { openTimestamp: firstSeenTs } : {};
  const sbd = sbdData ? findSbdEntry(sbdData, cbsGame.sideA, cbsGame.sideB, cbsGame.nameA, cbsGame.nameB) : null;
  const handle = cleatzData ? findHandleForGame(cleatzData, cbsGame.sideA, cbsGame.sideB, cbsGame.nameA, cbsGame.nameB) : null;

  const seed = {
    matchup: cbsGame.matchup,
    sport: cbsGame.sport,
    sideA: cbsGame.sideA,
    sideB: cbsGame.sideB,
    lines: [
      {
        book: 'CBS',
        value: cbsGame.spreadCurrent,
        // Left undefined (not silently set to spreadCurrent) when CBS's
        // openingLines column didn't parse -- the app treats a confirmed
        // open differently from an unknown one, so this must never look
        // like "open equals current" when we simply don't know the open.
        ...(cbsGame.spreadOpen !== null ? { open: cbsGame.spreadOpen } : {}),
        // The real date this game first got a spread, per this repo's own
        // git history -- lets the client backfill a lost/never-confirmed
        // open to its true date instead of guessing from whatever's left in
        // localStorage (which can be completely wiped for a given browser).
        ...openMeta,
      },
      // A second, independent line straight from real sportsbooks (MGM,
      // DraftKings, Bet365, WilliamHill, FanDuel, averaged) -- lets CBS's
      // and SBD's own line movement be cross-checked against each other
      // instead of trusting a single source.
      ...(sbd && sbd.spreadCurrent !== undefined ? [{
        book: 'SBD',
        value: sbd.spreadCurrent,
        ...(sbd.spreadOpen !== undefined ? { open: sbd.spreadOpen } : {}),
        ...openMeta,
      }] : []),
    ],
  };
  const kickoff = formatKickoffCentral(cbsGame.kickoffISO);
  if (kickoff) {
    seed.kickoff = kickoff;
    seed.kickoffTs = Date.parse(cbsGame.kickoffISO);
  } else {
    // Today's kickoff match failed (e.g. a school-name mismatch) -- fall
    // back to whatever kickoffTs this matchup had in a past commit, so it
    // doesn't lose its date even if it's since fallen off CBS's live page.
    const pastKickoffTs = kickoffMap?.get(cbsGame.matchup.toLowerCase());
    const pastKickoff = pastKickoffTs !== undefined ? formatKickoffCentral(pastKickoffTs) : null;
    if (pastKickoff) {
      seed.kickoff = pastKickoff;
      seed.kickoffTs = pastKickoffTs;
    }
  }
  if (cbsGame.score) seed.score = cbsGame.score;
  if (sbd && sbd.pctAway !== undefined) {
    seed.public = Math.round(sbd.pctAway * 10) / 10;
  }
  // Handle % (share of money wagered) from Cleatz -- a different, arguably
  // sharper signal than ticket-count public% above: a few large bets can
  // swing it far from the ticket split, which is the classic "smart money"
  // tell a plain bet-count % can't show on its own.
  if (handle) {
    seed.handlePublic = handle.handleAway;
  }

  if (startersOutByTeam) {
    const outA = startersOutByTeam.get(cbsGame.sideA);
    const outB = startersOutByTeam.get(cbsGame.sideB);
    if (outA && outA.length) seed.injuriesA = outA;
    if (outB && outB.length) seed.injuriesB = outB;
  }

  if (cbsGame.sport === 'CFB') {
    const confA = conferenceForSchool(cbsGame.nameA);
    const confB = conferenceForSchool(cbsGame.nameB);
    seed.conferences = [confA, confB].filter(Boolean);
    if (top25) {
      const rankA = top25.get(canonicalSchool(cbsGame.nameA));
      const rankB = top25.get(canonicalSchool(cbsGame.nameB));
      if (rankA) seed.rankA = rankA;
      if (rankB) seed.rankB = rankB;
      if (rankA || rankB) seed.ranked = true;
    }
  }

  return seed;
}

// Real sportsbooks (and so SBD, which aggregates them) open next week's
// lines well before CBS's own odds page catches up -- often by Monday
// morning, sometimes even Sunday. Builds a standalone seed entry straight
// from SBD's data for a game CBS hasn't posted yet, using SBD as the sole
// line source until CBS does.
function buildSbdOnlyGame(sbdEntry, sport, top25, firstSeenMap) {
  if (!sbdEntry.sideA || !sbdEntry.sideB || sbdEntry.spreadCurrent === undefined) return null;
  const matchup = `${sbdEntry.sideA} @ ${sbdEntry.sideB}`;
  const firstSeenTs = firstSeenMap?.get(matchup.toLowerCase());
  const openMeta = firstSeenTs !== undefined ? { openTimestamp: firstSeenTs } : {};

  const seed = {
    matchup,
    sport,
    sideA: sbdEntry.sideA,
    sideB: sbdEntry.sideB,
    lines: [{
      book: 'SBD',
      value: sbdEntry.spreadCurrent,
      ...(sbdEntry.spreadOpen !== undefined ? { open: sbdEntry.spreadOpen } : {}),
      ...openMeta,
    }],
  };
  const kickoff = formatKickoffCentral(sbdEntry.kickoffISO);
  if (kickoff) {
    seed.kickoff = kickoff;
    seed.kickoffTs = Date.parse(sbdEntry.kickoffISO);
  }
  if (sbdEntry.pctAway !== undefined) {
    seed.public = Math.round(sbdEntry.pctAway * 10) / 10;
  }

  if (sport === 'CFB') {
    const confA = conferenceForSchool(sbdEntry.nameA);
    const confB = conferenceForSchool(sbdEntry.nameB);
    seed.conferences = [confA, confB].filter(Boolean);
    if (top25) {
      const rankA = top25.get(canonicalSchool(sbdEntry.nameA));
      const rankB = top25.get(canonicalSchool(sbdEntry.nameB));
      if (rankA) seed.rankA = rankA;
      if (rankB) seed.rankB = rankB;
      if (rankA || rankB) seed.ranked = true;
    }
  }

  return seed;
}

async function run() {
  const allSeeds = [];
  const skipped = [];
  const { firstSeenMap, kickoffMap } = getHistoryMaps();

  for (const source of SOURCES) {
    let cbsGames = [];
    try {
      cbsGames = await fetchCbsOdds(source.oddsUrl, source.sport);
    } catch (e) {
      console.error(`[${source.sport}] odds fetch failed:`, e.message);
      continue;
    }

    let sbdData = null;
    try {
      sbdData = await fetchSbdData(source.sport);
    } catch (e) {
      console.error(`[${source.sport}] SportsBettingDime fetch failed (continuing without public% or its line):`, e.message);
    }

    let cleatzData = null;
    try {
      cleatzData = await fetchHandlePercents(source.sport);
    } catch (e) {
      console.error(`[${source.sport}] Cleatz fetch failed (continuing without handle%):`, e.message);
    }

    let top25 = null;
    let startersOutByTeam = null;
    if (source.sport === 'CFB') {
      try {
        top25 = await fetchTop25();
      } catch (e) {
        console.error('Top 25 rankings fetch failed (continuing without ranked tags):', e.message);
      }
    } else if (source.sport === 'NFL') {
      startersOutByTeam = await fetchStartersOutByTeam(cbsGames);
    }

    for (const g of cbsGames) {
      if (g.spreadCurrent === null) {
        skipped.push(g.matchup);
        continue;
      }
      allSeeds.push(buildSeedGame(g, sbdData, cleatzData, top25, startersOutByTeam, firstSeenMap, kickoffMap));
    }

    if (sbdData) {
      // Only pull in one week's worth from SBD -- not every future week it
      // happens to have odds posted for. Which week depends on how far
      // along *this* week already is: while this week's CBS games are
      // still mostly ahead of us, SBD is only used to fill in whatever
      // this week CBS hasn't posted yet (usually nothing, once CBS has
      // caught up). Only once this week is mostly wrapped up (the Monday-
      // morning gap the whole feature exists for) does the window advance
      // to next week. A fixed "today + 7 days" window would instead creep
      // forward every single day and start pulling in the week after next
      // as soon as "today" rolls past the start of this one.
      const thisWeekStart = weekBucketStart(Date.now());
      const thisWeekEnd = thisWeekStart + 7 * 24 * 60 * 60 * 1000;
      const cbsThisWeek = cbsGames.filter((g) => {
        const t = Date.parse(g.kickoffISO);
        return !Number.isNaN(t) && t >= thisWeekStart && t < thisWeekEnd;
      });
      const finishedRatio = cbsThisWeek.length ? cbsThisWeek.filter((g) => g.score).length / cbsThisWeek.length : 1;
      const windowStart = finishedRatio >= 0.5 ? thisWeekEnd : thisWeekStart;
      const windowEnd = windowStart + 7 * 24 * 60 * 60 * 1000;

      const cbsMatchups = new Set(cbsGames.map((g) => `${g.sideA}@${g.sideB}`));
      let sbdOnlyCount = 0;
      sbdData.entries.forEach((entry) => {
        if (!entry.sideA || !entry.sideB || cbsMatchups.has(`${entry.sideA}@${entry.sideB}`)) return;
        const kickoffTs = entry.kickoffISO ? Date.parse(entry.kickoffISO) : NaN;
        if (Number.isNaN(kickoffTs) || kickoffTs < windowStart || kickoffTs >= windowEnd) return;
        const seed = buildSbdOnlyGame(entry, source.sport, top25, firstSeenMap);
        if (seed) { allSeeds.push(seed); sbdOnlyCount += 1; }
      });
      if (sbdOnlyCount) console.log(`[${source.sport}] added ${sbdOnlyCount} game(s) from SBD not yet on CBS`);
    }
  }

  // Backfill kickoff times for matchups this run has no live data for at
  // all -- e.g. an already-finished game that fell off CBS's page (and
  // wasn't matched by SBD/Cleatz either) before a scraper bug like a
  // school-name mismatch got fixed. `kickoffOnly: true` and an empty
  // `lines` keep these from ever being treated as a brand-new game on the
  // client -- they only patch the kickoff of a game the browser already
  // has stored locally.
  const liveMatchups = new Set(allSeeds.map((s) => s.matchup.toLowerCase()));
  let kickoffPatchCount = 0;
  kickoffMap.forEach((kickoffTs, matchupLower) => {
    if (liveMatchups.has(matchupLower)) return;
    const kickoff = formatKickoffCentral(kickoffTs);
    if (!kickoff) return;
    allSeeds.push({ matchup: matchupLower.toUpperCase(), kickoff, kickoffTs, lines: [], kickoffOnly: true });
    kickoffPatchCount += 1;
  });
  if (kickoffPatchCount) console.log(`Added ${kickoffPatchCount} kickoff-only backfill patch(es) for games no longer live anywhere`);

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(allSeeds, null, 2));

  console.log(`Wrote ${allSeeds.length} games to ${OUT_PATH}`);
  if (skipped.length) console.log(`Skipped (no spread found): ${skipped.join(', ')}`);
}

run().catch((e) => {
  console.error('Fatal error in fetch-odds run:', e);
  process.exit(1);
});
