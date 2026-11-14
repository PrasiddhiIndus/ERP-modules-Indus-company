/** @type {import('tailwindcss').Config} */
/**
 * INDUS OS Tailwind theme — maps utility classes onto design tokens in
 * src/theme/tokens.css. Prefer semantic token names (accent, critical, …).
 * Remapped default palettes keep legacy red/blue utilities from looking bright.
 */

const surface = {
  50: 'var(--canvas)',
  100: 'var(--surface-sunken)',
  200: 'var(--border)',
  300: 'var(--border-strong)',
  400: 'var(--text-disabled)',
  500: 'var(--text-muted)',
  600: 'var(--text-secondary)',
  700: 'var(--text-strong)',
  800: 'var(--text)',
  900: 'var(--text)',
  950: 'var(--text)',
};

const criticalScale = {
  50: 'var(--critical-soft)',
  100: 'var(--critical-soft)',
  200: 'var(--critical-border)',
  300: 'var(--critical-border)',
  400: 'var(--critical)',
  500: 'var(--critical)',
  600: 'var(--critical)',
  700: 'var(--critical)',
  800: 'var(--critical)',
  900: 'var(--critical)',
  950: 'var(--critical)',
};

const warningScale = {
  50: 'var(--warning-soft)',
  100: 'var(--warning-soft)',
  200: 'var(--warning-border)',
  300: 'var(--warning-border)',
  400: 'var(--warning)',
  500: 'var(--warning)',
  600: 'var(--warning)',
  700: 'var(--warning)',
  800: 'var(--warning)',
  900: 'var(--warning)',
  950: 'var(--warning)',
};

const successScale = {
  50: 'var(--success-soft)',
  100: 'var(--success-soft)',
  200: 'var(--success-border)',
  300: 'var(--success-border)',
  400: 'var(--success)',
  500: 'var(--success)',
  600: 'var(--success)',
  700: 'var(--success)',
  800: 'var(--success)',
  900: 'var(--success)',
  950: 'var(--success)',
};

const infoScale = {
  50: 'var(--info-soft)',
  100: 'var(--info-soft)',
  200: 'var(--info-border)',
  300: 'var(--info-border)',
  400: 'var(--info)',
  500: 'var(--info)',
  600: 'var(--info)',
  700: 'var(--info)',
  800: 'var(--info)',
  900: 'var(--info)',
  950: 'var(--info)',
};

const accentScale = {
  50: 'var(--accent-soft)',
  100: 'var(--accent-soft)',
  200: 'var(--accent-border)',
  300: 'var(--accent-border)',
  400: 'var(--accent)',
  500: 'var(--accent)',
  600: 'var(--accent)',
  700: 'var(--accent-deep)',
  800: 'var(--accent-deep)',
  900: 'var(--accent-deep)',
  950: 'var(--accent-deep)',
};

/**
 * Foreground scales — used for text / border / ring / outline / divide /
 * placeholder / caret / decoration / stroke utilities.
 * Identical to the fill scales in light mode; in dark mode the `-text` tokens
 * are lifted so coloured text, icons and active borders stay readable
 * (the fill tokens are too dark to be used as foreground on dark surfaces).
 */
