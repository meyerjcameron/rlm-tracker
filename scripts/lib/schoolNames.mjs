// Different sites spell the same school differently (NCAA.com's rankings say
// "Southern Cal", CBS's odds page says "USC"; NCAA says "Miami (FL)", CBS says
// "Miami (Fla.)"). Normalize + alias so lookups match regardless of source.
export function normalizeSchool(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\(fla\)/g, '(fl)')
    .replace(/\(ohio\)/g, '(oh)')
    // Sites disagree on whether the state qualifier gets parens at all --
    // CBS says "Miami (Fla.)"/"Miami (Ohio)", Cleatz says "Miami FL"/"Miami
    // OH" -- strip the parens themselves (keeping their contents) so both
    // converge to the same string. Only applied to the two qualifiers
    // above, so this can't clip an unrelated "(Ohio)"-free "Ohio State".
    .replace(/[()]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // CBS abbreviates "State" as "St." (already stripped to a trailing
    // "st" above) for many schools -- "Kent St.", "Arizona St.", "Ball
    // St." -- while other sources spell it out ("Kent State"). Normalize
    // the trailing form so both converge.
    .replace(/\bst$/, 'state');
}

const ALIASES = {
  'southern cal': 'usc',
  'ole miss': 'ole miss',
  'nc state': 'nc state',
  'n c state': 'nc state',
  // CBS shortens regional qualifiers to a single letter that other sites
  // spell out -- "C." is ambiguous on its own (Coastal vs Central), so
  // these need to be listed explicitly rather than pattern-matched.
  'c carolina': 'coastal carolina',
  'e michigan': 'eastern michigan',
  'c michigan': 'central michigan',
  'w michigan': 'western michigan',
  'w kentucky': 'western kentucky',
  'miss state': 'mississippi state',
  'n illinois': 'northern illinois',
  'cent ark': 'central arkansas',
  'uconn': 'connecticut',
  'nc central': 'north carolina central',
  'ga southern': 'georgia southern',
  'so miss': 'southern miss',
  'app state': 'appalachian state',
  'ul monroe': 'louisiana monroe',
  'umass': 'massachusetts',
  'fau': 'florida atlantic',
};

export function canonicalSchool(name) {
  const n = normalizeSchool(name);
  return ALIASES[n] || n;
}
