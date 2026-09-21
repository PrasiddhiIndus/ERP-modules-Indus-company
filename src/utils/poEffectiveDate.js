/**
 * PO Effective Date helpers for Commercial Manpower / Training POs.
 */

function toIsoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function validatePoEffectiveDate(po) {
  const effective = toIsoDate(po?.poEffectiveDate || po?.po_effective_date || '');
  const end = toIsoDate(po?.endDate || po?.end_date || '');
  if (!effective) return null;
  if (end && effective > end) {
    return 'PO Effective Date cannot be after PO End Date.';
  }
  return null;
}