const buildForeground = (softSuffix) => {
  const soft = (name) => `var(--${name}-${softSuffix})`;
  const scale = (name) => ({
    50: soft(name),
    100: soft(name),
    200: `var(--${name}-border)`,
    300: `var(--${name}-border)`,
    400: `var(--${name}-text)`,
    500: `var(--${name}-text)`,
    600: `var(--${name}-text)`,
    700: `var(--${name}-text)`,
    800: `var(--${name}-text)`,
    900: `var(--${name}-text)`,
    950: `var(--${name}-text)`,
  });
  const criticalFg = scale('critical');
  const warningFg = scale('warning');
  const successFg = scale('success');
  const infoFg = scale('info');
  const accentFg = {
    ...scale('accent'),
    700: 'var(--accent-deep-text)',
    800: 'var(--accent-deep-text)',
    900: 'var(--accent-deep-text)',
    950: 'var(--accent-deep-text)',
  };
  const tone = (name) => ({
    DEFAULT: `var(--${name}-text)`,
    soft: soft(name),
    border: `var(--${name}-border)`,
  });
  return {
    accent: {
      ...tone('accent'),
      deep: 'var(--accent-deep-text)',
      electric: 'var(--accent-electric)',
      violet: 'var(--accent-violet)',
    },
    critical: tone('critical'),
    warning: tone('warning'),
    success: tone('success'),
    info: tone('info'),
    'neutral-state': {
      DEFAULT: 'var(--neutral-state-text)',
      soft: 'var(--neutral-state-soft)',
      border: 'var(--neutral-state-border)',
    },
    'indus-red': 'var(--accent-text)',
    'indus-red-hover': 'var(--accent-deep-text)',
    'electric-blue': 'var(--info-text)',
    'soft-cyan': 'var(--info-text)',
    'secure-green': 'var(--success-text)',
    'enterprise-green': 'var(--success-text)',
    'erp-accent': 'var(--accent-text)',
    'erp-accent-hover': 'var(--accent-deep-text)',
    red: criticalFg,
    rose: criticalFg,
    pink: criticalFg,
    fuchsia: criticalFg,
    orange: warningFg,
    amber: warningFg,
    yellow: warningFg,
    lime: successFg,
    green: successFg,
    emerald: successFg,
    teal: { ...accentFg, DEFAULT: 'var(--teal-text)', soft: 'var(--teal-soft)' },
    cyan: infoFg,
    sky: infoFg,
    blue: { ...infoFg, 600: 'var(--accent-text)', 700: 'var(--accent-deep-text)' },
    indigo: infoFg,
    violet: infoFg,
    purple: infoFg,
  };
};

/** Text: soft tints become light "on-solid" tints in dark (text-red-100 on bg-red-600). */
const textForeground = buildForeground('soft-text');
/** Borders / rings / strokes: soft tints stay soft fills. */
const lineForeground = buildForeground('soft');

/** Text only: light end of the grey scale + text sitting on solid fills. */
const greyText = {
  ...surface,
  50: 'var(--text-inverse-strong)',
  100: 'var(--text-inverse)',
  200: 'var(--text-inverse-muted)',
  300: 'var(--text-faint)',
};

/** Background only: solid neutral fills that carry white text. */
const greyFill = {
  ...surface,
  400: 'var(--solid-neutral-400)',
  500: 'var(--solid-neutral-500)',
  600: 'var(--solid-neutral-600)',
  700: 'var(--solid-neutral-700)',
  800: 'var(--solid-neutral-800)',
  900: 'var(--solid-neutral-800)',
  950: 'var(--solid-neutral-800)',
};
/** Background only: 200/300 are stronger soft fills, not the (bright-in-dark) border tone. */
const softStrong = (name) => ({ 200: `var(--${name}-soft-strong)`, 300: `var(--${name}-soft-strong)` });
const semanticFill = (base, name) => ({ ...base, ...softStrong(name) });
const sidebarForeground = {
  DEFAULT: 'var(--sidebar-bg)',
  elevated: 'var(--sidebar-bg-elevated)',
  border: 'var(--sidebar-border)',
  text: 'var(--sidebar-text)',
  strong: 'var(--sidebar-text-strong)',
  muted: 'var(--sidebar-text-muted)',
  hover: 'var(--sidebar-hover)',
  active: 'var(--sidebar-active)',
  accent: 'var(--sidebar-accent-text)',
};
const greyFamilies = (scale) => ({ gray: scale, slate: scale, zinc: scale, neutral: scale, stone: scale });

