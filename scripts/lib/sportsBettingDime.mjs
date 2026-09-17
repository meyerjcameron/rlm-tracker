import { canonicalSchool } from './schoolNames.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// SportsBettingDime's own site calls this WordPress REST endpoint client-side
// to render its public betting trends tables (found via the network panel,
// not documented). Real sportsbook bet-count% and money(stake)% per side,
// averaged across MGM/DraftKings/Bet365/WilliamHill/FanDuel -- verified
// against a real screenshot of CBS's own (otherwise unscrapable) app-only
// "Public Bet" gauge and it matched to the tenth of a percent.
const BOOKS = 'sr:book:17324,sr:book:18149,sr:book:28901,sr:book:32219,sr:book:18186';
const ENDPOINTS = {
  NFL: `https://www.sportsbettingdime.com/wp-json/adpt/v1/nfl-odds?books=${encodeURIComponent(BOOKS)}&format=us`,
  CFB: `https://www.sportsbettingdime.com/wp-json/adpt/v1/ncaafb-odds?books=${encodeURIComponent(BOOKS)}&format=us`,
};

function toNum(v) {
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Averaging real books' spreads can land on a number nobody actually
// offers (e.g. four books at -5.5 and one at -4.5 averages to -5.3) --
// snap it to the nearest half point so it reads as a real, bettable line.
function roundToHalfPoint(n) {
  return Math.round(n * 2) / 2;
}

// Returns { byAbbrev, bySchool }, each a Map of "AWAY@HOME" -> an entry with
// whichever of these SBD actually had for that game:
//   pctAway         -- bet-count % on the away side (i.e. "Public Bet", not
//                       the money/stake %), averaged across MGM/DraftKings/
//                       Bet365/WilliamHill/FanDuel. Verified against a real
//                       screenshot of CBS's own (otherwise unscrapable)
//                       app-only "Public Bet" gauge and matched to the tenth
//                       of a percent.
//   spreadCurrent,
//   spreadOpen      -- the away side's current/opening spread, averaged
//                       across those same five real sportsbooks -- a second,
//                       independent line source from CBS's, so the two can
//                       be cross-checked against each other in the app.
// Keyed two ways since CBS and SBD don't always spell the same team's code
// the same way (worse for the ~130 CFB teams than NFL's 32), but "market"
// (school name, e.g. "Syracuse") matches CBS's own team name far more
// reliably.
export async function fetchSbdData(sport) {
  const url = ENDPOINTS[sport];
  if (!url) return { byAbbrev: new Map(), bySchool: new Map() };
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`SportsBettingDime fetch failed: ${res.status} (${sport})`);
  const data = await res.json();

  const byAbbrev = new Map();
  const bySchool = new Map();
  (data.data || []).forEach((g) => {
    const away = g.competitors && g.competitors.away;
    const home = g.competitors && g.competitors.home;
    if (!away || !home) return;

    const entry = {};
    const split = g.bettingSplits && g.bettingSplits.spread;
    if (split) entry.pctAway = split.away.betsPercentage;

    const spreadBooks = g.markets && g.markets.spread && g.markets.spread.books;
    if (spreadBooks && spreadBooks.length) {
      const currents = spreadBooks.map((b) => toNum(b.away.spread)).filter((n) => n !== null);
      const opens = spreadBooks.map((b) => toNum(b.away.opening_spread)).filter((n) => n !== null);
      if (currents.length) entry.spreadCurrent = roundToHalfPoint(average(currents));
      if (opens.length) entry.spreadOpen = roundToHalfPoint(average(opens));
    }
    if (!Object.keys(entry).length) return;

    if (away.abbreviation && home.abbreviation) {
      byAbbrev.set(`${away.abbreviation.toUpperCase()}@${home.abbreviation.toUpperCase()}`, entry);
    }
    if (away.market && home.market) {
      bySchool.set(`${canonicalSchool(away.market)}@${canonicalSchool(home.market)}`, entry);
    }
  });
  return { byAbbrev, bySchool };
}

// A couple of NFL codes SportsBettingDime spells differently than CBS.
const ABBREV_ALIASES = { JAC: 'JAX', LAR: 'LA' };
const alias = (code) => ABBREV_ALIASES[code] || code;

export function findSbdEntry(sbdData, sideA, sideB, nameA, nameB) {
  const byAbbrevEntry = sbdData.byAbbrev.get(`${alias(sideA)}@${alias(sideB)}`);
  if (byAbbrevEntry) return byAbbrevEntry;
  if (nameA && nameB) {
    const bySchoolEntry = sbdData.bySchool.get(`${canonicalSchool(nameA)}@${canonicalSchool(nameB)}`);
    if (bySchoolEntry) return bySchoolEntry;
  }
  return null;
}
