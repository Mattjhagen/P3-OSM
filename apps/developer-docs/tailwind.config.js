/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '0.03' },
          '50%': { opacity: '0.08' },
        },
      },
      animation: {
        'pulse-slow': 'pulse-slow 2.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
