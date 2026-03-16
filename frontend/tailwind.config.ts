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
          red: '#E31E24',
          'red-dark': '#B71C1C',
          'red-light': '#FFEBEE',
        },
        brand: {
          primary: '#E31E24',
          'primary-dark': '#B71C1C',
          'primary-light': '#FFEBEE',
          background: '#F9FAFB',
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
    },
  },
  plugins: [],
};

export default config;
