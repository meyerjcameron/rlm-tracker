import * as cheerio from 'cheerio';
import { canonicalSchool } from './schoolNames.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const AP_POLL_URL = 'https://www.ncaa.com/rankings/football/fbs/associated-press';

// Returns a Map of canonicalized school name -> AP Top 25 rank (1-25).
export async function fetchTop25() {
  const res = await fetch(AP_POLL_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`AP poll fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const ranked = new Map();
  $('table').first().find('tbody tr, tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 2) return;
    const rank = parseInt($(cells[0]).text().trim(), 10);
    if (!rank || rank < 1 || rank > 25) return;
    const rawName = $(cells[1]).text().replace(/\s+/g, ' ').trim();
    // Strip a trailing first-place-votes count like "Texas (56)", but keep a
    // school qualifier like "Miami (FL)" (only strip parens whose content is
    // purely digits).
    const name = rawName.replace(/\s*\(\d+\)\s*$/, '').trim();
    if (!name) return;
    ranked.set(canonicalSchool(name), rank);
  });
  return ranked;
}
