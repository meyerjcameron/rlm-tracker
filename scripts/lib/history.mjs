import { execFileSync } from 'node:child_process';

// The client can only backfill a game's real open date (or a missing
// kickoff time) from whatever survives in its own localStorage -- when
// that's been wiped (a browser reset, private window, new device, or the
// game simply fell off CBS's live page before a bug like a school-name
// mismatch got fixed), there's nothing left to anchor to. But every
// seed-games.json we've ever written is sitting in this repo's git
// history, which is a durable record no client-side storage loss -- or
// CBS dropping a finished game from its live page -- can touch.
//
// Walks that history once and returns:
//   firstSeenMap -- the real commit date each matchup first appeared with
//                   a spread, so run.mjs can hand the client the true open
//                   date directly instead of leaving it to guess.
//   kickoffMap   -- the real kickoffTs each matchup first appeared with,
//                   so a game whose kickoff time was missing due to a
//                   scraper bug (now fixed) can still get backfilled even
//                   after it's no longer on CBS's live page to re-scrape.
export function getHistoryMaps() {
  const firstSeenMap = new Map();
  const kickoffMap = new Map();
  let log;
  try {
    log = execFileSync('git', ['log', '--reverse', '--format=%H|%cI', '--follow', '--', 'public/seed-games.json'], { encoding: 'utf8' });
  } catch (e) {
    console.error('git log for history backfill failed (continuing without it):', e.message);
    return { firstSeenMap, kickoffMap };
  }

  const commits = log.trim().split('\n').filter(Boolean).map((line) => {
    const [hash, date] = line.split('|');
    return { hash, ts: Date.parse(date) };
  });

  for (const { hash, ts } of commits) {
    let raw;
    try {
      raw = execFileSync('git', ['show', `${hash}:public/seed-games.json`], { encoding: 'utf8' });
    } catch (e) {
      continue; // file didn't exist yet at this commit
    }
    let games;
    try {
      games = JSON.parse(raw);
    } catch (e) {
      continue;
    }
    for (const g of games) {
      const key = g.matchup.toLowerCase();
      const hasSpread = (g.lines || []).some((l) => l.value !== undefined && l.value !== null);
      if (hasSpread && !firstSeenMap.has(key)) firstSeenMap.set(key, ts);
      if (g.kickoffTs != null && !kickoffMap.has(key)) kickoffMap.set(key, g.kickoffTs);
    }
  }

  return { firstSeenMap, kickoffMap };
}
