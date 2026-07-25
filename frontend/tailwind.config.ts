import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f6fb',
          100: '#e2ebf7',
          200: '#c1d5ee',
          300: '#93b6de',
          400: '#5f8fc8',
          500: '#3d6fac',
          600: '#2d5689',
          700: '#25436a',
          800: '#1f3654',
          900: '#1b2c44',
        },
        status: {
          green: '#1e8e5a',
          greenBg: '#e6f6ee',
          yellow: '#b7791f',
          yellowBg: '#fdf3e2',
          red: '#c0362c',
          redBg: '#fbe9e7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
