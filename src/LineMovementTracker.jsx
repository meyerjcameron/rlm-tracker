import React, { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { Trash2, Flame, ChevronDown, ChevronRight, X, Flag, Undo2 } from 'lucide-react';

const MARKETS = [
  { id: 'spread', label: 'Spread' },
  { id: 'moneyline', label: 'Moneyline' },
  { id: 'total', label: 'Total' },
];
const BOOK_SUGGESTIONS = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'ESPN BET', 'Fanatics', 'Consensus'];
const STORAGE_KEY = 'line-tracker:games';

// Seeded automatically from CBS Sports (and manually-shared book screenshots) so games load
// without manual entry. Matched by matchup, so re-seeding never duplicates existing data —
// it only adds missing books or appends a new snapshot when a book's value has moved.
// "public" is Covers.com's consensus pick % — CBS doesn't expose a fetchable bet split.
const SEED_GAMES = [
  { matchup: 'SF @ LAR', sport: 'NFL', sideA: 'SF', sideB: 'LAR', kickoff: 'Thu, Sep 10, 2026 (time TBD)', score: { a: 27, b: 7 }, lines: [{ book: 'CBS', value: 3.5 }] },
  { matchup: 'TB @ CIN', sport: 'NFL', sideA: 'TB', sideB: 'CIN', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 27, b: 33 }, public: 43, lines: [{ book: 'CBS', value: 3.5 }] },
  { matchup: 'BUF @ HOU', sport: 'NFL', sideA: 'BUF', sideB: 'HOU', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 36, b: 31 }, public: 56, lines: [{ book: 'CBS', value: -1.5 }] },
  { matchup: 'BAL @ IND', sport: 'NFL', sideA: 'BAL', sideB: 'IND', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 41, b: 23 }, public: 57, lines: [{ book: 'CBS', value: -3.5 }] },
  { matchup: 'CHI @ CAR', sport: 'NFL', sideA: 'CHI', sideB: 'CAR', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 59, b: 37 }, public: 72, lines: [{ book: 'CBS', value: -3 }] },
  { matchup: 'NO @ DET', sport: 'NFL', sideA: 'NO', sideB: 'DET', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 30, b: 31, ot: true }, public: 23, lines: [{ book: 'CBS', value: 7 }] },
  { matchup: 'CLE @ JAC', sport: 'NFL', sideA: 'CLE', sideB: 'JAC', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 10, b: 34 }, public: 38, lines: [{ book: 'CBS', value: 8.5 }] },
  { matchup: 'NYJ @ TEN', sport: 'NFL', sideA: 'NYJ', sideB: 'TEN', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 23, b: 10 }, public: 40, lines: [{ book: 'CBS', value: 1.5 }] },
  { matchup: 'ATL @ PIT', sport: 'NFL', sideA: 'ATL', sideB: 'PIT', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 13, b: 20 }, public: 37, replaceLines: true, lines: [{ book: 'CBS', value: 6.5, open: 3.5 }] },
  { matchup: 'GB @ MIN', sport: 'NFL', sideA: 'GB', sideB: 'MIN', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 22, b: 39 }, public: 52, lines: [{ book: 'CBS', value: 1.5 }] },
  { matchup: 'WAS @ PHI', sport: 'NFL', sideA: 'WAS', sideB: 'PHI', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 22, b: 24 }, public: 32, lines: [{ book: 'CBS', value: 5.5 }] },
  { matchup: 'MIA @ LV', sport: 'NFL', sideA: 'MIA', sideB: 'LV', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 13, b: 27 }, public: 41, lines: [{ book: 'CBS', value: 3 }] },
  { matchup: 'ARI @ LAC', sport: 'NFL', sideA: 'ARI', sideB: 'LAC', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 26, b: 14 }, public: 47, lines: [{ book: 'CBS', value: 9.5 }] },
  { matchup: 'DAL @ NYG', sport: 'NFL', sideA: 'DAL', sideB: 'NYG', kickoff: 'Sun, Sep 13, 2026 (time TBD)', score: { a: 20, b: 28 }, public: 71, lines: [{ book: 'CBS', value: -2.5 }] },
  { matchup: 'DEN @ KC', sport: 'NFL', sideA: 'DEN', sideB: 'KC', kickoff: 'Mon, Sep 14, 2026 · 7:15 PM CT', public: 38, lines: [{ book: 'CBS', value: 2.5 }] },
  { matchup: 'NE @ SEA', sport: 'NFL', sideA: 'NE', sideB: 'SEA', kickoff: 'Wed, Sep 9, 2026 (time TBD)', score: { a: 10, b: 13 }, lines: [{ book: 'CBS', value: 3.5 }] },
  // Friday night CFB (Week 2) -- team codes for NORE@UVA and NOVA@LOU are unconfirmed, see chat
  { matchup: 'NORE @ UVA', sport: 'CFB', sideA: 'NORE', sideB: 'UVA', kickoff: 'week of Sep 11-12, 2026 (unconfirmed)', score: { a: 21, b: 44 }, lines: [{ book: 'CBS', value: 45.5 }] },
  { matchup: 'RICH @ NCST', sport: 'CFB', sideA: 'RICH', sideB: 'NCST', kickoff: 'Fri, Sep 11, 2026 (time TBD)', score: { a: 0, b: 73 }, lines: [{ book: 'CBS', value: 34.5 }] },
  { matchup: 'NOVA @ LOU', sport: 'CFB', sideA: 'NOVA', sideB: 'LOU', kickoff: 'Fri, Sep 11, 2026 (time TBD, unconfirmed)', score: { a: 13, b: 59 }, lines: [{ book: 'CBS', value: 36.5 }] },
  { matchup: 'RUT @ BC', sport: 'CFB', sideA: 'RUT', sideB: 'BC', kickoff: 'Fri, Sep 11, 2026 (time TBD)', score: { a: 21, b: 28 }, lines: [{ book: 'CBS', value: 3.5 }] },
  {
    matchup: 'MIZZ @ KAN', sport: 'CFB', sideA: 'MIZZ', sideB: 'KAN', kickoff: 'Fri, Sep 11, 2026 (time TBD)', score: { a: 38, b: 21 },
    lines: [
      { book: 'CBS', value: -4.5 },
      { book: 'DraftKings', value: -4.5, open: -7 },
    ],
  },
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
  return {
    openDisplay: formatValue(game.market, Number(avgOpen.toFixed(1))),
    currentDisplay: formatValue(game.market, Number(avgCur.toFixed(1))),
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

function gameRLMMagnitude(game) {
  let max = 0;
  if (isFlagged(game, 'ALL')) {
    const c = getCombinedStats(game);
    if (c) max = Math.max(max, c.magnitude);
  }
  getBookList(game).forEach((b) => {
    if (isFlagged(game, b)) max = Math.max(max, getBookMovementMagnitude(game, b));
  });
  return max;
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
  const [sportTab, setSportTab] = useState('NFL');
  const [expanded, setExpanded] = useState({});
  const [selectedView, setSelectedView] = useState({});
  const [lineForms, setLineForms] = useState({});
  const [publicForms, setPublicForms] = useState({});

  useEffect(() => {
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
    const toAdd = SEED_GAMES.filter((s) => !existingKeys.has(s.matchup.toLowerCase()));
    const now = Date.now();
    let changed = false;

    const buildBookSnapshots = (line, uid) => {
      const snaps = [];
      if (line.open !== undefined && line.open !== line.value) {
        snaps.push({ id: `l_seed_${now}_${uid}_o`, book: line.book, timestamp: now - 1, valueA: line.open });
      }
      snaps.push({ id: `l_seed_${now}_${uid}_c`, book: line.book, timestamp: now, valueA: line.value });
      return snaps;
    };

    const withUpdates = current.map((g) => {
      const seed = SEED_GAMES.find((s) => s.matchup.toLowerCase() === g.matchup.toLowerCase());
      if (!seed) return g;
      let next = g;

      if (seed.public !== undefined) {
        const latestPublic = next.publicSnapshots[next.publicSnapshots.length - 1];
        if (!latestPublic || latestPublic.publicPctA !== seed.public) {
          changed = true;
          next = { ...next, publicSnapshots: [...next.publicSnapshots, { id: `p_seed_${now}_${next.id}`, timestamp: now, publicPctA: seed.public }] };
        }
      }

      if (seed.kickoff !== undefined && next.kickoff !== seed.kickoff) {
        changed = true;
        next = { ...next, kickoff: seed.kickoff };
      }

      if (seed.score !== undefined && !next.finished) {
        changed = true;
        next = { ...next, score: seed.score, finished: true, finishedAt: now };
      }

      if (seed.replaceLines) {
        // Corrects a book whose earlier scrape only captured one point-in-time
        // value -- replaces its whole snapshot history with the real open/close
        // pair (e.g. from CBS's mobile-app-only "Game Odds" view) instead of
        // diffing against the wrong value that was already recorded.
        const otherBooksSnaps = next.lineSnapshots.filter((s) => !seed.lines.some((l) => l.book === s.book));
        const replaced = seed.lines.flatMap((line, li) => buildBookSnapshots(line, `${next.id}_fix_${li}`));
        changed = true;
        next = { ...next, lineSnapshots: [...otherBooksSnaps, ...replaced] };
      } else {
        seed.lines.forEach((line, li) => {
          const bookSnaps = next.lineSnapshots.filter((s) => s.book === line.book);
          if (bookSnaps.length === 0) {
            changed = true;
            next = { ...next, lineSnapshots: [...next.lineSnapshots, ...buildBookSnapshots(line, `${next.id}_${li}`)] };
          } else {
            const latest = bookSnaps[bookSnaps.length - 1];
            if (latest.valueA !== line.value) {
              changed = true;
              next = { ...next, lineSnapshots: [...next.lineSnapshots, { id: `l_upd_${now}_${next.id}_${li}`, book: line.book, timestamp: now, valueA: line.value }] };
            }
          }
        });
      }

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
        score: s.score,
        finished: s.score !== undefined,
        finishedAt: s.score !== undefined ? now : undefined,
        lineSnapshots: s.lines.flatMap((line, li) => buildBookSnapshots(line, `${i}_${li}`)),
        publicSnapshots: s.public !== undefined ? [{ id: `p_seed_${now}_${i}`, timestamp: now, publicPctA: s.public }] : [],
      }));
      finalList = [...seeded, ...withUpdates];
    }

    setGames(finalList);
    setLoaded(true);
    if (migrated || toAdd.length || changed) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(finalList));
      } catch (e) { /* noop */ }
    }
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

  function addLineSnapshot(gameId) {
    const form = lineForms[gameId];
    if (!form || !form.book || !form.book.trim() || form.value === '' || form.value === undefined) return;
    const updated = games.map((g) => {
      if (g.id !== gameId) return g;
      return {
        ...g,
        lineSnapshots: [...g.lineSnapshots, {
          id: `l_${Date.now()}`,
          book: form.book.trim(),
          timestamp: Date.now(),
          valueA: Number(form.value),
        }],
      };
    });
    persist(updated);
    setLineForms((p) => ({ ...p, [gameId]: { book: form.book, value: '' } }));
  }

  function addPublicSnapshot(gameId) {
    const form = publicForms[gameId];
    if (!form || form.value === '' || form.value === undefined) return;
    const updated = games.map((g) => {
      if (g.id !== gameId) return g;
      return {
        ...g,
        publicSnapshots: [...g.publicSnapshots, {
          id: `p_${Date.now()}`,
          timestamp: Date.now(),
          publicPctA: Math.max(0, Math.min(100, Number(form.value))),
        }],
      };
    });
    persist(updated);
    setPublicForms((p) => ({ ...p, [gameId]: { value: '' } }));
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

  const bySport = games.filter((g) => g.sport === sportTab);
  const liveGames = bySport.filter((g) => !g.finished);
  const finishedGames = [...bySport.filter((g) => g.finished)].sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  const filteredGames = onlyChanged ? liveGames.filter(gameHasLineChange) : liveGames;
  const visibleGames = [...filteredGames].sort((a, b) => gameRLMMagnitude(b) - gameRLMMagnitude(a));
  const lineChangeCount = liveGames.filter(gameHasLineChange).length;

  return (
    <div className="rlmw-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .rlmw-root { background:#0D1117; color:#ECEFF4; min-height:100vh; font-family:'IBM Plex Sans', sans-serif; padding: 32px 24px 64px; box-sizing:border-box; }
        .rlmw-root * { box-sizing:border-box; }
        .rlmw-title { font-family:'Bebas Neue', sans-serif; font-size:42px; letter-spacing:0.5px; line-height:1; margin:0; font-weight:400; }
        .rlmw-sub { color:#8993A4; font-size:14px; margin-top:8px; max-width:560px; line-height:1.5; }
        .rlmw-sport-tabs { display:flex; gap:4px; margin-top:24px; border-bottom:1px solid #2B3340; }
        .rlmw-sport-tab { padding:8px 16px; font-size:13px; font-weight:600; color:#8993A4; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
        .rlmw-sport-tab.active { color:#ECEFF4; border-bottom-color:#D4A72C; }
        .rlmw-toolbar { display:flex; align-items:center; gap:12px; margin-top:16px; flex-wrap:wrap; }
        .rlmw-btn-primary { background:#D4A72C; color:#0D1117; border:none; padding:10px 16px; border-radius:6px; font-weight:600; font-size:14px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-family:inherit; }
        .rlmw-btn-primary:hover { background:#e0b53d; }
        .rlmw-btn-secondary { background:transparent; border:1px solid #2B3340; color:#ECEFF4; padding:9px 14px; border-radius:6px; font-size:14px; cursor:pointer; font-family:inherit; }
        .rlmw-btn-secondary:hover { border-color:#586173; }
        .rlmw-pill-toggle { display:inline-flex; align-items:center; gap:8px; font-size:13px; color:#34C77B; cursor:pointer; user-select:none; padding:8px 14px; border:1px solid #1F3B2C; border-radius:999px; }
        .rlmw-pill-toggle.active { border-color:#34C77B; background:#12241C; }
        .rlmw-panel { background:#161B22; border:1px solid #2B3340; border-radius:8px; padding:20px; margin-top:20px; max-width:640px; }
        .rlmw-field-row { display:flex; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
        .rlmw-field { flex:1; min-width:140px; display:flex; flex-direction:column; gap:6px; }
        .rlmw-field label { font-size:12px; color:#8993A4; }
        .rlmw-input, .rlmw-select { background:#1D232C; border:1px solid #2B3340; color:#ECEFF4; padding:9px 10px; border-radius:6px; font-size:14px; font-family:inherit; width:100%; }
        .rlmw-input:focus, .rlmw-select:focus { outline:2px solid #D4A72C; outline-offset:1px; border-color:#D4A72C; }
        .rlmw-input-mono { font-family:'IBM Plex Mono', monospace; }
        .rlmw-market-toggle { display:flex; gap:8px; }
        .rlmw-market-btn { flex:1; padding:9px; text-align:center; border:1px solid #2B3340; background:#1D232C; color:#8993A4; border-radius:6px; cursor:pointer; font-size:13px; font-family:inherit; }
        .rlmw-market-btn.active { border-color:#D4A72C; color:#D4A72C; background:#241F14; }
        .rlmw-panel-actions { display:flex; gap:10px; margin-top:6px; }
        .rlmw-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px; margin-top:24px; }
        .rlmw-card { background:#161B22; border:1px solid #2B3340; border-radius:8px; padding:18px; display:flex; flex-direction:column; gap:12px; }
        .rlmw-card.flagged { border-color:#34C77B; }
        .rlmw-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
        .rlmw-matchup { font-family:'Bebas Neue', sans-serif; font-size:22px; letter-spacing:0.3px; line-height:1.1; }
        .rlmw-meta { color:#8993A4; font-size:12.5px; margin-top:3px; }
        .rlmw-kickoff { color:#D4A72C; font-size:11.5px; margin-top:4px; font-family:'IBM Plex Mono', monospace; }
        .rlmw-icon-btn { background:transparent; border:none; color:#586173; cursor:pointer; padding:4px; border-radius:4px; flex-shrink:0; }
        .rlmw-icon-btn:hover { color:#C65B4E; background:#1D232C; }
        .rlmw-flag { display:flex; align-items:flex-start; gap:8px; background:#12241C; border:1px solid #1F3B2C; color:#34C77B; padding:10px 12px; border-radius:6px; font-size:13px; line-height:1.45; }
        .rlmw-flag svg { flex-shrink:0; margin-top:1px; }
        .rlmw-book-pills { display:flex; gap:6px; flex-wrap:wrap; }
        .rlmw-book-pill { font-size:12px; padding:5px 10px; border-radius:999px; border:1px solid #2B3340; background:#1D232C; color:#8993A4; cursor:pointer; white-space:nowrap; display:inline-flex; align-items:center; gap:4px; font-family:inherit; }
        .rlmw-book-pill.active { border-color:#D4A72C; color:#D4A72C; background:#241F14; }
        .rlmw-stats { display:flex; gap:8px; align-items:center; }
        .rlmw-stat { flex:1; background:#1D232C; border-radius:6px; padding:10px 12px; }
        .rlmw-stat-label { font-size:11px; color:#8993A4; margin-bottom:4px; }
        .rlmw-stat-value { font-family:'IBM Plex Mono', monospace; font-size:16px; font-weight:600; }
        .rlmw-stat-date { font-size:10.5px; color:#586173; margin-top:2px; }
        .rlmw-arrow { color:#586173; flex-shrink:0; }
        .rlmw-chart-wrap { height:70px; margin-top:-4px; }
        .rlmw-chart-empty { height:70px; display:flex; align-items:center; justify-content:center; color:#586173; font-size:12px; border:1px dashed #2B3340; border-radius:6px; text-align:center; padding:0 12px; }
        .rlmw-book-rows { display:flex; flex-direction:column; gap:6px; }
        .rlmw-book-row { display:flex; justify-content:space-between; align-items:center; background:#1D232C; border-radius:6px; padding:8px 10px; font-size:13px; gap:8px; }
        .rlmw-book-row-name { display:flex; align-items:center; gap:6px; font-weight:500; min-width:0; }
        .rlmw-book-row-name span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .rlmw-book-row-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
        .rlmw-book-row-value { font-family:'IBM Plex Mono', monospace; }
        .rlmw-book-row-delta { font-size:10.5px; color:#586173; }
        .rlmw-range-note { font-size:11.5px; color:#8993A4; }
        .rlmw-splitbar-labels { display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px; }
        .rlmw-splitbar { height:8px; border-radius:4px; overflow:hidden; display:flex; background:#1D232C; }
        .rlmw-splitbar-a { background:#4C7A9A; height:100%; }
        .rlmw-splitbar-b { background:#586173; height:100%; }
        .rlmw-side-label.majority { color:#ECEFF4; font-weight:600; }
        .rlmw-side-label { color:#8993A4; }
        .rlmw-history-toggle { background:none; border:none; color:#8993A4; font-size:12.5px; cursor:pointer; display:flex; align-items:center; gap:4px; padding:2px 0; align-self:flex-start; font-family:inherit; }
        .rlmw-history { border-top:1px solid #2B3340; padding-top:10px; display:flex; flex-direction:column; gap:6px; }
        .rlmw-history-row { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#8993A4; font-family:'IBM Plex Mono', monospace; gap:8px; }
        .rlmw-history-row .rlmw-icon-btn { padding:2px; }
        .rlmw-add-section { display:flex; flex-direction:column; gap:10px; border-top:1px solid #2B3340; padding-top:12px; }
        .rlmw-add-row { display:flex; gap:8px; align-items:flex-end; }
        .rlmw-update-field { flex:1; display:flex; flex-direction:column; gap:4px; min-width:0; }
        .rlmw-update-field label { font-size:10.5px; color:#8993A4; }
        .rlmw-update-btn { background:#1D232C; border:1px solid #2B3340; color:#ECEFF4; padding:9px 12px; border-radius:6px; cursor:pointer; font-size:13px; white-space:nowrap; font-family:inherit; }
        .rlmw-update-btn:hover { border-color:#D4A72C; color:#D4A72C; }
        .rlmw-empty { border:1px dashed #2B3340; border-radius:8px; padding:48px 24px; text-align:center; color:#8993A4; margin-top:24px; max-width:480px; }
        .rlmw-empty h3 { color:#ECEFF4; font-family:'Bebas Neue', sans-serif; font-size:24px; margin:0 0 8px; letter-spacing:0.3px; font-weight:400; }
        .rlmw-save-error { color:#C65B4E; font-size:12px; margin-top:10px; }
        .rlmw-sport-tag { font-size:11px; color:#8993A4; border:1px solid #2B3340; padding:2px 7px; border-radius:4px; white-space:nowrap; }
        .rlmw-final-section { margin-top:36px; max-width:760px; }
        .rlmw-final-heading { font-family:'Bebas Neue', sans-serif; font-size:20px; letter-spacing:0.3px; color:#8993A4; margin-bottom:10px; }
        .rlmw-final-table-wrap { overflow-x:auto; border:1px solid #2B3340; border-radius:8px; }
        .rlmw-final-table { width:100%; border-collapse:collapse; font-size:13px; }
        .rlmw-final-table th { text-align:left; color:#8993A4; font-weight:600; font-size:10.5px; text-transform:uppercase; letter-spacing:0.4px; padding:10px 12px; border-bottom:1px solid #2B3340; background:#161B22; white-space:nowrap; }
        .rlmw-final-table td { padding:10px 12px; border-bottom:1px solid #1D232C; vertical-align:middle; white-space:nowrap; }
        .rlmw-final-table tr:last-child td { border-bottom:none; }
        .rlmw-final-game-name { font-weight:600; }
        .rlmw-final-side { font-size:11px; color:#586173; margin-top:2px; }
        .rlmw-mono { font-family:'IBM Plex Mono', monospace; }
        .rlmw-result-pills { display:flex; gap:4px; }
        .rlmw-result-pill { width:26px; height:26px; border-radius:4px; border:1px solid #2B3340; background:#1D232C; color:#8993A4; font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; }
        .rlmw-result-pill.active-win { background:#12241C; border-color:#34C77B; color:#34C77B; }
        .rlmw-result-pill.active-loss { background:#241414; border-color:#C65B4E; color:#C65B4E; }
        .rlmw-result-pill.active-push { background:#1D232C; border-color:#8993A4; color:#ECEFF4; }
      `}</style>

      <datalist id="rlmw-books">
        {BOOK_SUGGESTIONS.map((b) => <option key={b} value={b} />)}
      </datalist>

      <div className="rlmw-title">RLM Tracker</div>
      <div className="rlmw-sub">
        Log lines from multiple sportsbooks per game alongside the public bet split. View them combined,
        or switch to a single book to see its own movement. Flags a game when the line moves against
        the side the public is backing.
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

      <div className="rlmw-toolbar">
        {bySport.length > 0 && (
          <div
            className={`rlmw-pill-toggle ${onlyChanged ? 'active' : ''}`}
            onClick={() => setOnlyChanged((v) => !v)}
          >
            <Flame size={14} /> {lineChangeCount} of {bySport.length} showing a line change
          </div>
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
          const lForm = lineForms[game.id] || { book: '', value: '' };
          const pForm = publicForms[game.id] || { value: '' };

          const combined = getCombinedStats(game);
          const bookOC = view !== 'ALL' ? bookOpenCurrent(game, view) : null;
          const bookSnaps = view !== 'ALL' ? getBookSnaps(game, view) : [];
          const chartData = bookSnaps.map((s) => ({
            v: game.market === 'moneyline' ? Number((impliedProb(s.valueA) * 100).toFixed(1)) : s.valueA,
          }));

          const historyItems = [
            ...game.lineSnapshots.map((s) => ({ ...s, kind: 'line' })),
            ...game.publicSnapshots.map((s) => ({ ...s, kind: 'public' })),
          ].sort((a, b) => a.timestamp - b.timestamp);

          return (
            <div key={game.id} className={`rlmw-card ${flagged ? 'flagged' : ''}`}>
              <div className="rlmw-card-top">
                <div>
                  <div className="rlmw-matchup">{game.matchup}</div>
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
                    {isFlagged(game, b) && <Flame size={11} color="#34C77B" />}
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
                  <div className="rlmw-stats">
                    <div className="rlmw-stat">
                      <div className="rlmw-stat-label">Open (avg)</div>
                      <div className="rlmw-stat-value">{combined.openDisplay}</div>
                    </div>
                    <ChevronRight className="rlmw-arrow" size={18} />
                    <div className="rlmw-stat">
                      <div className="rlmw-stat-label">Current (avg)</div>
                      <div className="rlmw-stat-value">{combined.currentDisplay}</div>
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
                      return (
                        <div key={b} className="rlmw-book-row">
                          <div className="rlmw-book-row-name">
                            {bFlagged && <Flame size={13} color="#34C77B" />}
                            <span>{b}</span>
                          </div>
                          <div className="rlmw-book-row-right">
                            {moved && <span className="rlmw-book-row-delta">opened {formatValue(game.market, oc.open.valueA)}</span>}
                            <span className="rlmw-book-row-value">{formatValue(game.market, oc.current.valueA)}</span>
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
                        <LineChart data={chartData}>
                          <YAxis hide domain={['dataMin', 'dataMax']} />
                          <Tooltip
                            contentStyle={{ background: '#1D232C', border: '1px solid #2B3340', borderRadius: 6, fontSize: 12 }}
                            labelFormatter={() => ''}
                            formatter={(v) => [game.market === 'moneyline' ? `${v}% implied` : v, valueLabel(game.market)]}
                          />
                          <Line
                            type="monotone"
                            dataKey="v"
                            stroke={flagged ? '#34C77B' : '#4C7A9A'}
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
                  <div className="rlmw-stats">
                    <div className="rlmw-stat">
                      <div className="rlmw-stat-label">Open</div>
                      <div className="rlmw-stat-value">{formatValue(game.market, bookOC.open.valueA)}</div>
                      <div className="rlmw-stat-date">{formatDate(bookOC.open.timestamp)}</div>
                    </div>
                    <ChevronRight className="rlmw-arrow" size={18} />
                    <div className="rlmw-stat">
                      <div className="rlmw-stat-label">Current</div>
                      <div className="rlmw-stat-value">{formatValue(game.market, bookOC.current.valueA)}</div>
                      <div className="rlmw-stat-date">{formatDate(bookOC.current.timestamp)}</div>
                    </div>
                  </div>
                </>
              )}

              {publicLatest && (
                <div>
                  <div className="rlmw-splitbar-labels">
                    <span className={`rlmw-side-label ${majority === 'A' ? 'majority' : ''}`}>
                      {game.sideA} {publicLatest.publicPctA}%
                    </span>
                    <span className={`rlmw-side-label ${majority === 'B' ? 'majority' : ''}`}>
                      {100 - publicLatest.publicPctA}% {game.sideB}
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
                        {item.kind === 'line'
                          ? `${item.book}: ${formatValue(game.market, item.valueA)}`
                          : `Public: ${item.publicPctA}% / ${100 - item.publicPctA}%`}
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

              <div className="rlmw-add-section">
                <div className="rlmw-add-row">
                  <div className="rlmw-update-field">
                    <label>Sportsbook</label>
                    <input
                      className="rlmw-input rlmw-input-mono"
                      list="rlmw-books"
                      placeholder="DraftKings"
                      value={lForm.book}
                      onChange={(e) => setLineForms((p) => ({ ...p, [game.id]: { ...lForm, book: e.target.value } }))}
                    />
                  </div>
                  <div className="rlmw-update-field">
                    <label>{valueLabel(game.market)}{game.market !== 'total' ? ` (${game.sideA})` : ''}</label>
                    <input
                      className="rlmw-input rlmw-input-mono"
                      type="number"
                      step={game.market === 'moneyline' ? '1' : '0.5'}
                      value={lForm.value}
                      onChange={(e) => setLineForms((p) => ({ ...p, [game.id]: { ...lForm, value: e.target.value } }))}
                    />
                  </div>
                  <button className="rlmw-update-btn" onClick={() => addLineSnapshot(game.id)}>Log line</button>
                </div>
                <div className="rlmw-add-row">
                  <div className="rlmw-update-field">
                    <label>% on {game.market === 'total' ? 'Over' : game.sideA}</label>
                    <input
                      className="rlmw-input rlmw-input-mono"
                      type="number"
                      min="0"
                      max="100"
                      value={pForm.value}
                      onChange={(e) => setPublicForms((p) => ({ ...p, [game.id]: { value: e.target.value } }))}
                    />
                  </div>
                  <button className="rlmw-update-btn" onClick={() => addPublicSnapshot(game.id)}>Log public %</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

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
                  return (
                    <tr key={game.id}>
                      <td>
                        <div className="rlmw-final-game-name">{game.matchup}</div>
                        {game.kickoff && <div className="rlmw-final-side">{game.kickoff}</div>}
                        {sharpSide && <div className="rlmw-final-side">line moved to {sharpSide}</div>}
                      </td>
                      <td className="rlmw-mono">{formatScore(game) || '—'}</td>
                      <td className="rlmw-mono">{combined ? combined.openDisplay : '—'}</td>
                      <td className="rlmw-mono">{combined ? combined.currentDisplay : '—'}</td>
                      <td className="rlmw-mono">{combined ? combined.magnitude.toFixed(1) : '—'}</td>
                      <td>
                        <div className="rlmw-result-pills">
                          {['win', 'loss', 'push'].map((r) => (
                            <button
                              key={r}
                              className={`rlmw-result-pill ${game.result === r ? `active-${r}` : ''}`}
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
                          <button className="rlmw-icon-btn" onClick={() => reopenGame(game.id)} aria-label="Reopen game">
                            <Undo2 size={14} />
                          </button>
                          <button className="rlmw-icon-btn" onClick={() => deleteGame(game.id)} aria-label="Delete game">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
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
