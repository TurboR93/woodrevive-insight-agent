/** @type {import('tailwindcss').Config} */

// I colori NON stanno qui: stanno in src/index.css come CSS variables in formato
// canale RGB ("183 125 51"), così Tailwind può applicarci l'opacità (bg-brand/10).
// Regola del progetto: nessun valore colore letterale fuori da src/index.css.
// Vedi docs/design-system.md — `npm run check:colors` fa rispettare la regola.
const c = (name) => `rgb(var(--wr-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // superfici
        wash: c('wash'), // fondo pagina, sabbia lavata
        surface: c('surface'), // card, tabelle
        tint: c('tint'), // fondi tenui, righe evidenziate
        line: c('line'), // bordi e separatori
        clay: c('clay'), // neutro caldo intermedio

        // brand
        brand: {
          DEFAULT: c('brand'), // #b77d33 — primario del sito
          strong: c('brand-strong'), // hover, testo su chiaro (contrasto AA)
          soft: c('brand-soft'), // #d1a851 — oro, accenti decorativi
        },

        // testo
        ink: {
          DEFAULT: c('ink'), // #544842 — titoli e corpo
          soft: c('ink-soft'), // #7c5a4c — testo secondario
          mute: c('ink-mute'), // #967f69 — label, placeholder
        },

        // stati (tonalità scelte per stare accanto ai marroni senza stonare)
        ok: c('ok'),
        warn: c('warn'),
        danger: c('danger'),
        info: c('info'),
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Yeseva One"', 'Georgia', 'serif'],
      },
      borderRadius: {
        card: '1rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(84 72 66 / 0.06), 0 4px 16px -8px rgb(84 72 66 / 0.18)',
      },
      transitionTimingFunction: {
        wood: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}
