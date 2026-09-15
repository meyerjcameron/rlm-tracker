import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Special-teams specialist roles aren't meaningful "starter is out" signals
// the way an offensive/defensive starter is -- excluded from the starter set.
const EXCLUDED_POSITIONS = new Set(['Punter', 'Kicker', 'Long Snapper', 'Holder', 'Punt Returner', 'Kick Returner']);

// Returns a Set of short-name strings ("J. Allen") for every current
// offense/defense starter on a team -- matches the same short-name format
// CBS's injury report uses, so the two can be cross-referenced directly.
export async function fetchStarters(teamCode, teamSlug) {
  if (!teamSlug) return new Set();
  const url = `https://www.cbssports.com/nfl/teams/${teamCode}/${teamSlug}/depth-chart/`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`CBS depth chart fetch failed: ${res.status} (${teamCode})`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const starters = new Set();
  $('table').each((_, table) => {
    $(table).find('tbody tr').each((__, tr) => {
      const tds = $(tr).find('td');
      const position = $(tds[0]).text().trim();
      if (EXCLUDED_POSITIONS.has(position)) return;
      const name = $(tds[1]).find('.CellPlayerName--short a').first().text().trim();
      if (name) starters.add(name);
    });
  });
  return starters;
}
