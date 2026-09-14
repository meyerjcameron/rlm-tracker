// Different sites spell the same school differently (NCAA.com's rankings say
// "Southern Cal", CBS's odds page says "USC"; NCAA says "Miami (FL)", CBS says
// "Miami (Fla.)"). Normalize + alias so lookups match regardless of source.
export function normalizeSchool(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\(fla\)/g, '(fl)')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIASES = {
  'southern cal': 'usc',
  'ole miss': 'ole miss',
  'nc state': 'nc state',
  'n c state': 'nc state',
};

export function canonicalSchool(name) {
  const n = normalizeSchool(name);
  return ALIASES[n] || n;
}
