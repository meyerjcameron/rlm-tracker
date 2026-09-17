import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCbsOdds } from './lib/cbsOdds.mjs';
import { fetchBettingSplits, findSplitForGame } from './lib/sportsBettingDime.mjs';
import { formatKickoffCentral } from './lib/format.mjs';
import { conferenceForSchool } from './lib/conferences.mjs';
import { fetchTop25 } from './lib/rankings.mjs';
import { canonicalSchool } from './lib/schoolNames.mjs';
import { fetchInjuryReport } from './lib/injuries.mjs';
import { fetchStarters } from './lib/depthChart.mjs';
import { getFirstSeenMap } from './lib/history.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'seed-games.json');

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

function buildSeedGame(cbsGame, splits, top25, startersOutByTeam, firstSeenMap) {
  const firstSeenTs = firstSeenMap?.get(cbsGame.matchup.toLowerCase());
  const seed = {
    matchup: cbsGame.matchup,
    sport: cbsGame.sport,
    sideA: cbsGame.sideA,
    sideB: cbsGame.sideB,
    lines: [{
      book: 'CBS',
      value: cbsGame.spreadCurrent,
      // Left undefined (not silently set to spreadCurrent) when CBS's
      // openingLines column didn't parse -- the app treats a confirmed
      // open differently from an unknown one, so this must never look
      // like "open equals current" when we simply don't know the open.
      ...(cbsGame.spreadOpen !== null ? { open: cbsGame.spreadOpen } : {}),
      // The real date this game first got a spread, per this repo's own git
      // history -- lets the client backfill a lost/never-confirmed open to
      // its true date instead of guessing from whatever's left in
      // localStorage (which can be completely wiped for a given browser).
      ...(firstSeenTs !== undefined ? { openTimestamp: firstSeenTs } : {}),
    }],
  };
  const kickoff = formatKickoffCentral(cbsGame.kickoffISO);
  if (kickoff) {
    seed.kickoff = kickoff;
    seed.kickoffTs = Date.parse(cbsGame.kickoffISO);
  }
  if (cbsGame.score) seed.score = cbsGame.score;
  if (splits) {
    const pct = findSplitForGame(splits, cbsGame.sideA, cbsGame.sideB, cbsGame.nameA, cbsGame.nameB);
    if (pct !== null && pct !== undefined) seed.public = Math.round(pct * 10) / 10;
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

async function run() {
  const allSeeds = [];
  const skipped = [];
  const firstSeenMap = getFirstSeenMap();

  for (const source of SOURCES) {
    let cbsGames = [];
    try {
      cbsGames = await fetchCbsOdds(source.oddsUrl, source.sport);
    } catch (e) {
      console.error(`[${source.sport}] odds fetch failed:`, e.message);
      continue;
    }

    let splits = null;
    try {
      splits = await fetchBettingSplits(source.sport);
    } catch (e) {
      console.error(`[${source.sport}] SportsBettingDime fetch failed (continuing without public%):`, e.message);
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
      allSeeds.push(buildSeedGame(g, splits, top25, startersOutByTeam, firstSeenMap));
    }
  }

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(allSeeds, null, 2));

  console.log(`Wrote ${allSeeds.length} games to ${OUT_PATH}`);
  if (skipped.length) console.log(`Skipped (no spread found): ${skipped.join(', ')}`);
}

run().catch((e) => {
  console.error('Fatal error in fetch-odds run:', e);
  process.exit(1);
});
