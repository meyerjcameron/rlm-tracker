import React, { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import { Trash2, Flame, TrendingUp, ChevronDown, ChevronRight, X, Flag, Undo2, Sun, Moon } from 'lucide-react';

const MARKETS = [
  { id: 'spread', label: 'Spread' },
  { id: 'moneyline', label: 'Moneyline' },
  { id: 'total', label: 'Total' },
];
const STORAGE_KEY = 'line-tracker:games';
const THEME_KEY = 'line-tracker:theme';

// Seeded from /seed-games.json, which scripts/run.mjs regenerates on a
// schedule by scraping CBS Sports (lines, scores, kickoff times) and
// Covers.com (public consensus %) -- see scripts/README for the pipeline.
// Matched by matchup, so re-seeding never duplicates existing data: it only
// adds missing games/books or appends a new snapshot when a value changed.
const SEED_URL = '/seed-games.json';

// One-time backfill for Week 1 games that finished, then rolled off CBS's
// live odds page entirely before some browsers ever loaded the automated
// pipeline -- those browsers' very first snapshot of these games fell back
// to open===current (0.0 move) because the real open data was gone by the
// time they were first seen. These are the true values, pulled from a git
// history snapshot taken while CBS still listed them. `force: true` makes
// the merge overwrite the existing (wrong) open even though opens are
// otherwise permanent once recorded -- see the merge logic below.
const HISTORICAL_LINE_CORRECTIONS = [
  { matchup: 'DAL @ NYG', force: true, lines: [{ book: 'CBS', value: -3, open: -3 }] },
  { matchup: 'GB @ MIN', force: true, lines: [{ book: 'CBS', value: 2.5, open: 1.5 }] },
  { matchup: 'WAS @ PHI', force: true, lines: [{ book: 'CBS', value: 6, open: 5.5 }] },
  { matchup: 'MIA @ LV', force: true, lines: [{ book: 'CBS', value: 3, open: 3.5 }] },
  { matchup: 'ARI @ LAC', force: true, lines: [{ book: 'CBS', value: 9.5, open: 9.5 }] },
  { matchup: 'TB @ CIN', force: true, lines: [{ book: 'CBS', value: 3.5, open: 3.5 }] },
  { matchup: 'BUF @ HOU', force: true, lines: [{ book: 'CBS', value: -1, open: -1 }] },
  { matchup: 'BAL @ IND', force: true, lines: [{ book: 'CBS', value: -3, open: -3.5 }] },
  { matchup: 'CHI @ CAR', force: true, lines: [{ book: 'CBS', value: -3, open: -3 }] },
  { matchup: 'NO @ DET', force: true, lines: [{ book: 'CBS', value: 7, open: 7 }] },
  { matchup: 'CLE @ JAC', force: true, lines: [{ book: 'CBS', value: 9, open: 8.5 }] },
  { matchup: 'ATL @ PIT', force: true, lines: [{ book: 'CBS', value: 6.5, open: 3.5 }] },
  { matchup: 'NYJ @ TEN', force: true, lines: [{ book: 'CBS', value: 1.5, open: 1.5 }] },
  { matchup: 'SF @ LAR', force: true, lines: [{ book: 'CBS', value: 3.5, open: 3.5 }] },
  { matchup: 'NE @ SEA', force: true, lines: [{ book: 'CBS', value: 3.5, open: 3.5 }] },
];

function impliedProb(odds) {
  const n = Number(odds);
  if (Number.isNaN(n) || n === 0) return 0.5;
  return n < 0 ? -n / (-n + 100) : 100 / (n + 100);
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function roundToHalfPoint(n) {
  return Math.round(n * 2) / 2;
}

function formatValue(market, v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  if (market === 'moneyline' || market === 'spread') return n > 0 ? `+${n}` : `${n}`;
  return `${n}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatShortDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatPct(n) {
  return Math.round(n);
}

function recordWinPct(record) {
  const decided = record.win + record.loss;
  if (!decided) return null;
  return Math.round((record.win / decided) * 100);
}

function formatScore(game) {
  if (!game.score) return null;
  return `${game.sideA} ${game.score.a} - ${game.score.b} ${game.sideB}${game.score.ot ? ' (OT)' : ''}`;
}

function valueLabel(market) {
  if (market === 'moneyline') return 'Odds';
  if (market === 'total') return 'Total';
  return 'Spread';
}

function movementSide(market, openRaw, currentRaw) {
  if (openRaw === undefined || currentRaw === undefined) return null;
  if (market === 'moneyline') {
    const d = impliedProb(currentRaw) - impliedProb(openRaw);
    if (d > 0.001) return 'A';
    if (d < -0.001) return 'B';
    return null;
  }
  const d = currentRaw - openRaw;
  if (market === 'spread') return d < 0 ? 'A' : d > 0 ? 'B' : null;
  return d > 0 ? 'A' : d < 0 ? 'B' : null;
}

function teamForSide(game, side) {
  return side === 'B' ? game.sideB : game.sideA;
}

// Line-history entries are stored as sideA's own raw number -- display them
// the same way the rest of the UI does: anchored to a single side for the
// whole book (whichever team the line is moving toward), so the list reads
// "-5.5 GB" then "-3.5 NYJ" as it moves toward NYJ, rather than flipping to
// whoever is numerically favored at each individual snapshot.
function formatFavoriteValue(game, valueA, side) {
  if (game.market !== 'spread' || valueA === 0) return formatValue(game.market, valueA);
  const display = side === 'B' ? -valueA : valueA;
  return `${formatValue(game.market, display)} ${teamForSide(game, side)}`;
}

function getBookList(game) {
  const seen = [];
  game.lineSnapshots.forEach((s) => { if (!seen.includes(s.book)) seen.push(s.book); });
  return seen;
}

function getBookSnaps(game, book) {
  return game.lineSnapshots.filter((s) => s.book === book).slice().sort((a, b) => a.timestamp - b.timestamp);
}

function bookOpenCurrent(game, book) {
  const snaps = getBookSnaps(game, book);
  if (!snaps.length) return null;
  return { open: snaps[0], current: snaps[snaps.length - 1] };
}

function getBookMovementSide(game, book) {
  const oc = bookOpenCurrent(game, book);
  if (!oc) return null;
  return movementSide(game.market, oc.open.valueA, oc.current.valueA);
}

// Which team a book's line entries should be displayed in terms of --
// the side the line is moving toward, falling back to whoever the flat
// value favors when there's been no movement to anchor to.
function historyLineSide(game, book) {
  const moveSide = getBookMovementSide(game, book);
  if (moveSide) return moveSide;
  const oc = bookOpenCurrent(game, book);
  if (!oc) return 'A';
  return oc.current.valueA <= 0 ? 'A' : 'B';
}

function getCombinedStats(game) {
  const books = getBookList(game);
  if (!books.length) return null;
  if (game.market === 'moneyline') {
    const opens = books.map((b) => impliedProb(bookOpenCurrent(game, b).open.valueA));
    const curs = books.map((b) => impliedProb(bookOpenCurrent(game, b).current.valueA));
    const avgOpen = average(opens);
    const avgCur = average(curs);
    const d = avgCur - avgOpen;
    return {
      openDisplay: `${(avgOpen * 100).toFixed(1)}% implied`,
      currentDisplay: `${(avgCur * 100).toFixed(1)}% implied`,
      movementSide: d > 0.001 ? 'A' : d < -0.001 ? 'B' : null,
      magnitude: Math.abs(d) * 100,
    };
  }
  const opens = books.map((b) => bookOpenCurrent(game, b).open.valueA);
  const curs = books.map((b) => bookOpenCurrent(game, b).current.valueA);
  const avgOpen = average(opens);
  const avgCur = average(curs);
  const d = avgCur - avgOpen;
  let side = null;
  if (game.market === 'spread') side = d < 0 ? 'A' : d > 0 ? 'B' : null;
  else side = d > 0 ? 'A' : d < 0 ? 'B' : null;

  // For spread, always display the number from whichever team the line is
  // currently moving toward -- e.g. a favorite going from -3 to -5 still
  // reads as that favorite's own number, but a favorite shrinking from -6
  // to -4 (line moving toward the underdog) flips to show the underdog's
  // own (positive) number instead, rather than the favorite's shrinking one.
  const displaySide = game.market === 'spread' && side === 'B' ? 'B' : 'A';
  const displayOpen = displaySide === 'B' ? -avgOpen : avgOpen;
  const displayCur = displaySide === 'B' ? -avgCur : avgCur;
  const favoriteSide = game.market === 'spread'
    ? (avgCur < -0.001 ? 'A' : avgCur > 0.001 ? 'B' : null)
    : null;

  return {
    openDisplay: formatValue(game.market, roundToHalfPoint(displayOpen)),
    currentDisplay: formatValue(game.market, roundToHalfPoint(displayCur)),
    displaySide,
    favoriteSide,
    movementSide: side,
    magnitude: Math.abs(d),
    rangeMin: Math.min(...curs),
    rangeMax: Math.max(...curs),
  };
}

function getBookMovementMagnitude(game, book) {
  const oc = bookOpenCurrent(game, book);
  if (!oc) return 0;
  if (game.market === 'moneyline') {
    return Math.abs(impliedProb(oc.current.valueA) - impliedProb(oc.open.valueA)) * 100;
  }
  return Math.abs(oc.current.valueA - oc.open.valueA);
}

function getPublicMajority(game) {
  if (!game.publicSnapshots.length) return null;
  const latest = game.publicSnapshots[game.publicSnapshots.length - 1];
  if (latest.publicPctA > 50) return 'A';
  if (latest.publicPctA < 50) return 'B';
  return null;
}

// Grades the "pick" implied by line movement (whichever side the line moved
// toward) against the spread using the real final score -- no manual W/L/P
// entry needed. This is what feeds the Season Journal's RLM/Chalk record;
// game.result still lets you override a specific game if this ever gets a
// score or line wrong.
function computeAtsResult(game) {
  if (!game.score || game.market !== 'spread') return null;
  const combined = getCombinedStats(game);
  if (!combined || !combined.movementSide) return null;
  const books = getBookList(game);
  if (!books.length) return null;
  const avgClose = average(books.map((b) => bookOpenCurrent(game, b).current.valueA));
  const adjustedA = game.score.a + avgClose;
  if (adjustedA === game.score.b) return 'push';
  const coverSide = adjustedA > game.score.b ? 'A' : 'B';
  return coverSide === combined.movementSide ? 'win' : 'loss';
}

function isFlagged(game, view) {
  const majority = getPublicMajority(game);
  if (!majority) return false;
  const moveSide = view === 'ALL' ? (getCombinedStats(game) || {}).movementSide : getBookMovementSide(game, view);
  return Boolean(moveSide && moveSide !== majority);
}

function gameHasAnyRLM(game) {
  if (isFlagged(game, 'ALL')) return true;
  return getBookList(game).some((b) => isFlagged(game, b));
}

function gameHasLineChange(game) {
  return getBookList(game).some((b) => {
    const oc = bookOpenCurrent(game, b);
    return oc && oc.open.valueA !== oc.current.valueA;
  });
}

function gameMovementMagnitude(game) {
  let max = 0;
  const c = getCombinedStats(game);
  if (c) max = Math.max(max, c.magnitude);
  getBookList(game).forEach((b) => {
    max = Math.max(max, getBookMovementMagnitude(game, b));
  });
  return max;
}

function centralDateKey(ts) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

// Once a calendar day (Central time) is over, collapse that day's snapshots
// down to just the one it closed on -- keeps "History" from piling up dozens
// of same-day re-checks for a game still days away from kickoff.
function compactPastDays(snapshots, groupBy) {
  const todayKey = centralDateKey(Date.now());
  const latestPerPastGroup = new Map();
  const today = [];
  snapshots.forEach((s) => {
    const dateKey = centralDateKey(s.timestamp);
    if (dateKey === todayKey) { today.push(s); return; }
    const key = `${groupBy ? groupBy(s) : ''}|${dateKey}`;
    const existing = latestPerPastGroup.get(key);
    if (!existing || s.timestamp > existing.timestamp) latestPerPastGroup.set(key, s);
  });
  return [...latestPerPastGroup.values(), ...today].sort((a, b) => a.timestamp - b.timestamp);
}

function getHistoryItems(game) {
  const items = [
    ...game.lineSnapshots.map((s) => ({ ...s, kind: 'line' })),
    ...game.publicSnapshots.map((s) => ({ ...s, kind: 'public' })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  // A real line move and its paired public reading (see the merge logic)
  // land at the exact same timestamp and, since every row now shows both
  // line and public% together, render identical text -- keep only one row
  // per timestamp so it doesn't look like a duplicate entry.
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.timestamp}|${historyRowText(game, item)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// A public% row only logs a new line snapshot when the line also moved (see
// the merge logic), so on its own it doesn't say what the line was at that
// check. Carry forward each book's most recent value as of that timestamp
// so every public row still shows the line alongside it.
function lineTextAsOf(game, ts) {
  const books = getBookList(game);
  const parts = books.map((b) => {
    const snap = getBookSnaps(game, b).filter((s) => s.timestamp <= ts).pop();
    if (!snap) return null;
    return `${b}: ${formatFavoriteValue(game, snap.valueA, historyLineSide(game, b))}`;
  }).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

// Same idea in the other direction -- a line-only row otherwise showed no
// public% at all. Carry forward the most recent public reading as of that
// row's timestamp so every row (line or public triggered) shows both.
function publicTextAsOf(game, ts) {
  const snap = game.publicSnapshots.filter((s) => s.timestamp <= ts).sort((a, b) => a.timestamp - b.timestamp).pop();
  if (!snap) return null;
  return `Public: ${formatPct(snap.publicPctA)}% / ${formatPct(100 - snap.publicPctA)}%`;
}

function historyRowText(game, item) {
  const line = lineTextAsOf(game, item.timestamp);
  const pub = publicTextAsOf(game, item.timestamp);
  return [line, pub].filter(Boolean).join(' · ');
}

function migrateGame(g) {
  if (Array.isArray(g.lineSnapshots) && Array.isArray(g.publicSnapshots)) return g;
  const old = g.snapshots || [];
  return {
    ...g,
    lineSnapshots: old.map((s, i) => ({ id: s.id || `mig_l_${i}_${g.id}`, book: 'Original', timestamp: s.timestamp, valueA: s.valueA })),
    publicSnapshots: old.map((s, i) => ({ id: s.id ? `p_${s.id}` : `mig_p_${i}_${g.id}`, timestamp: s.timestamp, publicPctA: s.publicPctA })),
  };
}

export default function LineMovementTracker() {
  const [games, setGames] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [onlyRLM, setOnlyRLM] = useState(false);
  const [sportTab, setSportTab] = useState('NFL');
  const [cfbFilter, setCfbFilter] = useState('ALL');
  const [expanded, setExpanded] = useState({});
  const [injuryExpanded, setInjuryExpanded] = useState({});
  const [selectedView, setSelectedView] = useState({});
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  function toggleTheme() {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* noop */ }
      return next;
    });
  }

  useEffect(() => {
    (async () => {
    let SEED_GAMES = [];
    try {
      const res = await fetch(SEED_URL, { cache: 'no-store' });
      if (res.ok) SEED_GAMES = await res.json();
    } catch (e) {
      // seed file unreachable (e.g. offline) -- fall back to whatever's already stored
    }
    const liveKeys = new Set(SEED_GAMES.map((s) => s.matchup.toLowerCase()));
    SEED_GAMES = [...SEED_GAMES, ...HISTORICAL_LINE_CORRECTIONS.filter((c) => !liveKeys.has(c.matchup.toLowerCase()))];

    let current = [];
    let migrated = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        current = parsed.map((g) => {
          const m = migrateGame(g);
          if (m !== g) migrated = true;
          return m;
        });
      }
    } catch (e) {
      // nothing saved yet, or it was corrupt — start fresh
    }

    const existingKeys = new Set(current.map((g) => g.matchup.toLowerCase()));
    // Corrections only carry a matchup + lines (no sideA/sideB/sport/etc), so
    // they must never be used to create a brand-new game -- only to patch
    // one that's already being tracked.
    const correctionKeys = new Set(HISTORICAL_LINE_CORRECTIONS.map((c) => c.matchup.toLowerCase()));
    const toAdd = SEED_GAMES.filter((s) => !existingKeys.has(s.matchup.toLowerCase()) && !correctionKeys.has(s.matchup.toLowerCase()));
    const now = Date.now();
    let changed = false;

    // When a game's own history has nothing older to anchor a backfilled
    // open to (its earlier snapshots were themselves lost to the same
    // corruption), fall back to the earliest timestamp seen anywhere in the
    // browser's data -- everything started being tracked around the same
    // time, so that's a far better guess than "just now".
    const globalEarliestTs = current.reduce((min, g) => {
      const ts = [...g.lineSnapshots, ...g.publicSnapshots].map((s) => s.timestamp);
      return ts.length ? Math.min(min, ...ts) : min;
    }, now);

    const buildBookSnapshots = (line, uid) => {
      // line.openTimestamp (when the seed provides it) is the real date this
      // game first got a spread, per the repo's own git history -- use it
      // instead of "now" so a brand-new local record (e.g. this browser
      // never saw this game before) still shows the true start date rather
      // than looking like it just appeared this instant.
      if (line.open !== undefined && line.open !== line.value) {
        return [
          { id: `l_seed_${now}_${uid}_o`, book: line.book, timestamp: line.openTimestamp ?? (now - 1), valueA: line.open },
          { id: `l_seed_${now}_${uid}_c`, book: line.book, timestamp: now, valueA: line.value },
        ];
      }
      // No separate open to show (never moved, or CBS didn't report one) --
      // anchor the single snapshot to the real first-seen date so a flat
      // line doesn't look like it opened today either.
      return [{ id: `l_seed_${now}_${uid}_c`, book: line.book, timestamp: line.openTimestamp ?? now, valueA: line.value }];
    };

    const withUpdates = current.map((g) => {
      const seed = SEED_GAMES.find((s) => s.matchup.toLowerCase() === g.matchup.toLowerCase());
      if (!seed) return g;
      let next = g;

      // Public% drifts a little on almost every run even when the line hasn't
      // moved at all, which used to flood History with far more "Public"
      // rows than line-change rows for the same stretch of time. Only grow
      // history with a new public row when it lands alongside a real line
      // move (or starts a new day) -- a same-day reading with no line move
      // just updates today's existing row in place, so the displayed %
      // stays current without piling up noise entries.
      const lineWillChange = seed.lines.some((line) => {
        const bookSnaps = next.lineSnapshots.filter((s) => s.book === line.book).sort((a, b) => a.timestamp - b.timestamp);
        return !bookSnaps.length || line.value !== bookSnaps[bookSnaps.length - 1].valueA;
      });

      if (seed.public !== undefined) {
        const publicSnaps = next.publicSnapshots;
        const latestPublic = publicSnaps[publicSnaps.length - 1];
        if (!latestPublic || latestPublic.publicPctA !== seed.public) {
          changed = true;
          const sameDayNoLineMove = latestPublic
            && centralDateKey(latestPublic.timestamp) === centralDateKey(now)
            && !lineWillChange;
          next = {
            ...next,
            publicSnapshots: sameDayNoLineMove
              ? [...publicSnaps.slice(0, -1), { ...latestPublic, timestamp: now, publicPctA: seed.public }]
              : [...publicSnaps, { id: `p_seed_${now}_${next.id}`, timestamp: now, publicPctA: seed.public }],
          };
        }
      }

      if (seed.kickoff !== undefined && next.kickoff !== seed.kickoff) {
        changed = true;
        next = { ...next, kickoff: seed.kickoff, kickoffTs: seed.kickoffTs };
      }

      if (seed.conferences !== undefined && JSON.stringify(next.conferences) !== JSON.stringify(seed.conferences)) {
        changed = true;
        next = { ...next, conferences: seed.conferences };
      }

      if (!!seed.ranked !== !!next.ranked) {
        changed = true;
        next = { ...next, ranked: !!seed.ranked };
      }

      if (seed.rankA !== next.rankA || seed.rankB !== next.rankB) {
        changed = true;
        next = { ...next, rankA: seed.rankA, rankB: seed.rankB };
      }

      if (JSON.stringify(seed.injuriesA) !== JSON.stringify(next.injuriesA) || JSON.stringify(seed.injuriesB) !== JSON.stringify(next.injuriesB)) {
        changed = true;
        next = { ...next, injuriesA: seed.injuriesA, injuriesB: seed.injuriesB };
      }

      if (seed.score !== undefined && !next.finished) {
        changed = true;
        next = { ...next, score: seed.score, finished: true, finishedAt: now };
      }

      seed.lines.forEach((line, li) => {
        const bookSnaps = next.lineSnapshots.filter((s) => s.book === line.book).sort((a, b) => a.timestamp - b.timestamp);
        const otherSnaps = next.lineSnapshots.filter((s) => s.book !== line.book);

        if (bookSnaps.length === 0) {
          changed = true;
          next = { ...next, lineSnapshots: [...next.lineSnapshots, ...buildBookSnapshots(line, `${next.id}_${li}`)] };
          return;
        }

        if (seed.force && (bookSnaps[0].valueA !== (line.open ?? line.value) || bookSnaps[bookSnaps.length - 1].valueA !== line.value)) {
          // Explicit one-time correction (see HISTORICAL_LINE_CORRECTIONS) --
          // overwrites even a previously "permanent" open.
          changed = true;
          next = { ...next, lineSnapshots: [...otherSnaps, ...buildBookSnapshots(line, `${next.id}_fix_${li}`)] };
          return;
        }

        // Once a book has a real, confirmed open (2+ snapshots), it's
        // permanent -- CBS's own computed "opening" figure can drift
        // slightly run to run, and treating that drift as a real
        // correction was wiping out true open dates on noise.
        //
        // But if this book still only has ONE snapshot, that single value
        // was never a confirmed open -- it's whatever "current" happened to
        // be the first time we saw this book (CBS's opening column can come
        // back empty/unparseable, in which case no "open" is sent at all --
        // see run.mjs). If the seed now offers a genuine, different open,
        // backfill it as the true one instead of leaving it permanently
        // stuck looking like zero movement.
        let updatedBookSnaps = bookSnaps;
        if (bookSnaps.length === 1 && line.open != null && line.open !== bookSnaps[0].valueA) {
          // bookSnaps[0].timestamp is when this single (wrong) snapshot was
          // recorded, not when we actually started tracking the game.
          // line.openTimestamp (from run.mjs's own git-history lookup) is
          // the real date -- durable even if this browser's localStorage
          // has nothing left to anchor to. Fall back to the earliest
          // timestamp already on record locally (or across the whole
          // dataset) only for older seeds that predate that field.
          const knownTimestamps = [
            ...next.lineSnapshots.map((s) => s.timestamp),
            ...next.publicSnapshots.map((s) => s.timestamp),
            globalEarliestTs,
          ];
          const earliestKnown = line.openTimestamp ?? Math.min(...knownTimestamps);
          const openSnap = { id: `l_backfill_${now}_${next.id}_${li}`, book: line.book, timestamp: earliestKnown - 1, valueA: line.open };
          updatedBookSnaps = [openSnap, ...bookSnaps];
        }

        const recordedCurrent = updatedBookSnaps[updatedBookSnaps.length - 1];
        if (line.value !== recordedCurrent.valueA) {
          updatedBookSnaps = [...updatedBookSnaps, { id: `l_upd_${now}_${next.id}_${li}`, book: line.book, timestamp: now, valueA: line.value }];
        }

        if (updatedBookSnaps !== bookSnaps) {
          changed = true;
          next = { ...next, lineSnapshots: [...otherSnaps, ...updatedBookSnaps] };
        }
      });

      return next;
    });

    let finalList = withUpdates;
    if (toAdd.length) {
      const seeded = toAdd.map((s, i) => ({
        id: `g_seed_${now}_${i}`,
        matchup: s.matchup,
        sport: s.sport,
        market: 'spread',
        sideA: s.sideA,
        sideB: s.sideB,
        kickoff: s.kickoff,
        kickoffTs: s.kickoffTs,
        conferences: s.conferences,
        ranked: !!s.ranked,
        rankA: s.rankA,
        rankB: s.rankB,
        injuriesA: s.injuriesA,
        injuriesB: s.injuriesB,
        score: s.score,
        finished: s.score !== undefined,
        finishedAt: s.score !== undefined ? now : undefined,
        lineSnapshots: s.lines.flatMap((line, li) => buildBookSnapshots(line, `${i}_${li}`)),
        publicSnapshots: s.public !== undefined ? [{ id: `p_seed_${now}_${i}`, timestamp: now, publicPctA: s.public }] : [],
      }));
      finalList = [...seeded, ...withUpdates];
    }

    // Drop unfinished games that no longer appear in the current seed list
    // (e.g. a game that fell out of scope after a filter change like the
    // CFB Power-4 restriction). Finished games are historical record and
    // are never pruned, even if the source stops listing them.
    if (SEED_GAMES.length) {
      const seedKeys = new Set(SEED_GAMES.map((s) => s.matchup.toLowerCase()));
      const beforeCount = finalList.length;
      finalList = finalList.filter((g) => g.finished || seedKeys.has(g.matchup.toLowerCase()));
      if (finalList.length !== beforeCount) changed = true;
    }

    finalList = finalList.map((g) => {
      const compactedLines = compactPastDays(g.lineSnapshots, (s) => s.book);
      const compactedPublic = compactPastDays(g.publicSnapshots);
      if (compactedLines.length === g.lineSnapshots.length && compactedPublic.length === g.publicSnapshots.length) return g;
      changed = true;
      return { ...g, lineSnapshots: compactedLines, publicSnapshots: compactedPublic };
    });

    setGames(finalList);
    setLoaded(true);
    if (migrated || toAdd.length || changed) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(finalList));
      } catch (e) { /* noop */ }
    }
    })();
  }, []);

  function persist(updated) {
    setGames(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }

  function deleteGame(gameId) {
    persist(games.filter((g) => g.id !== gameId));
  }

  function markGameFinished(gameId) {
    const updated = games.map((g) => (g.id === gameId ? { ...g, finished: true, finishedAt: Date.now() } : g));
    persist(updated);
  }

  function reopenGame(gameId) {
    const updated = games.map((g) => (g.id === gameId ? { ...g, finished: false, finishedAt: undefined, result: undefined } : g));
    persist(updated);
  }

  function setGameResult(gameId, result) {
    const updated = games.map((g) => (g.id === gameId ? { ...g, result: g.result === result ? undefined : result } : g));
    persist(updated);
  }

  function deleteLineSnapshot(gameId, snapId) {
    const updated = games.map((g) => {
      if (g.id !== gameId) return g;
      return { ...g, lineSnapshots: g.lineSnapshots.filter((s) => s.id !== snapId) };
    });
    persist(updated);
  }

  function deletePublicSnapshot(gameId, snapId) {
    const updated = games.map((g) => {
      if (g.id !== gameId) return g;
      return { ...g, publicSnapshots: g.publicSnapshots.filter((s) => s.id !== snapId) };
    });
    persist(updated);
  }

  const CFB_TABS = ['ALL', 'Top 25', 'SEC', 'Big Ten', 'ACC', 'Big 12'];
  const matchesCfbFilter = (g) => {
    if (sportTab !== 'CFB' || cfbFilter === 'ALL') return true;
    if (cfbFilter === 'Top 25') return !!g.ranked;
    return Array.isArray(g.conferences) && g.conferences.includes(cfbFilter);
  };

  const bySport = games.filter((g) => g.sport === sportTab && matchesCfbFilter(g));
  const liveGames = bySport.filter((g) => !g.finished);
  const finishedGames = [...bySport.filter((g) => g.finished)].sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));

  // Season journal: every finished game with a real line movement and a
  // known public side gets bucketed as RLM (the line moved against the
  // public) or Chalk (the line moved with the public) -- games with no
  // movement, or no public data, can't be classified either way and are
  // left out of both records. Graded automatically off the final score
  // (computeAtsResult); g.result only overrides a specific game if that
  // ever needs a manual correction.
  const rlmRecord = { win: 0, loss: 0, push: 0 };
  const chalkRecord = { win: 0, loss: 0, push: 0 };
  finishedGames.forEach((g) => {
    const result = g.result ?? computeAtsResult(g);
    if (!result) return;
    const combined = getCombinedStats(g);
    const majority = getPublicMajority(g);
    if (!combined || !combined.movementSide || !majority) return;
    const bucket = combined.movementSide !== majority ? rlmRecord : chalkRecord;
    bucket[result] += 1;
  });
  let filteredGames = liveGames;
  if (onlyChanged) filteredGames = filteredGames.filter(gameHasLineChange);
  if (onlyRLM) filteredGames = filteredGames.filter((g) => isFlagged(g, 'ALL'));
  const visibleGames = [...filteredGames].sort((a, b) => {
    if (onlyChanged || onlyRLM) return gameMovementMagnitude(b) - gameMovementMagnitude(a);
    if (a.kickoffTs == null && b.kickoffTs == null) return 0;
    if (a.kickoffTs == null) return 1;
    if (b.kickoffTs == null) return -1;
    return a.kickoffTs - b.kickoffTs;
  });
  const lineChangeCount = liveGames.filter(gameHasLineChange).length;
  const rlmCount = liveGames.filter((g) => isFlagged(g, 'ALL')).length;

  return (
    <div className={`rlmw-root ${theme === 'light' ? 'rlmw-light' : ''}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .rlmw-root {
          --bg:#0D1117; --text:#ECEFF4; --muted:#8993A4; --faint:#586173; --border:#2B3340;
          --card-bg:#161B22; --input-bg:#1D232C; --final-bg:#12161C;
          --accent:#D4A72C; --accent-hover:#e0b53d; --accent-bg:#241F14; --accent-contrast:#0D1117;
          --green:#34C77B; --green-bg:#12241C; --green-border:#1F3B2C;
          --blue:#6FA3C7; --blue-bg:#122430; --blue-border:#1E3A4D; --blue-strong:#4C7A9A;
          --red:#C65B4E; --red-bg:#241414; --injury-text:#e08a8a;
          background:var(--bg); color:var(--text); min-height:100vh; font-family:'IBM Plex Sans', sans-serif; padding: 32px 24px 64px; box-sizing:border-box;
        }
        .rlmw-root.rlmw-light {
          --bg:#F3F5F8; --text:#151A21; --muted:#5B6472; --faint:#939AA8; --border:#DCE2E9;
          --card-bg:#FFFFFF; --input-bg:#EEF1F5; --final-bg:#F7F9FB;
          --accent:#A6790A; --accent-hover:#8f6708; --accent-bg:#FBF1D8; --accent-contrast:#0D1117;
          --green:#1B8F55; --green-bg:#E4F6EC; --green-border:#BEE7D3;
          --blue:#3D74A0; --blue-bg:#E7F1F8; --blue-border:#C7DEEC; --blue-strong:#3D74A0;
          --red:#B23A2C; --red-bg:#FBEAE7; --injury-text:#B23B3B;
        }
        .rlmw-root * { box-sizing:border-box; }
        .rlmw-header-row { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
        .rlmw-theme-toggle { background:var(--card-bg); border:1px solid var(--border); color:var(--text); width:38px; height:38px; border-radius:999px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
        .rlmw-theme-toggle:hover { border-color:var(--accent); color:var(--accent); }
        .rlmw-title { font-family:'Bebas Neue', sans-serif; font-size:42px; letter-spacing:0.5px; line-height:1; margin:0; font-weight:400; }
        .rlmw-sub { color:var(--muted); font-size:14px; margin-top:8px; max-width:560px; line-height:1.5; }
        .rlmw-sport-tabs { display:flex; gap:4px; margin-top:24px; border-bottom:1px solid var(--border); }
        .rlmw-sport-tab { padding:8px 16px; font-size:13px; font-weight:600; color:var(--muted); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
        .rlmw-sport-tab.active { color:var(--text); border-bottom-color:var(--accent); }
        .rlmw-cfb-tabs { display:flex; gap:6px; margin-top:12px; flex-wrap:wrap; }
        .rlmw-cfb-tab { padding:5px 12px; font-size:12px; font-weight:600; color:var(--muted); cursor:pointer; border:1px solid var(--border); border-radius:999px; background:var(--card-bg); }
        .rlmw-cfb-tab.active { color:var(--accent-contrast); background:var(--accent); border-color:var(--accent); }
        .rlmw-toolbar { display:flex; align-items:center; gap:12px; margin-top:16px; flex-wrap:wrap; }
        .rlmw-btn-primary { background:var(--accent); color:var(--accent-contrast); border:none; padding:10px 16px; border-radius:6px; font-weight:600; font-size:14px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-family:inherit; }
        .rlmw-btn-primary:hover { background:var(--accent-hover); }
        .rlmw-btn-secondary { background:transparent; border:1px solid var(--border); color:var(--text); padding:9px 14px; border-radius:6px; font-size:14px; cursor:pointer; font-family:inherit; }
        .rlmw-btn-secondary:hover { border-color:var(--faint); }
        .rlmw-pill-toggle { display:inline-flex; align-items:center; gap:8px; font-size:13px; color:var(--green); cursor:pointer; user-select:none; padding:8px 14px; border:1px solid var(--green-border); border-radius:999px; }
        .rlmw-pill-toggle.active { border-color:var(--green); background:var(--green-bg); }
        .rlmw-pill-toggle--blue { color:var(--blue); border-color:var(--blue-border); }
        .rlmw-pill-toggle--blue.active { border-color:var(--blue); background:var(--blue-bg); }
        .rlmw-light .rlmw-pill-toggle { background:var(--green-bg); }
        .rlmw-light .rlmw-pill-toggle--blue { background:var(--blue-bg); }
        .rlmw-panel { background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:20px; margin-top:20px; max-width:640px; }
        .rlmw-field-row { display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
        .rlmw-field { flex:1; min-width:140px; display:flex; flex-direction:column; gap:6px; }
        .rlmw-field label { font-size:12px; color:var(--muted); }
        .rlmw-input, .rlmw-select { background:var(--input-bg); border:1px solid var(--border); color:var(--text); padding:9px 10px; border-radius:6px; font-size:14px; font-family:inherit; width:100%; }
        .rlmw-input:focus, .rlmw-select:focus { outline:2px solid var(--accent); outline-offset:1px; border-color:var(--accent); }
        .rlmw-input-mono { font-family:'IBM Plex Mono', monospace; }
        .rlmw-market-toggle { display:flex; gap:8px; }
        .rlmw-market-btn { flex:1; padding:9px; text-align:center; border:1px solid var(--border); background:var(--input-bg); color:var(--muted); border-radius:6px; cursor:pointer; font-size:13px; font-family:inherit; }
        .rlmw-market-btn.active { border-color:var(--accent); color:var(--accent); background:var(--accent-bg); }
        .rlmw-panel-actions { display:flex; gap:10px; margin-top:6px; }
        .rlmw-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px; margin-top:24px; }
        .rlmw-card { background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:18px; display:flex; flex-direction:column; gap:12px; }
        .rlmw-card.flagged { border-color:var(--green); }
        .rlmw-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
        .rlmw-matchup { font-family:'Bebas Neue', sans-serif; font-size:22px; letter-spacing:0.3px; line-height:1.1; display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; }
        .rlmw-matchup-at { font-family:'IBM Plex Sans', sans-serif; font-size:14px; color:var(--faint); font-weight:400; }
        .rlmw-rank { font-family:'IBM Plex Mono', monospace; font-size:11px; font-weight:700; color:var(--accent-contrast); background:var(--accent); padding:1px 5px; border-radius:4px; letter-spacing:0; }
        .rlmw-meta { color:var(--muted); font-size:12.5px; margin-top:3px; }
        .rlmw-kickoff { color:var(--accent); font-size:11.5px; margin-top:4px; font-family:'IBM Plex Mono', monospace; }
        .rlmw-icon-btn { background:transparent; border:none; color:var(--faint); cursor:pointer; padding:4px; border-radius:4px; flex-shrink:0; }
        .rlmw-icon-btn:hover { color:var(--red); background:var(--input-bg); }
        .rlmw-flag { display:flex; align-items:flex-start; gap:8px; background:var(--green-bg); border:1px solid var(--green-border); color:var(--green); padding:10px 12px; border-radius:6px; font-size:13px; line-height:1.45; }
        .rlmw-flag svg { flex-shrink:0; margin-top:1px; }
        .rlmw-injury-report .rlmw-history-row { color:var(--injury-text); }
        .rlmw-book-pills { display:flex; gap:6px; flex-wrap:wrap; }
        .rlmw-book-pill { font-size:12px; padding:5px 10px; border-radius:999px; border:1px solid var(--border); background:var(--input-bg); color:var(--muted); cursor:pointer; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; font-family:inherit; }
        .rlmw-book-pill.active { border-color:var(--accent); color:var(--accent); background:var(--accent-bg); }
        .rlmw-stats { display:flex; gap:8px; align-items:center; }
        .rlmw-stat { flex:1; background:var(--input-bg); border-radius:6px; padding:10px 12px; }
        .rlmw-stat-label { font-size:11px; color:var(--muted); margin-bottom:4px; }
        .rlmw-stat-value { font-family:'IBM Plex Mono', monospace; font-size:16px; font-weight:600; }
        .rlmw-stat-date { font-size:10.5px; color:var(--faint); margin-top:2px; }
        .rlmw-stat-move { font-size:10.5px; color:var(--green); margin-top:2px; }
        .rlmw-arrow { color:var(--faint); flex-shrink:0; }
        .rlmw-chart-wrap { height:90px; margin-top:-4px; }
        .rlmw-chart-empty { height:70px; display:flex; align-items:center; justify-content:center; color:var(--faint); font-size:12px; border:1px dashed var(--border); border-radius:6px; text-align:center; padding:0 12px; }
        .rlmw-book-rows { display:flex; flex-direction:column; gap:6px; }
        .rlmw-book-row { display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); border-radius:6px; padding:8px 10px; font-size:13px; gap:8px; }
        .rlmw-book-row-name { display:flex; align-items:center; gap:6px; font-weight:500; min-width:0; }
        .rlmw-book-row-name span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .rlmw-book-row-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
        .rlmw-book-row-value { font-family:'IBM Plex Mono', monospace; }
        .rlmw-book-row-delta { font-size:10.5px; color:var(--faint); }
        .rlmw-range-note { font-size:11.5px; color:var(--muted); }
        .rlmw-favorite { font-size:11.5px; color:var(--accent); font-weight:600; letter-spacing:0.2px; }
        .rlmw-public-source { font-size:10.5px; color:var(--faint); margin-bottom:6px; }
        .rlmw-splitbar-labels { display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px; }
        .rlmw-splitbar { height:8px; border-radius:4px; overflow:hidden; display:flex; background:var(--input-bg); }
        .rlmw-splitbar-a { background:var(--blue-strong); height:100%; }
        .rlmw-splitbar-b { background:var(--faint); height:100%; }
        .rlmw-side-label.majority { color:var(--text); font-weight:600; }
        .rlmw-side-label { color:var(--muted); }
        .rlmw-history-toggle { background:none; border:none; color:var(--muted); font-size:12.5px; cursor:pointer; display:flex; align-items:center; gap:4px; padding:2px 0; align-self:flex-start; font-family:inherit; }
        .rlmw-history { border-top:1px solid var(--border); padding-top:10px; display:flex; flex-direction:column; gap:6px; }
        .rlmw-final-history { border-top:none; padding:10px 12px; background:var(--final-bg); }
        .rlmw-history-row { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--muted); font-family:'IBM Plex Mono', monospace; gap:8px; }
        .rlmw-history-row .rlmw-icon-btn { padding:2px; }
        .rlmw-empty { border:1px dashed var(--border); border-radius:8px; padding:48px 24px; text-align:center; color:var(--muted); margin-top:24px; max-width:480px; }
        .rlmw-empty h3 { color:var(--text); font-family:'Bebas Neue', sans-serif; font-size:24px; margin:0 0 8px; letter-spacing:0.3px; font-weight:400; }
        .rlmw-save-error { color:var(--red); font-size:12px; margin-top:10px; }
        .rlmw-sport-tag { font-size:11px; color:var(--muted); border:1px solid var(--border); padding:2px 7px; border-radius:4px; white-space:nowrap; }
        .rlmw-journal { margin-top:36px; max-width:520px; }
        .rlmw-journal-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        .rlmw-journal-card { background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:16px; border-top-width:3px; border-top-style:solid; }
        .rlmw-journal-card--rlm { border-top-color:var(--green); }
        .rlmw-journal-card--chalk { border-top-color:var(--blue-strong); }
        .rlmw-journal-label { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; }
        .rlmw-journal-record { font-family:'IBM Plex Mono', monospace; font-size:24px; font-weight:700; color:var(--text); }
        .rlmw-journal-pct { font-size:12px; color:var(--muted); margin-top:4px; }
        .rlmw-final-section { margin-top:36px; max-width:760px; }
        .rlmw-final-heading { font-family:'Bebas Neue', sans-serif; font-size:20px; letter-spacing:0.3px; color:var(--muted); margin-bottom:10px; }
        .rlmw-final-table-wrap { overflow-x:auto; border:1px solid var(--border); border-radius:8px; }
        .rlmw-final-table { width:100%; border-collapse:collapse; font-size:13px; }
        .rlmw-final-table th { text-align:left; color:var(--muted); font-weight:600; font-size:10.5px; text-transform:uppercase; letter-spacing:0.4px; padding:10px 12px; border-bottom:1px solid var(--border); background:var(--card-bg); white-space:nowrap; }
        .rlmw-final-table td { padding:10px 12px; border-bottom:1px solid var(--input-bg); vertical-align:middle; white-space:nowrap; }
        .rlmw-final-table tr:last-child td { border-bottom:none; }
        .rlmw-final-game-name { font-weight:600; }
        .rlmw-final-side { font-size:11px; color:var(--faint); margin-top:2px; }
        .rlmw-mono { font-family:'IBM Plex Mono', monospace; }
        .rlmw-result-pills { display:flex; gap:4px; }
        .rlmw-result-pill { width:26px; height:26px; border-radius:4px; border:1px solid var(--border); background:var(--input-bg); color:var(--muted); font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; }
        .rlmw-result-pill.active-win { background:var(--green-bg); border-color:var(--green); color:var(--green); }
        .rlmw-result-pill.active-loss { background:var(--red-bg); border-color:var(--red); color:var(--red); }
        .rlmw-result-pill.active-push { background:var(--input-bg); border-color:var(--muted); color:var(--text); }
      `}</style>

      <div className="rlmw-header-row">
        <div>
          <div className="rlmw-title">RLM Tracker</div>
          <div className="rlmw-sub">
            Log lines from multiple sportsbooks per game alongside the public bet split. View them combined,
            or switch to a single book to see its own movement. Flags a game when the line moves against
            the side the public is backing.
          </div>
        </div>
        <button className="rlmw-theme-toggle" onClick={toggleTheme} aria-label="Toggle light/dark theme">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div className="rlmw-sport-tabs">
        {['NFL', 'CFB'].map((s) => (
          <div
            key={s}
            className={`rlmw-sport-tab ${sportTab === s ? 'active' : ''}`}
            onClick={() => setSportTab(s)}
          >
            {s}
          </div>
        ))}
      </div>

      {sportTab === 'CFB' && (
        <div className="rlmw-cfb-tabs">
          {CFB_TABS.map((c) => (
            <div
              key={c}
              className={`rlmw-cfb-tab ${cfbFilter === c ? 'active' : ''}`}
              onClick={() => setCfbFilter(c)}
            >
              {c}
            </div>
          ))}
        </div>
      )}

      <div className="rlmw-toolbar">
        {liveGames.length > 0 && (
          <>
            <div
              className={`rlmw-pill-toggle rlmw-pill-toggle--blue ${onlyChanged ? 'active' : ''}`}
              onClick={() => setOnlyChanged((v) => !v)}
            >
              <TrendingUp size={14} /> {lineChangeCount} of {liveGames.length} showing a line change
            </div>
            <div
              className={`rlmw-pill-toggle ${onlyRLM ? 'active' : ''}`}
              onClick={() => setOnlyRLM((v) => !v)}
            >
              <Flame size={14} /> {rlmCount} of {liveGames.length} showing RLM
            </div>
          </>
        )}
      </div>

      {loaded && bySport.length === 0 && (
        <div className="rlmw-empty">
          <h3>No {sportTab} lines logged yet</h3>
          <div>Log your first line to start tracking movement against the public.</div>
        </div>
      )}

      {saveError && <div className="rlmw-save-error">Couldn't save — your last change may not persist.</div>}

      <div className="rlmw-grid">
        {visibleGames.map((game) => {
          const books = getBookList(game);
          const view = selectedView[game.id] || 'ALL';
          const flagged = isFlagged(game, view);
          const majority = getPublicMajority(game);
          const publicLatest = game.publicSnapshots[game.publicSnapshots.length - 1];
          const isExpanded = !!expanded[game.id];

          const combined = getCombinedStats(game);
          const bookOC = view !== 'ALL' ? bookOpenCurrent(game, view) : null;
          const bookSnaps = view !== 'ALL' ? getBookSnaps(game, view) : [];
          const bookMoveSide = bookOC && game.market === 'spread'
            ? movementSide(game.market, bookOC.open.valueA, bookOC.current.valueA) : null;
          const bookDisplaySide = bookMoveSide === 'B' ? 'B' : 'A';
          const bookSign = bookDisplaySide === 'B' ? -1 : 1;
          const bookFavoriteSide = bookOC && game.market === 'spread'
            ? (bookOC.current.valueA < -0.001 ? 'A' : bookOC.current.valueA > 0.001 ? 'B' : null)
            : null;
          const chartData = bookSnaps.map((s) => ({
            v: game.market === 'moneyline' ? Number((impliedProb(s.valueA) * 100).toFixed(1)) : bookSign * s.valueA,
            timestamp: s.timestamp,
          }));

          const historyItems = getHistoryItems(game);

          return (
            <div key={game.id} className={`rlmw-card ${flagged ? 'flagged' : ''}`}>
              <div className="rlmw-card-top">
                <div>
                  <div className="rlmw-matchup">
                    {game.rankA && <span className="rlmw-rank">#{game.rankA}</span>}
                    {game.sideA}
                    <span className="rlmw-matchup-at">@</span>
                    {game.rankB && <span className="rlmw-rank">#{game.rankB}</span>}
                    {game.sideB}
                  </div>
                  <div className="rlmw-meta">
                    {MARKETS.find((m) => m.id === game.market).label} · {game.sideA} vs {game.sideB}
                  </div>
                  {game.kickoff && <div className="rlmw-kickoff">{game.kickoff}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="rlmw-sport-tag">{game.sport}</span>
                  <button className="rlmw-icon-btn" onClick={() => markGameFinished(game.id)} aria-label="Mark game final">
                    <Flag size={15} />
                  </button>
                  <button className="rlmw-icon-btn" onClick={() => deleteGame(game.id)} aria-label="Delete game">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="rlmw-book-pills">
                <div
                  className={`rlmw-book-pill ${view === 'ALL' ? 'active' : ''}`}
                  onClick={() => setSelectedView((p) => ({ ...p, [game.id]: 'ALL' }))}
                >
                  All books
                </div>
                {books.map((b) => (
                  <div
                    key={b}
                    className={`rlmw-book-pill ${view === b ? 'active' : ''}`}
                    onClick={() => setSelectedView((p) => ({ ...p, [game.id]: b }))}
                  >
                    {isFlagged(game, b) && <Flame size={11} color="var(--green)" />}
                    {b}
                  </div>
                ))}
              </div>

              {flagged && (
                <div className="rlmw-flag">
                  <Flame size={15} />
                  <span>
                    {majority === 'A' ? game.sideA : game.sideB} has the public majority, but{' '}
                    {view === 'ALL' ? 'the consensus line' : view} moved toward{' '}
                    {(view === 'ALL' ? combined.movementSide : getBookMovementSide(game, view)) === 'A' ? game.sideA : game.sideB}.
                  </span>
                </div>
              )}


              {view === 'ALL' ? (
                <>
                  {game.market === 'spread' && (
                    <div className="rlmw-favorite">
                      {combined.favoriteSide ? `${teamForSide(game, combined.favoriteSide)} favored` : "Pick'em"}
                    </div>
                  )}
                  <div className="rlmw-stats">
                    <div className="rlmw-stat">
                      <div className="rlmw-stat-label">Open (avg)</div>
                      <div className="rlmw-stat-value">{teamForSide(game, combined.displaySide)} {combined.openDisplay}</div>
                    </div>
                    <ChevronRight className="rlmw-arrow" size={18} />
                    <div className="rlmw-stat">
                      <div className="rlmw-stat-label">Current (avg)</div>
                      <div className="rlmw-stat-value">{teamForSide(game, combined.displaySide)} {combined.currentDisplay}</div>
                      {game.market === 'spread' && combined.magnitude > 0 && (
                        <div className="rlmw-stat-move">moved {combined.magnitude.toFixed(1)} pts</div>
                      )}
                    </div>
                  </div>
                  {game.market !== 'moneyline' && books.length > 1 && (
                    <div className="rlmw-range-note">
                      Range across books: {formatValue(game.market, combined.rangeMin)} to {formatValue(game.market, combined.rangeMax)}
                    </div>
                  )}
                  <div className="rlmw-book-rows">
                    {books.map((b) => {
                      const oc = bookOpenCurrent(game, b);
                      const bFlagged = isFlagged(game, b);
                      const moved = oc.open.id !== oc.current.id;
                      const sign = combined.displaySide === 'B' ? -1 : 1;
                      return (
                        <div key={b} className="rlmw-book-row">
                          <div className="rlmw-book-row-name">
                            {bFlagged && <Flame size={13} color="var(--green)" />}
                            <span>{b}</span>
                          </div>
                          <div className="rlmw-book-row-right">
                            {moved && <span className="rlmw-book-row-delta">opened {formatValue(game.market, sign * oc.open.valueA)}</span>}
                            <span className="rlmw-book-row-value">{formatValue(game.market, sign * oc.current.valueA)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  {bookSnaps.length >= 2 ? (
                    <div className="rlmw-chart-wrap">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                          <YAxis hide domain={['dataMin', 'dataMax']} />
                          <XAxis
                            dataKey="timestamp"
                            tickFormatter={formatShortDate}
                            tick={{ fill: 'var(--faint)', fontSize: 10 }}
                            axisLine={{ stroke: 'var(--border)' }}
                            tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <Tooltip
                            contentStyle={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                            labelFormatter={(ts) => formatDate(ts)}
                            formatter={(v) => [game.market === 'moneyline' ? `${v}% implied` : v, valueLabel(game.market)]}
                          />
                          <Line
                            type="monotone"
                            dataKey="v"
                            stroke={flagged ? 'var(--green)' : 'var(--blue-strong)'}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 4 }}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="rlmw-chart-empty">Add another update from {view} to see movement</div>
                  )}
                  {game.market === 'spread' && (
                    <div className="rlmw-favorite">
                      {bookFavoriteSide ? `${teamForSide(game, bookFavoriteSide)} favored` : "Pick'em"}
                    </div>
                  )}
                  <div className="rlmw-stats">
                    <div className="rlmw-stat">
                      <div className="rlmw-stat-label">Open</div>
                      <div className="rlmw-stat-value">{teamForSide(game, bookDisplaySide)} {formatValue(game.market, bookSign * bookOC.open.valueA)}</div>
                      <div className="rlmw-stat-date">{formatDate(bookOC.open.timestamp)}</div>
                    </div>
                    <ChevronRight className="rlmw-arrow" size={18} />
                    <div className="rlmw-stat">
                      <div className="rlmw-stat-label">Current</div>
                      <div className="rlmw-stat-value">{teamForSide(game, bookDisplaySide)} {formatValue(game.market, bookSign * bookOC.current.valueA)}</div>
                      <div className="rlmw-stat-date">{formatDate(bookOC.current.timestamp)}</div>
                      {game.market === 'spread' && getBookMovementMagnitude(game, view) > 0 && (
                        <div className="rlmw-stat-move">moved {getBookMovementMagnitude(game, view).toFixed(1)} pts</div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {publicLatest && (
                <div>
                  <div className="rlmw-public-source">Public bet % — real sportsbook split (matches CBS)</div>
                  <div className="rlmw-splitbar-labels">
                    <span className={`rlmw-side-label ${majority === 'A' ? 'majority' : ''}`}>
                      {game.sideA} {formatPct(publicLatest.publicPctA)}%
                    </span>
                    <span className={`rlmw-side-label ${majority === 'B' ? 'majority' : ''}`}>
                      {formatPct(100 - publicLatest.publicPctA)}% {game.sideB}
                    </span>
                  </div>
                  <div className="rlmw-splitbar">
                    <div className="rlmw-splitbar-a" style={{ width: `${publicLatest.publicPctA}%` }} />
                    <div className="rlmw-splitbar-b" style={{ width: `${100 - publicLatest.publicPctA}%` }} />
                  </div>
                </div>
              )}

              {historyItems.length > 0 && (
                <button
                  className="rlmw-history-toggle"
                  onClick={() => setExpanded((p) => ({ ...p, [game.id]: !p[game.id] }))}
                >
                  <ChevronDown size={13} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
                  History ({historyItems.length})
                </button>
              )}

              {isExpanded && (
                <div className="rlmw-history">
                  {historyItems.map((item) => (
                    <div key={item.id} className="rlmw-history-row">
                      <span>{formatDate(item.timestamp)}</span>
                      <span>
                        {historyRowText(game, item)}
                      </span>
                      <button
                        className="rlmw-icon-btn"
                        onClick={() => (item.kind === 'line' ? deleteLineSnapshot(game.id, item.id) : deletePublicSnapshot(game.id, item.id))}
                        aria-label="Delete entry"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {(game.injuriesA?.length > 0 || game.injuriesB?.length > 0) && (
                <button
                  className="rlmw-history-toggle"
                  onClick={() => setInjuryExpanded((p) => ({ ...p, [game.id]: !p[game.id] }))}
                >
                  <ChevronDown size={13} style={{ transform: injuryExpanded[game.id] ? 'rotate(180deg)' : 'none' }} />
                  Injury Report ({(game.injuriesA?.length || 0) + (game.injuriesB?.length || 0)})
                </button>
              )}

              {injuryExpanded[game.id] && (
                <div className="rlmw-history rlmw-injury-report">
                  {(game.injuriesA || []).map((p, i) => (
                    <div key={`a_${i}`} className="rlmw-history-row">
                      <span>{game.sideA}</span>
                      <span>{p.name} &middot; {p.position} &middot; {p.status}</span>
                    </div>
                  ))}
                  {(game.injuriesB || []).map((p, i) => (
                    <div key={`b_${i}`} className="rlmw-history-row">
                      <span>{game.sideB}</span>
                      <span>{p.name} &middot; {p.position} &middot; {p.status}</span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          );
        })}
      </div>

      {(rlmRecord.win + rlmRecord.loss + rlmRecord.push + chalkRecord.win + chalkRecord.loss + chalkRecord.push) > 0 && (
        <div className="rlmw-journal">
          <div className="rlmw-final-heading">Season Journal</div>
          <div className="rlmw-journal-grid">
            <div className="rlmw-journal-card rlmw-journal-card--rlm">
              <div className="rlmw-journal-label">RLM plays</div>
              <div className="rlmw-journal-record">{rlmRecord.win}-{rlmRecord.loss}-{rlmRecord.push}</div>
              {recordWinPct(rlmRecord) !== null && <div className="rlmw-journal-pct">{recordWinPct(rlmRecord)}% win rate</div>}
            </div>
            <div className="rlmw-journal-card rlmw-journal-card--chalk">
              <div className="rlmw-journal-label">Chalk plays</div>
              <div className="rlmw-journal-record">{chalkRecord.win}-{chalkRecord.loss}-{chalkRecord.push}</div>
              {recordWinPct(chalkRecord) !== null && <div className="rlmw-journal-pct">{recordWinPct(chalkRecord)}% win rate</div>}
            </div>
          </div>
        </div>
      )}

      {finishedGames.length > 0 && (
        <div className="rlmw-final-section">
          <div className="rlmw-final-heading">Finished ({finishedGames.length})</div>
          <div className="rlmw-final-table-wrap">
            <table className="rlmw-final-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Score</th>
                  <th>Open</th>
                  <th>Close</th>
                  <th>Move</th>
                  <th>Result</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {finishedGames.map((game) => {
                  const combined = getCombinedStats(game);
                  const sharpSide = combined && combined.movementSide
                    ? (combined.movementSide === 'A' ? game.sideA : game.sideB)
                    : null;
                  const historyItems = getHistoryItems(game);
                  const isExpanded = !!expanded[game.id];
                  const effectiveResult = game.result ?? computeAtsResult(game);
                  return (
                    <React.Fragment key={game.id}>
                    <tr>
                      <td>
                        <div className="rlmw-final-game-name">{game.matchup}</div>
                        {game.kickoff && <div className="rlmw-final-side">{game.kickoff}</div>}
                        {sharpSide && <div className="rlmw-final-side">line moved to {sharpSide}</div>}
                      </td>
                      <td className="rlmw-mono">{formatScore(game) || '—'}</td>
                      <td className="rlmw-mono">{combined ? `${teamForSide(game, combined.displaySide)} ${combined.openDisplay}` : '—'}</td>
                      <td className="rlmw-mono">{combined ? `${teamForSide(game, combined.displaySide)} ${combined.currentDisplay}` : '—'}</td>
                      <td className="rlmw-mono">{combined ? combined.magnitude.toFixed(1) : '—'}</td>
                      <td>
                        <div className="rlmw-result-pills">
                          {['win', 'loss', 'push'].map((r) => (
                            <button
                              key={r}
                              className={`rlmw-result-pill ${effectiveResult === r ? `active-${r}` : ''}`}
                              onClick={() => setGameResult(game.id, r)}
                              aria-label={`Mark ${r}`}
                            >
                              {r === 'win' ? 'W' : r === 'loss' ? 'L' : 'P'}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {historyItems.length > 0 && (
                            <button
                              className="rlmw-icon-btn"
                              onClick={() => setExpanded((p) => ({ ...p, [game.id]: !p[game.id] }))}
                              aria-label="Toggle history"
                            >
                              <ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />
                            </button>
                          )}
                          <button className="rlmw-icon-btn" onClick={() => reopenGame(game.id)} aria-label="Reopen game">
                            <Undo2 size={14} />
                          </button>
                          <button className="rlmw-icon-btn" onClick={() => deleteGame(game.id)} aria-label="Delete game">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0 }}>
                          <div className="rlmw-history rlmw-final-history">
                            {historyItems.map((item) => (
                              <div key={item.id} className="rlmw-history-row">
                                <span>{formatDate(item.timestamp)}</span>
                                <span>
                                  {historyRowText(game, item)}
                                </span>
                                <button
                                  className="rlmw-icon-btn"
                                  onClick={() => (item.kind === 'line' ? deleteLineSnapshot(game.id, item.id) : deletePublicSnapshot(game.id, item.id))}
                                  aria-label="Delete entry"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
