/** Aggregations behind the Lead Dashboard charts. Pure functions — easy to test. */

export const UNSPECIFIED = 'Not specified';

/** Dimensions users can slice leads by. Order drives the dashboard layout. */
export const LEAD_DIMENSIONS = [
  { key: 'industry', label: 'Industry' },
  { key: 'project_state', label: 'Project state' },
  { key: 'project_stage', label: 'Project stage' },
  { key: 'project_type', label: 'Project type' },
  { key: 'ownership', label: 'Ownership' },
];

export function emptyLeadFilters() {
  return LEAD_DIMENSIONS.reduce((acc, d) => ({ ...acc, [d.key]: null }), {});
}

export function dimensionValue(lead, key) {
  const raw = lead?.[key];
  const text = raw == null ? '' : String(raw).trim();
  return text || UNSPECIFIED;
}

export function activeFilterEntries(filters) {
  return LEAD_DIMENSIONS.filter((d) => filters?.[d.key]).map((d) => ({
    key: d.key,
    label: d.label,
    value: filters[d.key],
  }));
}

/**
 * Rows matching every active filter. Pass `exceptKey` to ignore one dimension —
 * that keeps a chart showing all of its own options while other filters apply.
 */
export function filterLeads(rows, filters, exceptKey = null) {
  const active = LEAD_DIMENSIONS.filter((d) => d.key !== exceptKey && filters?.[d.key]);
  if (!active.length) return [...(rows || [])];
  return (rows || []).filter((row) =>
    active.every((d) => dimensionValue(row, d.key) === filters[d.key])
  );
}

/** Counts per value, biggest first, with each slice's share of the total. */
export function groupLeadsBy(rows, key) {
  const counts = new Map();
  for (const row of rows || []) {
    const name = dimensionValue(row, key);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const total = (rows || []).length;
  return [...counts.entries()]
    .map(([name, value]) => ({
      name,
      value,
      share: total ? Math.round((value / total) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Keep the biggest slices readable; everything else rolls into one bucket. */
export function topSlices(rows, limit = 8, restLabel = 'Other') {
  const list = rows || [];
  if (list.length <= limit) return list;
  const head = list.slice(0, limit);
  const restValue = list.slice(limit).reduce((sum, r) => sum + (Number(r.value) || 0), 0);
  const restShare = list.slice(limit).reduce((sum, r) => sum + (Number(r.share) || 0), 0);
  return [...head, { name: restLabel, value: restValue, share: restShare, __rest: true }];
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthKeyOf(lead) {
  const raw = lead?.sheet_updated_on || lead?.created_at;
  if (!raw) return '';
  const text = String(raw);
  const match = text.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Last N months of lead activity, oldest first, based on the sheet's Updated On. */
export function bucketLeadsByMonth(rows, months = 12, now = new Date()) {
  const buckets = new Map();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, {
      name: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      value: 0,
    });
  }
  for (const row of rows || []) {
    const key = monthKeyOf(row);
    if (key && buckets.has(key)) buckets.get(key).value += 1;
  }
  return [...buckets.values()];
}

export function summarizeLeads(rows) {
  const list = rows || [];
  const distinct = (key) =>
    new Set(
      list
        .map((r) => String(r?.[key] ?? '').trim())
        .filter(Boolean)
    ).size;

  return {
    leads: list.length,
    companies: distinct('company'),
    states: distinct('project_state'),
    industries: distinct('industry'),
    stages: distinct('project_stage'),
  };
}
