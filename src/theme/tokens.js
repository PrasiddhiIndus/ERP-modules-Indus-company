/**
 * INDUS OS design tokens for JS consumers (charts, status maps, PDF/canvas).
 * `TOKENS` = static light hexes (exports, PDF, persisted values).
 * `UI_TOKENS` / `CHART_SERIES` = theme-aware CSS variables for on-screen UI.
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

/**
 * Theme-aware tokens for anything rendered in the DOM / SVG (inline styles,
 * Recharts props, CSS custom properties). Values are CSS variables, so they
 * follow light/dark automatically and update live when the theme is toggled.
 *
 * Semantic colours resolve to the foreground (`-text`) variant: identical to
 * the fill in light mode, lifted in dark mode so text, icons, chart strokes
 * and bars stay readable on dark surfaces. Use `UI_FILLS` for solid fills
 * that carry white text.
 *
 * Use `TOKENS` (static light hexes) only where CSS variables cannot work:
 * PDF / canvas / Excel exports and values persisted to the database.
 */
export const UI_TOKENS = Object.freeze({
  canvas: 'var(--canvas)',
  surface: 'var(--surface)',
  surfaceRaised: 'var(--surface-raised)',
  surfaceSunken: 'var(--surface-sunken)',
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  divider: 'var(--divider)',

  text: 'var(--text)',
  textStrong: 'var(--text-strong)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textCaption: 'var(--text-caption)',
  textDisabled: 'var(--text-disabled)',

  accent: 'var(--accent-text)',
  accentDeep: 'var(--accent-deep-text)',
  accentSoft: 'var(--accent-soft)',
  accentBorder: 'var(--accent-border)',
  accentElectric: 'var(--chart-2)',
  accentViolet: 'var(--chart-5)',

  critical: 'var(--critical-text)',
  criticalSoft: 'var(--critical-soft)',
  criticalBorder: 'var(--critical-border)',
  warning: 'var(--warning-text)',
  warningSoft: 'var(--warning-soft)',
  warningBorder: 'var(--warning-border)',
  neutralState: 'var(--neutral-state-text)',
  neutralStateSoft: 'var(--neutral-state-soft)',
  success: 'var(--success-text)',
  successSoft: 'var(--success-soft)',
  info: 'var(--info-text)',
  infoSoft: 'var(--info-soft)',
  teal: 'var(--teal-text)',

  chartGrid: 'var(--chart-grid)',
  chartAxis: 'var(--chart-axis)',
  chartInactive: 'var(--chart-inactive)',
  rowHover: 'var(--row-hover)',
  skeletonFrom: 'var(--skeleton-from)',
  skeletonTo: 'var(--skeleton-to)',

  sidebarBg: 'var(--sidebar-bg)',
  sidebarElevated: 'var(--sidebar-bg-elevated)',
  onSolid: 'var(--on-solid)',
});

/** Solid fills that carry `onSolid` (white) text in both themes. */
export const UI_FILLS = Object.freeze({
  accent: 'var(--accent)',
  accentDeep: 'var(--accent-deep)',
  critical: 'var(--critical)',
  warning: 'var(--warning)',
  success: 'var(--success)',
  info: 'var(--info)',
  teal: 'var(--teal)',
  neutral: 'var(--solid-neutral-600)',
  neutralStrong: 'var(--solid-neutral-800)',
});

/** Static light hexes of the chart series — exports / canvas only. */
export const CHART_SERIES_HEX = Object.freeze([
  TOKENS.accent,
  TOKENS.accentElectric,
  TOKENS.teal,
  TOKENS.critical,
  TOKENS.accentViolet,
  TOKENS.success,
]);

/**
 * Ordered chart series — theme-aware (`--chart-1` … `--chart-6`).
 * Light values equal CHART_SERIES_HEX; dark values are tuned for dark surfaces.
 */
export const CHART_SERIES = Object.freeze([
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
]);

/** @deprecated CHART_SERIES is theme-aware; kept for existing imports. */
export const CHART_SERIES_DARK = CHART_SERIES;

export const CHART_SERIES_AREA = Object.freeze(
  CHART_SERIES.map((c) => `color-mix(in srgb, ${c} 8%, transparent)`)
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

/** Chart series for the current theme (CSS variables follow the theme). */
export function chartSeriesForDocument() {
  return CHART_SERIES;
}
