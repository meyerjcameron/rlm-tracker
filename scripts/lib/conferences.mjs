import { canonicalSchool } from './schoolNames.mjs';

// Today's Power 4 conferences (Pac-12 collapsed in the 2023-24 realignment).
// Keyed by CBS's own full school-name text (e.g. "Texas Tech", "Miami (Fla.)").
const CONFERENCE_SCHOOLS = {
  SEC: [
    'Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia', 'Kentucky', 'LSU',
    'Mississippi State', 'Missouri', 'Oklahoma', 'Ole Miss', 'South Carolina',
    'Tennessee', 'Texas', 'Texas A&M', 'Vanderbilt',
  ],
  'Big Ten': [
    'Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan', 'Michigan State',
    'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State', 'Oregon',
    'Penn State', 'Purdue', 'Rutgers', 'UCLA', 'USC', 'Washington', 'Wisconsin',
  ],
  'Big 12': [
    'Arizona', 'Arizona State', 'Baylor', 'BYU', 'Cincinnati', 'Colorado',
    'Houston', 'Iowa State', 'Kansas', 'Kansas State', 'Oklahoma State', 'TCU',
    'Texas Tech', 'UCF', 'Utah', 'West Virginia',
  ],
  ACC: [
    'Boston College', 'California', 'Clemson', 'Duke', 'Florida State',
    'Georgia Tech', 'Louisville', 'Miami (Fla.)', 'NC State', 'North Carolina',
    'Pittsburgh', 'SMU', 'Stanford', 'Syracuse', 'Virginia', 'Virginia Tech',
    'Wake Forest',
  ],
};

const SCHOOL_TO_CONFERENCE = new Map();
for (const [conf, schools] of Object.entries(CONFERENCE_SCHOOLS)) {
  schools.forEach((s) => SCHOOL_TO_CONFERENCE.set(canonicalSchool(s), conf));
}
SCHOOL_TO_CONFERENCE.set(canonicalSchool('Notre Dame'), 'Independent');

export const MAJOR_CONFERENCES = ['SEC', 'Big Ten', 'ACC', 'Big 12'];

export function conferenceForSchool(name) {
  return SCHOOL_TO_CONFERENCE.get(canonicalSchool(name)) || null;
}
