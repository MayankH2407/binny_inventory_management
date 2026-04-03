import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        binny: {
          navy: '#2D2A6E',
          'navy-dark': '#1E1A5F',
          'navy-light': '#EEEDF7',
          'navy-50': '#F5F4FF',
          'navy-200': '#D8D6F0',
          red: '#E31E24',
          'red-dark': '#B71C1C',
          'red-light': '#FFEBEE',
        },
        brand: {
          primary: '#2D2A6E',
          'primary-dark': '#1E1A5F',
          'primary-light': '#EEEDF7',
          accent: '#E31E24',
          'accent-dark': '#B71C1C',
          'accent-light': '#FFEBEE',
          background: '#F5F6FA',
          'text-dark': '#1A1A2E',
          'text-muted': '#6B7280',
          border: '#E5E7EB',
          success: '#16A34A',
          warning: '#F59E0B',
          error: '#DC2626',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(45, 42, 110, 0.04), 0 1px 2px -1px rgba(45, 42, 110, 0.04)',
        'card-hover': '0 4px 12px -2px rgba(45, 42, 110, 0.08), 0 2px 4px -2px rgba(45, 42, 110, 0.04)',
        elevated: '0 8px 24px -4px rgba(45, 42, 110, 0.12), 0 2px 8px -2px rgba(45, 42, 110, 0.06)',
        nav: '0 -2px 12px 0 rgba(45, 42, 110, 0.06)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out forwards',
        'scale-in': 'scale-in 0.2s ease-out',
        shimmer: 'shimmer 1.5s infinite linear',
        'pulse-dot': 'pulse-dot 2s infinite ease-in-out',
      },
    },
  },
  plugins: [],
};

export default config;
