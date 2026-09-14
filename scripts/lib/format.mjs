export function formatKickoffCentral(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit',
  }).format(d);
  return `${datePart} · ${timePart} CT`;
}
