import * as cheerio from 'cheerio';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Statuses that mean a player is definitely not playing this week (as
// opposed to Questionable/Doubtful, which are still uncertain).
const OUT_STATUSES = ['Out', 'IR', 'Injured Reserve', 'Physically Unable to Perform', 'NFI', 'Suspended'];

function isOutStatus(statusText) {
  return OUT_STATUSES.some((s) => statusText.startsWith(s));
}

// Returns a Map<teamCode, Array<{ name, position, status }>> for every
// player currently listed as Out/IR/PUP/NFI/Suspended across the league.
export async function fetchInjuryReport() {
  const res = await fetch('https://www.cbssports.com/nfl/injuries/', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`CBS injuries fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const byTeam = new Map();
  $('.TableBaseWrapper').each((_, wrapper) => {
    const $wrapper = $(wrapper);
    const teamHref = $wrapper.find('h4 a').first().attr('href') || '';
    const teamMatch = teamHref.match(/\/teams\/([A-Za-z0-9]+)\//);
    if (!teamMatch) return;
    const teamCode = teamMatch[1].toUpperCase();

    const players = [];
    $wrapper.find('tbody tr').each((__, tr) => {
      const $tr = $(tr);
      const tds = $tr.find('td');
      const name = $(tds[0]).find('.CellPlayerName--short').text().trim();
      const position = $(tds[1]).text().trim();
      const statusText = $(tds[4]).text().replace(/\s+/g, ' ').trim();
      if (!name || !isOutStatus(statusText)) return;
      const status = OUT_STATUSES.find((s) => statusText.startsWith(s));
      players.push({ name, position, status });
    });
    if (players.length) byTeam.set(teamCode, players);
  });
  return byTeam;
}
