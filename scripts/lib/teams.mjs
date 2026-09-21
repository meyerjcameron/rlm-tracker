// Maps CBS/Covers team names (full names or their own short codes) to the
// abbreviations already used throughout the tracker's stored game data.
export const NFL_TEAMS = {
  'buffalo bills': 'BUF', bills: 'BUF', buf: 'BUF',
  'miami dolphins': 'MIA', dolphins: 'MIA', mia: 'MIA',
  'new england patriots': 'NE', patriots: 'NE', ne: 'NE', nwe: 'NE',
  'new york jets': 'NYJ', jets: 'NYJ', nyj: 'NYJ',
  'baltimore ravens': 'BAL', ravens: 'BAL', bal: 'BAL',
  'cincinnati bengals': 'CIN', bengals: 'CIN', cin: 'CIN',
  'cleveland browns': 'CLE', browns: 'CLE', cle: 'CLE',
  'pittsburgh steelers': 'PIT', steelers: 'PIT', pit: 'PIT',
  'houston texans': 'HOU', texans: 'HOU', hou: 'HOU',
  'indianapolis colts': 'IND', colts: 'IND', ind: 'IND',
  'jacksonville jaguars': 'JAC', jaguars: 'JAC', jac: 'JAC', jax: 'JAC',
  'tennessee titans': 'TEN', titans: 'TEN', ten: 'TEN',
  'denver broncos': 'DEN', broncos: 'DEN', den: 'DEN',
  'kansas city chiefs': 'KC', chiefs: 'KC', kc: 'KC', kan: 'KC',
  'las vegas raiders': 'LV', raiders: 'LV', lv: 'LV', lvr: 'LV',
  'los angeles chargers': 'LAC', chargers: 'LAC', lac: 'LAC',
  'dallas cowboys': 'DAL', cowboys: 'DAL', dal: 'DAL',
  'new york giants': 'NYG', giants: 'NYG', nyg: 'NYG',
  'philadelphia eagles': 'PHI', eagles: 'PHI', phi: 'PHI',
  'washington commanders': 'WAS', commanders: 'WAS', was: 'WAS', wsh: 'WAS',
  'chicago bears': 'CHI', bears: 'CHI', chi: 'CHI',
  'detroit lions': 'DET', lions: 'DET', det: 'DET',
  'green bay packers': 'GB', packers: 'GB', gb: 'GB',
  'minnesota vikings': 'MIN', vikings: 'MIN', min: 'MIN',
  'atlanta falcons': 'ATL', falcons: 'ATL', atl: 'ATL',
  'carolina panthers': 'CAR', panthers: 'CAR', car: 'CAR',
  'new orleans saints': 'NO', saints: 'NO', no: 'NO', nor: 'NO',
  'tampa bay buccaneers': 'TB', buccaneers: 'TB', tb: 'TB', tam: 'TB',
  'arizona cardinals': 'ARI', cardinals: 'ARI', ari: 'ARI',
  'los angeles rams': 'LAR', rams: 'LAR', lar: 'LAR', la: 'LAR',
  'san francisco 49ers': 'SF', '49ers': 'SF', sf: 'SF', sfo: 'SF',
  'seattle seahawks': 'SEA', seahawks: 'SEA', sea: 'SEA',
};

export function normalizeTeamName(name) {
  return String(name || '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
}

export function toNflAbbrev(name) {
  const key = normalizeTeamName(name);
  return NFL_TEAMS[key] || null;
}
