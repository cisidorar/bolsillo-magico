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
          50:  '#E1F7FD',   // cielo muy claro
          100: '#B9ECFA',
          200: '#85DDF5',
          400: '#29C8EE',
          600: '#00AEDC',   // azul Doraemon — CTA
          700: '#0093BC',   // hover
          800: '#006F96',   // active / dark
          900: '#083344',   // azul marino profundo
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
