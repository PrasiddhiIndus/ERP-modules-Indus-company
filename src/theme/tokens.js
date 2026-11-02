/**
 * INDUS OS design tokens for JS consumers (charts, status maps, PDF/canvas).
 * Light values = premium indigo redesign. Dark chart series preserved separately.
 */

export const TOKENS = Object.freeze({
  canvas: '#F1F3F9',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#E9EDF6',
  border: '#D5DBE8',
  borderStrong: '#B8C0D4',
  divider: '#E4E8F2',

  text: '#202943',
  textStrong: '#171D35',
  textSecondary: '#68738D',
  textMuted: '#929BB0',
  textCaption: '#7A849C',
  textDisabled: '#AEB6C8',

  accent: '#4355DB',
  accentDeep: '#303FAD',
  accentSoft: '#E9ECFF',
  accentBorder: '#C5CCF5',
  accentElectric: '#5278F5',
  accentViolet: '#8064DB',

  critical: '#D64B59',
  criticalSoft: '#FDECEE',
  criticalBorder: '#F0B4BA',
  warning: '#C68A25',
  warningSoft: '#FBF3E3',
  warningBorder: '#E8D0A0',
  neutralState: '#68738D',
  neutralStateSoft: '#E9EDF6',
  success: '#168653',
  successSoft: '#E3F5EC',
  info: '#159BC5',
  infoSoft: '#E3F5FB',
  teal: '#0D9F8C',

  chartGrid: '#E4E8F2',
  chartAxis: '#68738D',
  chartInactive: '#CFD5E4',
  rowHover: '#EEF1FB',
  skeletonFrom: '#E4E8F2',
  skeletonTo: '#F7F8FC',

  sidebarBg: '#171D35',
  sidebarElevated: '#222B49',
});

/** Pre-redesign dark chart colors — keep dark mode charts visually stable. */
export const TOKENS_DARK_CHART = Object.freeze({
  accent: '#3D5C56',
  info: '#3F5470',
  warning: '#8F7038',
  critical: '#8A4A3F',
  neutral: '#5C636E',
  success: '#4A6144',
});

/** Ordered chart series — light theme (indigo SaaS). */
export const CHART_SERIES = Object.freeze([
  TOKENS.accent,
  TOKENS.accentElectric,
  TOKENS.teal,
  TOKENS.critical,
  TOKENS.accentViolet,
  TOKENS.success,
]);

/** Dark theme chart series — unchanged from pre-redesign greens. */
export const CHART_SERIES_DARK = Object.freeze([
  TOKENS_DARK_CHART.accent,
  TOKENS_DARK_CHART.info,
  TOKENS_DARK_CHART.warning,
  TOKENS_DARK_CHART.critical,
  TOKENS_DARK_CHART.neutral,
  TOKENS_DARK_CHART.success,
]);

export const CHART_SERIES_AREA = Object.freeze(
  CHART_SERIES.map((c) => `${c}14`)
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
  accent: hexToRgb(TOKENS.accent),
  text: hexToRgb(TOKENS.text),
  muted: hexToRgb(TOKENS.textMuted),
  border: hexToRgb(TOKENS.border),
  critical: hexToRgb(TOKENS.critical),
});

/** Resolve chart series for current document theme (keeps dark charts stable). */
export function chartSeriesForDocument() {
  if (typeof document !== 'undefined') {
    const dark =
      document.documentElement.getAttribute('data-theme') === 'dark' ||
      document.documentElement.classList.contains('theme-dark');
    if (dark) return CHART_SERIES_DARK;
  }
  return CHART_SERIES;
}
