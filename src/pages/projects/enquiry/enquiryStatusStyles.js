/**
 * Row background colors — matches the same palette used across other modules
 * (POEntry uses bg-info-soft header / white rows; enquiry adds status tinting).
 * Inline styles are used so Tailwind purge never strips runtime values.
 */

import { UI_TOKENS } from '../../../theme/tokens';

export const STATUS_LEGEND = [
  { status: 'Not Started',      bg: UI_TOKENS.warningSoft, label: 'Not Started' },
  { status: 'Work in Progress', bg: UI_TOKENS.infoSoft, label: 'Work in Progress' },
  { status: 'Completed',        bg: UI_TOKENS.successSoft, label: 'Completed' },
  { status: 'Regret',           bg: UI_TOKENS.criticalSoft, label: 'Regret' },
];

const STATUS_COLOR_MAP = {
  'not started':      UI_TOKENS.warningSoft,
  'work in progress': UI_TOKENS.infoSoft,
  'wip':              UI_TOKENS.infoSoft,
  'completed':        UI_TOKENS.successSoft,
  'regret':           UI_TOKENS.criticalSoft,
};

export function getStatusBg(status) {
  const key = String(status || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return STATUS_COLOR_MAP[key] ?? UI_TOKENS.surface;
}

export function getRowStatusValue(row) {
  return row?.data?.current_status ?? row?.current_status ?? '';
}

const STATUS_DISPLAY_RANK = {
  'not started': 0,
  '': 0,
  'work in progress': 1,
  wip: 1,
  regret: 2,
  completed: 3,
};

/** List position of a status: Not Started, Work in Progress, Regret, Completed (others with in-progress). */
export function getStatusRank(status) {
  const key = String(status || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return STATUS_DISPLAY_RANK[key] ?? 1;
}
