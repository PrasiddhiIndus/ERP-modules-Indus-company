/**
 * INDUS OS design tokens for JS consumers (charts, status maps, PDF/canvas).
 * Keep hex literals here only — UI components must import from this module.
 */

export const TOKENS = Object.freeze({
  canvas: '#F5F7FA',
  surface: '#F8FAFC',
  surfaceRaised: '#F5F7FA',
  surfaceSunken: '#E8EEF5',
  border: '#C5CED9',
  borderStrong: '#AEB8C6',
  divider: '#DDE3EB',

  text: '#12151A',
  textStrong: '#0E1116',
  textSecondary: '#3A414C',
  textMuted: '#4A5260',
  textCaption: '#454D5A',
  textDisabled: '#7A8494',

  accent: '#3D5C56',
  accentDeep: '#2F4843',
  accentSoft: '#E4EBE7',
  accentBorder: '#B7C9C2',

  critical: '#8A4A3F',
  criticalSoft: '#F3E6E3',
  criticalBorder: '#D9B8B1',
  warning: '#7A5C28',
  warningSoft: '#F2EADC',
  warningBorder: '#D4C19A',
  neutralState: '#5C636E',
  neutralStateSoft: '#E8EEF5',
  success: '#4A6144',
  successSoft: '#E4EBE4',
  info: '#3F5470',
  infoSoft: '#E4EAF2',

  chartGrid: '#DDE3EB',
  chartAxis: '#4A5260',
  chartInactive: '#D0D7E0',
  rowHover: '#EEF3F8',
  skeletonFrom: '#DCE3EC',
  skeletonTo: '#F5F7FA',
});

/** Ordered chart series — use exactly this order, no others. */
export const CHART_SERIES = Object.freeze([
  TOKENS.accent,
  TOKENS.info,
  '#8F7038',
  TOKENS.critical,
  TOKENS.neutralState,
  TOKENS.success,
]);

export const CHART_SERIES_AREA = Object.freeze(
  CHART_SERIES.map((c) => `${c}12`) // ~7% opacity as 8-digit hex
);

/** Semantic chip / badge tone classes (Tailwind token aliases). */
export const STATUS_TONES = Object.freeze({
  critical: 'bg-critical-soft text-critical border-critical-border',
  warning: 'bg-warning-soft text-warning border-warning-border',
  high: 'bg-warning-soft text-warning border-warning-border',
  pending: 'bg-warning-soft text-warning border-warning-border',
  neutral: 'bg-neutral-soft text-neutral-state border-neutral-border',
  draft: 'bg-neutral-soft text-neutral-state border-neutral-border',
  cancelled: 'bg-neutral-soft text-neutral-state border-neutral-border',
  success: 'bg-success-soft text-success border-success-border',
  approved: 'bg-success-soft text-success border-success-border',
  live: 'bg-accent-soft text-accent border-accent-border',
  info: 'bg-info-soft text-info border-info-border',
});

/** RGB tuples for PDF / canvas libraries that cannot use CSS vars. */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const PDF_RGB = Object.freeze({
  text: hexToRgb(TOKENS.text),
  muted: hexToRgb(TOKENS.textMuted),
  accent: hexToRgb(TOKENS.accent),
  border: hexToRgb(TOKENS.border),
  critical: hexToRgb(TOKENS.critical),
  success: hexToRgb(TOKENS.success),
  warning: hexToRgb(TOKENS.warning),
  info: hexToRgb(TOKENS.info),
});
