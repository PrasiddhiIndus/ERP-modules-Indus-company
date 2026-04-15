/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'indus-red': '#C8102E',
        'indus-red-hover': '#A50D25',
        'midnight-navy': '#0B1220',
        'dark-from': '#0F1B2E',
        'dark-to': '#111827',
        'electric-blue': '#1E90FF',
        'soft-cyan': '#00D4FF',
        'secure-green': '#10B981',
        'primary-text': '#F3F4F6',
        'secondary-text': '#9CA3AF',
        'enterprise-bg': '#F7F9FC',
        'enterprise-bg-subtle': '#EEF2F7',
        'enterprise-surface': '#FFFFFF',
        'enterprise-text': '#111827',
        'enterprise-text-secondary': '#6B7280',
        'enterprise-border': '#E5E7EB',
        'enterprise-green': '#059669',
        /** ERP primary accent — matches Tailwind red-600 / Fire Tender CTAs (#dc2626) */
        'erp-accent': '#dc2626',
        'erp-accent-hover': '#b91c1c',
        'erp-accent-soft': '#fef2f2',
      },
      fontFamily: {
        heading: ['Montserrat', 'sans-serif'],
        metrics: ['Space Grotesk', 'monospace'],
        body: ['Inter', 'sans-serif'],
      },
      fontSize: {
        'enterprise-heading': ['28px', { lineHeight: '1.3' }],
        'enterprise-sub': ['14px', { lineHeight: '1.4' }],
        'enterprise-body': ['13px', { lineHeight: '1.5' }],
        'enterprise-label': ['12px', { lineHeight: '1.4' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out both',
        'stat-rotate': 'statRotate 5s ease-in-out infinite',
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
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
