import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Returns a map keyed "AWAY@HOME"-agnostic pair (sorted abbrevs joined by "|")
// to { pctByAbbrev: { [abbrev]: number } } -- Covers lists side A/B by their
// own left/right order, which doesn't reliably tell us away vs home, so
// callers match by team-pair rather than position.
export async function fetchCoversConsensus(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Covers fetch failed: ${res.status} ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const results = [];
  $('.covers-CoversConsensus-table--matchupColumn').each((_, td) => {
    const $td = $(td);
    const $row = $td.closest('tr');
    const teamLinkA = $td.find('.covers-CoversConsensus-table--teamBlock a').last();
    const teamLinkB = $td.find('.covers-CoversConsensus-table--teamBlock2 a').last();
    // Covers' own short codes (e.g. "Den", "Kc", "Lac") already match the
    // abbreviations used throughout the tracker once uppercased.
    const abbrevA = teamLinkA.text().trim().toUpperCase() || null;
    const abbrevB = teamLinkB.text().trim().toUpperCase() || null;
    if (!abbrevA || !abbrevB) return;

    const pctCells = $row.find('.covers-CoversConsensus-consensusTable--low, .covers-CoversConsensus-consensusTable--high');
    const pctA = parseInt(pctCells.eq(0).text().trim(), 10);
    const pctB = parseInt(pctCells.eq(1).text().trim(), 10);
    if (Number.isNaN(pctA) || Number.isNaN(pctB)) return;

    results.push({ abbrevA, abbrevB, pctA, pctB });
  });
  return results;
}

// Looks up a game's public% for sideA given the tracker's own sideA/sideB,
// regardless of which order Covers listed the teams in.
export function findConsensusForGame(consensusRows, sideA, sideB) {
  const row = consensusRows.find(
    (r) => (r.abbrevA === sideA && r.abbrevB === sideB) || (r.abbrevA === sideB && r.abbrevB === sideA),
  );
  if (!row) return null;
  return row.abbrevA === sideA ? row.pctA : row.pctB;
}
