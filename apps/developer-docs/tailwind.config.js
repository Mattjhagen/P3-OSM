/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        p3: '#00e599',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '0.03' },
          '50%': { opacity: '0.08' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 229, 153, 0.4)' },
          '50%': { boxShadow: '0 0 12px 2px rgba(0, 229, 153, 0.3)' },
        },
        'number-pop': {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(0, 229, 153, 0)' },
          '50%': { transform: 'scale(1.1)', boxShadow: '0 0 16px 2px rgba(0, 229, 153, 0.5)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(0, 229, 153, 0)' },
        },
        'loading-fade': {
          '0%': { opacity: '0' },
          '20%': { opacity: '1' },
          '80%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'pulse-slow': 'pulse-slow 2.5s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 1.5s ease-in-out',
        'number-pop': 'number-pop 0.5s ease-out',
        'loading-fade': 'loading-fade 1.5s ease-in-out',
      },
    },
  },
  plugins: [],
};
