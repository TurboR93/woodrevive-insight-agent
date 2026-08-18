#!/usr/bin/env node
/**
 * check-colors — fa rispettare la regola numero uno del design system:
 * i valori colore esistono in UN SOLO file, src/index.css.
 *
 * Perché: il gestionale demo da cui questo progetto prende spunto ha i colori
 * cablati nei componenti (bg-[#D03F29]) e poi li riscrive in CSS con !important
 * e selettori escaped. Funziona, ma rende impossibile ricolorare il pannello e
 * nasconde gli errori di contrasto. Qui si parte pulito e si resta puliti.
 *
 * Cosa segnala in src/ (esclusi index.css e i generatori PDF):
 *   - #rgb / #rrggbb / #rrggbbaa
 *   - rgb(...) / rgba(...) / hsl(...) / hsla(...)
 *   - classi Tailwind con colore arbitrario: bg-[#...], text-[rgb(...)]
 *
 * Eccezioni consentite, perché stanno fuori dal DOM e Tailwind non le copre:
 *   - src/admin/documents/**  → i PDF jsPDF vogliono terne RGB numeriche
 *   - qualunque riga con il commento  // colore-ok: <motivo>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

const ESCLUSI = [join(SRC, 'index.css'), join(SRC, 'admin', 'documents')]
const ESTENSIONI = ['.ts', '.tsx', '.css']

const REGOLE = [
  { nome: 'colore esadecimale', re: /#[0-9a-fA-F]{3,8}\b/g },
  { nome: 'funzione colore', re: /\b(?:rgba?|hsla?)\(\s*\d/g },
  { nome: 'classe Tailwind arbitraria', re: /\b(?:bg|text|border|ring|fill|stroke|from|to|via)-\[[^\]]*(?:#|rgb|hsl)[^\]]*\]/g },
]

function* file(dir) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce)
    if (ESCLUSI.some((e) => p === e || p.startsWith(e + '/'))) continue
    if (statSync(p).isDirectory()) yield* file(p)
    else if (ESTENSIONI.some((e) => p.endsWith(e))) yield p
  }
}

let problemi = 0
for (const percorso of file(SRC)) {
  const righe = readFileSync(percorso, 'utf8').split('\n')
  righe.forEach((riga, i) => {
    if (riga.includes('colore-ok:')) return
    for (const { nome, re } of REGOLE) {
      re.lastIndex = 0
      const trovato = riga.match(re)
      if (!trovato) continue
      problemi++
      console.error(
        `${relative(ROOT, percorso)}:${i + 1}  ${nome}: ${trovato.join(', ')}\n    ${riga.trim()}`,
      )
    }
  })
}

if (problemi > 0) {
  console.error(
    `\n✗ ${problemi} valore/i colore fuori da src/index.css.\n` +
      `  Usa i token semantici (bg-brand, text-ink-mute, border-line…) oppure\n` +
      `  aggiungi la variabile in src/index.css e il token in tailwind.config.js.\n` +
      `  Vedi docs/design-system.md.`,
  )
  process.exit(1)
}
console.log('✓ nessun colore letterale fuori da src/index.css')
