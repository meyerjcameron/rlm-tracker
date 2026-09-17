import { execFileSync } from 'node:child_process';

// The client can only backfill a game's real open date from whatever
// survives in its own localStorage -- when that's been wiped (a browser
// reset, private window, new device), there's nothing left to anchor to and
// the backfill falls back to "today". But every seed-games.json we've ever
// written is sitting in this repo's git history, which is a durable record
// no client-side storage loss can touch. This walks that history once and
// returns the real commit date each matchup first appeared with a spread,
// so run.mjs can hand the client the true open date directly instead of
// leaving it to guess.
export function getFirstSeenMap() {
  const map = new Map();
  let log;
  try {
    log = execFileSync('git', ['log', '--reverse', '--format=%H|%cI', '--follow', '--', 'public/seed-games.json'], { encoding: 'utf8' });
  } catch (e) {
    console.error('git log for history backfill failed (continuing without it):', e.message);
    return map;
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
      if (map.has(key)) continue;
      const hasSpread = (g.lines || []).some((l) => l.value !== undefined && l.value !== null);
      if (hasSpread) map.set(key, ts);
    }
  }

  return map;
}
