import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCbsOdds } from './lib/cbsOdds.mjs';
import { fetchBettingSplits, findSplitForGame } from './lib/sportsBettingDime.mjs';
import { formatKickoffCentral } from './lib/format.mjs';
import { conferenceForSchool } from './lib/conferences.mjs';
import { fetchTop25 } from './lib/rankings.mjs';
import { canonicalSchool } from './lib/schoolNames.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'seed-games.json');

const SOURCES = [
  { sport: 'NFL', oddsUrl: 'https://www.cbssports.com/nfl/odds/' },
  { sport: 'CFB', oddsUrl: 'https://www.cbssports.com/college-football/odds/' },
];

function buildSeedGame(cbsGame, splits, top25) {
  const seed = {
    matchup: cbsGame.matchup,
    sport: cbsGame.sport,
    sideA: cbsGame.sideA,
    sideB: cbsGame.sideB,
    lines: [{
      book: 'CBS',
      value: cbsGame.spreadCurrent,
      open: cbsGame.spreadOpen !== null ? cbsGame.spreadOpen : cbsGame.spreadCurrent,
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
    if (source.sport === 'CFB') {
      try {
        top25 = await fetchTop25();
      } catch (e) {
        console.error('Top 25 rankings fetch failed (continuing without ranked tags):', e.message);
      }
    }

    for (const g of cbsGames) {
      if (g.spreadCurrent === null) {
        skipped.push(g.matchup);
        continue;
      }
      allSeeds.push(buildSeedGame(g, splits, top25));
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
