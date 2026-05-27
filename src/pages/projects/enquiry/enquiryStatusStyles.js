/**
 * Row background colors — matches the same palette used across other modules
 * (POEntry uses bg-[#f2f6ff] header / white rows; enquiry adds status tinting).
 * Inline styles are used so Tailwind purge never strips runtime values.
 */

export const STATUS_LEGEND = [
  { status: 'Not Started',      bg: '#fff3cd', label: 'Not Started' },
  { status: 'Work in Progress', bg: '#d1ecf1', label: 'Work in Progress' },
  { status: 'Completed',        bg: '#d4edda', label: 'Completed' },
  { status: 'Regret',           bg: '#f8d7da', label: 'Regret' },
];

const STATUS_COLOR_MAP = {
  'not started':      '#fff3cd',
  'work in progress': '#d1ecf1',
  'wip':              '#d1ecf1',
  'completed':        '#d4edda',
  'regret':           '#f8d7da',
};

export function getStatusBg(status) {
  const key = String(status || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return STATUS_COLOR_MAP[key] ?? '#ffffff';
}

export function getRowStatusValue(row) {
  return row?.data?.current_status ?? row?.current_status ?? '';
}
