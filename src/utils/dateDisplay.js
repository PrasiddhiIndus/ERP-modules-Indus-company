/**
 * Table/display helper: yyyy-mm-dd, ISO, or dd/mm/yyyy → dd/mm/yyyy
 */
export function formatDateDdMmYyyy(value) {
  if (value == null || String(value).trim() === '') return '';
  const s = String(value).trim();
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return `${String(slash[1]).padStart(2, '0')}/${String(slash[2]).padStart(2, '0')}/${slash[3]}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return s;
}
