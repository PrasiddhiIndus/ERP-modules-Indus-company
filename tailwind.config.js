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

export default {
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
        teal: accentScale,
        cyan: infoScale,
        sky: infoScale,
        blue: { ...infoScale, 600: 'var(--accent)', 700: 'var(--accent-deep)' },
        indigo: infoScale,
        violet: infoScale,
        purple: infoScale,
        fuchsia: criticalScale,
      },
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
        card: '10px',
        control: '7px',
        badge: '5px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        popover: 'var(--shadow-popover)',
        modal: 'var(--shadow-modal)',
        'nav-active': 'var(--shadow-nav-active)',
        focus: '0 0 0 3px var(--focus-ring)',
      },
      transitionDuration: {
        theme: '140ms',
      },
      transitionTimingFunction: {
        theme: 'ease-out',
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
