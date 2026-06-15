import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EEF4FF',   // azul muy claro
          100: '#D5E6FF',
          200: '#A8C8FF',
          300: '#75A8FF',
          400: '#4D8FFF',
          500: '#3079E0',
          600: '#1B6DD4',   // azul royal — CTA
          700: '#155BB0',   // hover
          800: '#0F4489',   // active / dark
          900: '#0A1F44',   // azul marino profundo
        },
        accent: {
          yellow: '#FFCC00', // amarillo campana
          red:    '#E63B3B', // rojo collar
        },
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
