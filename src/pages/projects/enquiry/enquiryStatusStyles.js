/**
 * Row background colors — matches the same palette used across other modules
 * (POEntry uses bg-info-soft header / white rows; enquiry adds status tinting).
 * Inline styles are used so Tailwind purge never strips runtime values.
 */

import { TOKENS } from '../../../theme/tokens';

export const STATUS_LEGEND = [
  { status: 'Not Started',      bg: TOKENS.warningSoft, label: 'Not Started' },
  { status: 'Work in Progress', bg: TOKENS.infoSoft, label: 'Work in Progress' },
  { status: 'Completed',        bg: TOKENS.successSoft, label: 'Completed' },
  { status: 'Regret',           bg: TOKENS.criticalSoft, label: 'Regret' },
];

const STATUS_COLOR_MAP = {
  'not started':      TOKENS.warningSoft,
  'work in progress': TOKENS.infoSoft,
  'wip':              TOKENS.infoSoft,
  'completed':        TOKENS.successSoft,
  'regret':           TOKENS.criticalSoft,
};

export function getStatusBg(status) {
  const key = String(status || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return STATUS_COLOR_MAP[key] ?? TOKENS.surface;
}

export function getRowStatusValue(row) {
  return row?.data?.current_status ?? row?.current_status ?? '';
}
