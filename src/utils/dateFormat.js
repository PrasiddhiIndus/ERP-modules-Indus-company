const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * UI date format: DD-Mon-YYYY (e.g. 09-Apr-2026)
 * Accepts Date | ISO string | timestamp string/number.
 */
export function formatDdMonYyyy(value) {
  if (!value) return '–';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '–';
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()] || '–';
  const yyyy = d.getFullYear();
  return `${dd}-${mon}-${yyyy}`;
}

