// The Season Journal used to be computed in each browser from whatever line
// and public% snapshots *that device* happened to capture -- so two devices
// disagreed (the closing line, the latest public majority and the open all
// depend on when each last loaded the game). This builds one canonical,
// frozen result per finished game on the scraper side instead.
//
// public/season-journal.json holds, per game:
//   - while live: the latest known open/current per book and the latest
//     non-null public % (carried forward, so it survives a feed dropping
//     the game after kickoff)
//   - once a score first appears: a finalized entry that is never rewritten.

import { readFile } from 'node:fs/promises';
import { forEachSeedCommit } from './history.mjs';

// Games kicking off before this (Tue of Week 2, Central) aren't part of the
// journal -- Week 1's lines were reconstructed after the fact, not tracked
// live. Matches the client's old WEEK1_BACKFILLED_MATCHUPS exclusion.
const TRACKING_START_TS = Date.parse('2026-09-15T05:00:00Z');

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function finalize(state, score) {
  const { sideA, sideB } = state;
  const lines = Object.values(state.lines);
  if (!lines.length) return null;
  // Same rule as the client's getCombinedStats: only books with a real
  // open-to-current move count toward movement; fall back to all books.
  const moving = lines.filter((l) => l.open !== undefined && l.open !== l.value);
  const movers = moving.length ? moving : lines;
  const openAvg = avg(movers.map((l) => l.open ?? l.value));
  const curAvg = avg(movers.map((l) => l.value));
  const d = curAvg - openAvg;
  const movementSide = d < 0 ? 'A' : d > 0 ? 'B' : null;
  const pct = state.publicPctA;
  const majority = pct === undefined ? null : pct > 50 ? 'A' : pct < 50 ? 'B' : null;
  const isRlm = Boolean(movementSide && majority && movementSide !== majority);

  let result = null;
  if (movementSide) {
    const closeAvg = avg(lines.map((l) => l.value));
    const adjustedA = score.a + closeAvg;
    if (adjustedA === score.b) result = 'push';
    else result = (adjustedA > score.b ? 'A' : 'B') === movementSide ? 'win' : 'loss';
  }

  return {
    final: true,
    sport: state.sport,
    matchup: state.matchup,
    sideA,
    sideB,
    conferences: state.conferences,
    ranked: state.ranked,
    kickoffTs: state.kickoffTs,
    score,
    openAvg,
    closeAvg: avg(lines.map((l) => l.value)),
    publicPctA: pct,
    movementSide,
    publicMajority: majority,
    isRlm,
    sharpSide: movementSide === 'A' ? sideA : movementSide === 'B' ? sideB : null,
    result,
  };
}

// Folds one batch of seed games into the journal. Finalized entries are
// never touched again.
export function updateJournal(journal, seeds) {
  for (const s of seeds) {
    if (s.kickoffOnly || !s.sport || !Array.isArray(s.lines) || !s.lines.length) continue;
    const key = `${s.sport}|${s.matchup}`;
    const prev = journal.games[key];
    if (prev && prev.final) continue;
    if (s.kickoffTs !== undefined && s.kickoffTs < TRACKING_START_TS) continue;

    const state = prev || { sport: s.sport, matchup: s.matchup, sideA: s.sideA, sideB: s.sideB, lines: {} };
    if (s.conferences !== undefined) state.conferences = s.conferences;
    if (s.ranked !== undefined) state.ranked = s.ranked;
    for (const l of s.lines) {
      const before = state.lines[l.book];
      const open = l.open ?? before?.open;
      state.lines[l.book] = { value: l.value, ...(open !== undefined ? { open } : {}) };
    }
    if (s.kickoffTs !== undefined) state.kickoffTs = s.kickoffTs;
    if (s.public !== undefined) state.publicPctA = s.public;

    journal.games[key] = s.score ? (finalize(state, s.score) || state) : state;
  }
  return journal;
}

export async function loadJournal(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (parsed && parsed.games) return { games: parsed.games, existed: true };
  } catch (e) { /* none yet */ }
  return { games: {}, existed: false };
}

// First run only: rebuild from every past seed-games.json commit so games
// that already finished get their frozen entry from the last line/public
// values ever committed for them.
export function replayJournalFromHistory(journal) {
  forEachSeedCommit((games) => updateJournal(journal, games));
  return journal;
}
