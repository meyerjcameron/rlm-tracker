import * as cheerio from 'cheerio';
import { canonicalSchool } from './schoolNames.mjs';
import { toNflAbbrev } from './teams.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const URLS = {
  NFL: 'https://cleatz.com/public-betting/nfl/',
  CFB: 'https://cleatz.com/public-betting/college-football/',
};

function parsePct(text) {
  const n = parseFloat((text || '').replace('%', '').trim());
  return Number.isNaN(n) ? null : n;
}

// Cleatz renders the whole board server-side (no separate API call to hit,
// unlike SportsBettingDime) -- each game is a <div class="ccsp-game"> with
// a spread panel holding two .ccsp-side blocks, each with a "Bets" row
// (ticket %, same shape of signal SBD already gives us) and a "Handle" row
// (money %) in away/home order matching the header above them. Handle % is
// the piece we don't have anywhere else: a few large sharp bets can swing
// it far from the ticket count, which is the classic "smart money" tell.
//
// Returns { byAbbrev, bySchool }, each a Map of "AWAY@HOME" ->
// { handleAway, handleHome } (money % per side). NFL games carry team-logo
// filenames to key off of; CFB games are plain school-name text, so those
// key off canonicalSchool() the same way SportsBettingDime's CFB matching
// does.
export async function fetchHandlePercents(sport) {
  const url = URLS[sport];
  if (!url) return { byAbbrev: new Map(), bySchool: new Map() };
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Cleatz fetch failed: ${res.status} (${sport})`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const byAbbrev = new Map();
  const bySchool = new Map();

  $('.ccsp-game').each((_, el) => {
    const $g = $(el);
    const teamSpans = $g.find('.ccsp-teams > span').not('.ccsp-at');
    if (teamSpans.length !== 2) return;
    const $away = $(teamSpans[0]);
    const $home = $(teamSpans[1]);

    const spreadPanel = $g.find('[data-cgd-panel="spread"]').first();
    const sides = spreadPanel.find('.ccsp-side');
    if (sides.length !== 2) return;
    const handleOf = (sideEl) => parsePct($(sideEl).find('.ccsp-bar-row[data-lbl="Handle"] .ccsp-bar-pct').first().text());
    const handleAway = handleOf(sides[0]);
    const handleHome = handleOf(sides[1]);
    if (handleAway === null || handleHome === null) return;
    const value = { handleAway, handleHome };

    const awayLogo = ($away.find('img').attr('src') || '').match(/team-logos\/([a-z0-9]+)\.png/i);
    const homeLogo = ($home.find('img').attr('src') || '').match(/team-logos\/([a-z0-9]+)\.png/i);
    if (awayLogo && homeLogo) {
      const awayAbbrev = toNflAbbrev(awayLogo[1]);
      const homeAbbrev = toNflAbbrev(homeLogo[1]);
      if (awayAbbrev && homeAbbrev) byAbbrev.set(`${awayAbbrev}@${homeAbbrev}`, value);
    }

    const awaySchool = $away.clone().find('img').remove().end().text().trim();
    const homeSchool = $home.clone().find('img').remove().end().text().trim();
    if (awaySchool && homeSchool) {
      bySchool.set(`${canonicalSchool(awaySchool)}@${canonicalSchool(homeSchool)}`, value);
    }
  });

  return { byAbbrev, bySchool };
}

export function findHandleForGame(data, sideA, sideB, nameA, nameB) {
  const byAbbrevEntry = data.byAbbrev.get(`${sideA}@${sideB}`);
  if (byAbbrevEntry) return byAbbrevEntry;
  if (nameA && nameB) {
    const bySchoolEntry = data.bySchool.get(`${canonicalSchool(nameA)}@${canonicalSchool(nameB)}`);
    if (bySchoolEntry) return bySchoolEntry;
  }
  return null;
}
