export const peInput =
  'w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white shadow-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all';
export const peLabel = 'block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5';

export const SECTION_LABELS = {
  main: null,
  contact: 'Contact details',
  assignment: 'Assignment & priority',
};

export function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

export function formatDisplayDate(value) {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (!y || !m || !d) return raw;
  return `${d}-${m}-${y}`;
}

export function slugifyKindKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
