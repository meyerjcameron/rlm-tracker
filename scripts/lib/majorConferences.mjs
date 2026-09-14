// Today's Power 4 conferences (Pac-12 collapsed in the 2023-24 realignment)
// plus Notre Dame as the one prominent football independent. Matched against
// CBS's own full school-name text for each team (e.g. "Texas Tech"), not
// abbreviations, since that's the one field CBS renders consistently.
export const MAJOR_CONFERENCE_SCHOOLS = new Set([
  // SEC
  'Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia', 'Kentucky', 'LSU',
  'Mississippi State', 'Missouri', 'Oklahoma', 'Ole Miss', 'South Carolina',
  'Tennessee', 'Texas', 'Texas A&M', 'Vanderbilt',
  // Big Ten
  'Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan', 'Michigan State',
  'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State', 'Oregon',
  'Penn State', 'Purdue', 'Rutgers', 'UCLA', 'USC', 'Washington', 'Wisconsin',
  // Big 12
  'Arizona', 'Arizona State', 'Baylor', 'BYU', 'Cincinnati', 'Colorado',
  'Houston', 'Iowa State', 'Kansas', 'Kansas State', 'Oklahoma State', 'TCU',
  'Texas Tech', 'UCF', 'Utah', 'West Virginia',
  // ACC
  'Boston College', 'California', 'Clemson', 'Duke', 'Florida State',
  'Georgia Tech', 'Louisville', 'Miami', 'Miami (FL)', 'NC State',
  'North Carolina', 'Pittsburgh', 'SMU', 'Stanford', 'Syracuse', 'Virginia',
  'Virginia Tech', 'Wake Forest',
  // Independent
  'Notre Dame',
]);

export function isMajorConferenceGame(nameA, nameB) {
  return MAJOR_CONFERENCE_SCHOOLS.has(nameA) || MAJOR_CONFERENCE_SCHOOLS.has(nameB);
}
