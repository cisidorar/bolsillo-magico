import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#EAF2FE',
          100: '#BDDAFD',
          200: '#90BFFB',
          300: '#63A4F9',
          400: '#4D93FF',
          500: '#3B85F7',
          600: '#2256C8',   // primary — CTA
          700: '#1A45A8',   // hover
          800: '#133690',   // active / dark
          900: '#0E2A52',   // ink profundo
        },
        mint:  { DEFAULT: '#1FBE8D', dark: '#34D6A2' },
        coral: { DEFAULT: '#FF6F61', dark: '#FF8478' },
        gold:  { DEFAULT: '#FFC23C', dark: '#FFD166' },
      },
      fontFamily: {
        sans:    ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        display: ['var(--font-fredoka)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'card': '18px',
        'panel': '22px',
      },
      boxShadow: {
        'card':   '0 8px 18px rgba(14,42,82,0.10)',
        'button': '0 8px 18px rgba(43,124,246,0.35)',
      },
    },
  },
  plugins: [],
}

export default config
