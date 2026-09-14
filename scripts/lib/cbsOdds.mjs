import * as cheerio from 'cheerio';
import { toNflAbbrev } from './teams.mjs';
import { canonicalSchool } from './schoolNames.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function parseFirstNumber(text) {
  const m = String(text || '').match(/([+-]?\d+(\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

// The visible "Spread"/"Total" cells always show today's live number; the
// "Open" column is asymmetric by design -- the away team's row carries the
// game's opening total, the home team's row carries the opening spread
// (that team's own number). Verified against CBS's own real numbers for
// ATL@PIT and DEN@KC while building this.
function parseTeamRow($, tr) {
  const $tr = $(tr);
  const href = $tr.find('a[href*="/teams/"]').first().attr('href') || '';
  const hrefMatch = href.match(/\/teams\/([A-Za-z0-9]+)\//);
  const code = (hrefMatch ? hrefMatch[1] : $tr.find('.OddsBlock-teamText--short').first().text().trim()).toUpperCase();
  const fullName = $tr.find('.OddsBlock-teamText--long').first().text().trim();
  const scoreText = $tr.find('.OddsBlock-betOdds--score').first().text().trim();
  return {
    code,
    fullName,
    score: scoreText === '' ? null : Number(scoreText),
    openingText: $tr.find('.OddsBlock-betOdds--openingLines').first().text().replace(/\s+/g, ' ').trim(),
    spreadText: $tr.find('.OddsBlock-betOdds--spread').first().text().replace(/\s+/g, ' ').trim(),
  };
}

export async function fetchCbsOdds(url, sport) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`CBS odds fetch failed: ${res.status} ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // NFL's ".OddsBlock-teamText--long" is mascot-only ("Broncos"), so NFL
  // games match the ItemList by abbreviation. CFB's is the full school name
  // ("Texas Tech"), but the ItemList's own name there includes the mascot
  // too ("Texas Tech Red Raiders") -- so CFB matches by prefix instead.
  const kickoffByAbbrevPair = new Map();
  const itemListEntries = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try { data = JSON.parse($(el).contents().text()); } catch (e) { return; }
    const items = data && data.mainEntity && data.mainEntity.itemListElement;
    if (!Array.isArray(items)) return;
    items.forEach((it) => {
      const ev = it && it.item;
      if (!ev || !Array.isArray(ev.competitor) || ev.competitor.length !== 2) return;
      const info = { startDate: ev.startDate, status: ev.eventStatus };

      const abbrevs = ev.competitor.map((c) => toNflAbbrev(c.name)).filter(Boolean);
      if (abbrevs.length === 2) kickoffByAbbrevPair.set(abbrevs.slice().sort().join('|'), info);

      itemListEntries.push({ names: ev.competitor.map((c) => canonicalSchool(c.name)), info });
    });
  });

  function findKickoffByPrefix(nameA, nameB) {
    if (!nameA || !nameB) return null;
    const a = canonicalSchool(nameA);
    const b = canonicalSchool(nameB);
    const entry = itemListEntries.find(({ names: [n1, n2] }) => (
      (n1.startsWith(a) && n2.startsWith(b)) || (n1.startsWith(b) && n2.startsWith(a))
    ));
    return entry ? entry.info : null;
  }

  const games = [];
  $('table.OddsBlock-game').each((_, table) => {
    const $table = $(table);
    const abbrev = $table.attr('data-game-abbrev');
    if (!abbrev) return;
    const m = abbrev.match(/^([A-Z]+)_(\d{8})_([A-Za-z0-9]+)@([A-Za-z0-9]+)$/);
    if (!m) return;

    const rows = $table.find('tbody > tr').filter((_, tr) => $(tr).find('.OddsBlock-teamText--short').length > 0);
    if (rows.length < 2) return;
    const away = parseTeamRow($, rows.get(0));
    const home = parseTeamRow($, rows.get(1));
    if (!away.code || !home.code) return;

    const homeSpreadOpen = parseFirstNumber(home.openingText);
    const awaySpreadOpen = homeSpreadOpen === null ? null : -homeSpreadOpen;
    const awaySpreadCurrent = parseFirstNumber(away.spreadText);

    const kickoff = kickoffByAbbrevPair.get([away.code, home.code].slice().sort().join('|'))
      || findKickoffByPrefix(away.fullName, home.fullName);

    const isFinal = away.score !== null && home.score !== null && (away.score > 0 || home.score > 0)
      && /OddsBlock-game--final(?!\w)/.test($table.attr('class') || '');

    games.push({
      sport,
      sideA: away.code,
      sideB: home.code,
      nameA: away.fullName,
      nameB: home.fullName,
      matchup: `${away.code} @ ${home.code}`,
      spreadOpen: awaySpreadOpen,
      spreadCurrent: awaySpreadCurrent,
      score: isFinal ? { a: away.score, b: home.score } : null,
      kickoffISO: kickoff ? kickoff.startDate : null,
    });
  });

  return games;
}
