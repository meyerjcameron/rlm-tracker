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

// Returns { byAbbrev, bySchool }, each a Map of "AWAY@HOME" -> { pctAway, pctHome }
// (bet-count %, i.e. "Public Bet" -- not the money/stake %). Keyed two ways
// since CBS and SBD don't always spell the same team's code the same way
// (worse for the ~130 CFB teams than NFL's 32), but "market" (school name,
// e.g. "Syracuse") matches CBS's own team name far more reliably.
export async function fetchBettingSplits(sport) {
  const url = ENDPOINTS[sport];
  if (!url) return { byAbbrev: new Map(), bySchool: new Map() };
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`SportsBettingDime fetch failed: ${res.status} (${sport})`);
  const data = await res.json();

  const byAbbrev = new Map();
  const bySchool = new Map();
  (data.data || []).forEach((g) => {
    const split = g.bettingSplits && g.bettingSplits.spread;
    const away = g.competitors && g.competitors.away;
    const home = g.competitors && g.competitors.home;
    if (!split || !away || !home) return;
    const value = { pctAway: split.away.betsPercentage, pctHome: split.home.betsPercentage };
    if (away.abbreviation && home.abbreviation) {
      byAbbrev.set(`${away.abbreviation.toUpperCase()}@${home.abbreviation.toUpperCase()}`, value);
    }
    if (away.market && home.market) {
      bySchool.set(`${canonicalSchool(away.market)}@${canonicalSchool(home.market)}`, value);
    }
  });
  return { byAbbrev, bySchool };
}

// A couple of NFL codes SportsBettingDime spells differently than CBS.
const ABBREV_ALIASES = { JAC: 'JAX', LAR: 'LA' };
const alias = (code) => ABBREV_ALIASES[code] || code;

export function findSplitForGame(splits, sideA, sideB, nameA, nameB) {
  const byAbbrevEntry = splits.byAbbrev.get(`${alias(sideA)}@${alias(sideB)}`);
  if (byAbbrevEntry) return byAbbrevEntry.pctAway;
  if (nameA && nameB) {
    const bySchoolEntry = splits.bySchool.get(`${canonicalSchool(nameA)}@${canonicalSchool(nameB)}`);
    if (bySchoolEntry) return bySchoolEntry.pctAway;
  }
  return null;
}