export default {
  /* `dark:` utilities follow the ERP theme switch (ThemeContext), not the OS setting */
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Semantic tokens */
        canvas: 'var(--canvas)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-raised)',
          sunken: 'var(--surface-sunken)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        divider: 'var(--divider)',
        ink: {
          DEFAULT: 'var(--text)',
          strong: 'var(--text-strong)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          caption: 'var(--text-caption)',
          disabled: 'var(--text-disabled)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          deep: 'var(--accent-deep)',
          soft: 'var(--accent-soft)',
          border: 'var(--accent-border)',
          electric: 'var(--accent-electric)',
          violet: 'var(--accent-violet)',
        },
        sidebar: {
          DEFAULT: 'var(--sidebar-bg)',
          elevated: 'var(--sidebar-bg-elevated)',
          border: 'var(--sidebar-border)',
          text: 'var(--sidebar-text)',
          strong: 'var(--sidebar-text-strong)',
          muted: 'var(--sidebar-text-muted)',
          hover: 'var(--sidebar-hover)',
          active: 'var(--sidebar-active)',
          accent: 'var(--sidebar-accent)',
        },
        critical: {
          DEFAULT: 'var(--critical)',
          soft: 'var(--critical-soft)',
          border: 'var(--critical-border)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          soft: 'var(--warning-soft)',
          border: 'var(--warning-border)',
        },
        'neutral-state': {
          DEFAULT: 'var(--neutral-state)',
          soft: 'var(--neutral-state-soft)',
          border: 'var(--neutral-state-border)',
        },
        'neutral-soft': 'var(--neutral-state-soft)',
        'neutral-border': 'var(--neutral-state-border)',
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)',
          border: 'var(--success-border)',
        },
        info: {
          DEFAULT: 'var(--info)',
          soft: 'var(--info-soft)',
          border: 'var(--info-border)',
        },
        'row-hover': 'var(--row-hover)',
        scrim: 'var(--scrim)',
        'chart-inactive': 'var(--chart-inactive)',

        /* Legacy brand aliases → accent */
        'indus-red': 'var(--accent)',
        'indus-red-hover': 'var(--accent-deep)',
        'midnight-navy': 'var(--text)',
        'dark-from': 'var(--surface-sunken)',
        'dark-to': 'var(--canvas)',
        'electric-blue': 'var(--info)',
        'soft-cyan': 'var(--info)',
        'secure-green': 'var(--success)',
        'primary-text': 'var(--text)',
        'secondary-text': 'var(--text-secondary)',
        'enterprise-bg': 'var(--canvas)',
        'enterprise-bg-subtle': 'var(--surface-sunken)',
        'enterprise-surface': 'var(--surface)',
        'enterprise-text': 'var(--text)',
        'enterprise-text-secondary': 'var(--text-secondary)',
        'enterprise-border': 'var(--border)',
        'enterprise-green': 'var(--success)',
        'erp-accent': 'var(--accent)',
        'erp-accent-hover': 'var(--accent-deep)',
        'erp-accent-soft': 'var(--accent-soft)',

        /* Remap default palettes so legacy utilities stay desaturated */
        gray: surface,
        slate: surface,
        zinc: surface,
        neutral: surface,
        stone: surface,
        red: criticalScale,
        rose: criticalScale,
        pink: criticalScale,
        orange: warningScale,
        amber: warningScale,
        yellow: warningScale,
        lime: successScale,
        green: successScale,
        emerald: successScale,
        teal: {
          ...accentScale,
          DEFAULT: 'var(--teal)',
          soft: 'var(--teal-soft)',
        },
        cyan: infoScale,
        sky: infoScale,
        blue: { ...infoScale, 600: 'var(--accent)', 700: 'var(--accent-deep)' },
        indigo: infoScale,
        violet: infoScale,
        purple: infoScale,
        fuchsia: criticalScale,
      },
      textColor: {
        ...textForeground,
        ...greyFamilies(greyText),
        sidebar: sidebarForeground,
        surface: {
          DEFAULT: 'var(--on-solid)',
          raised: 'var(--on-solid)',
          sunken: 'var(--surface-sunken)',
        },
      },
      borderColor: { ...lineForeground, sidebar: sidebarForeground },
      ringColor: lineForeground,
      outlineColor: lineForeground,
      divideColor: lineForeground,
      textDecorationColor: lineForeground,
      caretColor: lineForeground,
      placeholderColor: lineForeground,
      stroke: lineForeground,
      backgroundColor: {
        ...greyFamilies(greyFill),
        ink: {
          DEFAULT: 'var(--solid-neutral-800)',
          strong: 'var(--solid-neutral-700)',
          secondary: 'var(--solid-neutral-600)',
          muted: 'var(--solid-neutral-500)',
          caption: 'var(--text-caption)',
          disabled: 'var(--solid-neutral-400)',
        },
        red: semanticFill(criticalScale, 'critical'),
        rose: semanticFill(criticalScale, 'critical'),
        pink: semanticFill(criticalScale, 'critical'),
        fuchsia: semanticFill(criticalScale, 'critical'),
        orange: semanticFill(warningScale, 'warning'),
        amber: semanticFill(warningScale, 'warning'),
        yellow: semanticFill(warningScale, 'warning'),
        lime: semanticFill(successScale, 'success'),
        green: semanticFill(successScale, 'success'),
        emerald: semanticFill(successScale, 'success'),
        teal: { ...semanticFill(accentScale, 'accent'), DEFAULT: 'var(--teal)', soft: 'var(--teal-soft)' },
        cyan: semanticFill(infoScale, 'info'),
        sky: semanticFill(infoScale, 'info'),
        blue: { ...semanticFill(infoScale, 'info'), 600: 'var(--accent)', 700: 'var(--accent-deep)' },
        indigo: semanticFill(infoScale, 'info'),
        violet: semanticFill(infoScale, 'info'),
        purple: semanticFill(infoScale, 'info'),
        /* bg-white/90 etc. follow the surface instead of staying white in dark */
        white: 'rgb(var(--surface-rgb) / <alpha-value>)',
      },
      gradientColorStops: greyFamilies(greyFill),
      fontFamily: {
        sans: ['var(--font-sans)'],
        heading: ['var(--font-sans)'],
        body: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        metrics: ['var(--font-mono)'],
      },
      fontSize: {
        display: ['28px', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.01em' }],
        'page-title': ['22px', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.01em' }],
        'section-title': ['18px', { lineHeight: '1.2', fontWeight: '600' }],
        'card-title': ['14px', { lineHeight: '1.2', fontWeight: '600' }],
        caption: ['12px', { lineHeight: '1.45', fontWeight: '600', letterSpacing: '0.06em' }],
        body: ['13px', { lineHeight: '1.45', fontWeight: '400' }],
        'table-cell': ['12.5px', { lineHeight: '1.45', fontWeight: '400' }],
        meta: ['11.5px', { lineHeight: '1.45', fontWeight: '400' }],
        'figure-lg': ['28px', { lineHeight: '1.2', fontWeight: '400' }],
        figure: ['21px', { lineHeight: '1.2', fontWeight: '400' }],
        num: ['12.5px', { lineHeight: '1.45', fontWeight: '400' }],
        'code-meta': ['10.5px', { lineHeight: '1.45', fontWeight: '400' }],
        'mono-caption': ['9.5px', { lineHeight: '1', fontWeight: '500', letterSpacing: '0.1em' }],
        'mono-micro': ['9px', { lineHeight: '1', fontWeight: '400', letterSpacing: '0.12em' }],
        'enterprise-heading': ['22px', { lineHeight: '1.2', fontWeight: '600' }],
        'enterprise-sub': ['14px', { lineHeight: '1.45' }],
        'enterprise-body': ['13px', { lineHeight: '1.45' }],
        'enterprise-label': ['12px', { lineHeight: '1.45' }],
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        badge: 'var(--radius-badge)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        popover: 'var(--shadow-popover)',
        modal: 'var(--shadow-modal)',
        'nav-active': 'var(--shadow-nav-active)',
        focus: '0 0 0 3px var(--focus-ring)',
      },
      transitionDuration: {
        theme: '160ms',
        'theme-normal': '200ms',
        'theme-slow': '280ms',
      },
      transitionTimingFunction: {
        theme: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      spacing: {
        sidebar: 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-width-collapsed)',
        topbar: 'var(--topbar-height)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out both',
        'stat-rotate': 'statRotate 5s ease-in-out infinite',
        shimmer: 'shimmer 1.2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        statRotate: {
          '0%, 18%': { opacity: '1' },
          '20%, 38%': { opacity: '0' },
          '40%, 58%': { opacity: '0' },
          '60%, 78%': { opacity: '0' },
          '80%, 98%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundColor: 'var(--skeleton-from)' },
          '50%': { backgroundColor: 'var(--skeleton-to)' },
          '100%': { backgroundColor: 'var(--skeleton-from)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
