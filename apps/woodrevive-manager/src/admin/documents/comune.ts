/**
 * Il corredo comune dei generatori PDF: normalizzazione del testo, palette,
 * geometria di pagina e i piccoli helper di disegno.
 *
 * Nato alla terza stampa (la scheda di lavorazione), come promettevano i
 * commenti nei due generatori originali: con due file la duplicazione costava
 * meno dell'indirezione, con tre no. Qui vive ciò che è IDENTICO in tutte le
 * stampe; ciò che varia — `FONDO`, le colonne, i blocchi di layout — resta nel
 * generatore che lo usa.
 *
 * ⚠️ `documents/` è l'unica cartella con valori colore letterali ammessi:
 * jsPDF vuole terne RGB numeriche e non sa niente dei token Tailwind.
 * `scripts/check-colors.mjs` la esclude. Le terne sono le stesse di
 * `src/index.css`: se cambia la palette, vanno riallineate a mano — è il
 * prezzo dell'eccezione.
 */

import type { jsPDF } from 'jspdf'

import { brandConfig, indirizzoCompleto } from '../brand.config'

// ---------------------------------------------------------------------------
// Testo: normalizzazione per i font standard
// ---------------------------------------------------------------------------

/**
 * I font standard di jsPDF (Helvetica e soci) codificano in WinAnsi. Tutto ciò
 * che sta fuori da quella tabella non viene stampato male: rompe la stringa, e
 * il PDF esce con caratteri mancanti o scalati.
 *
 * Il guaio è che i caratteri incriminati arrivano da soli: le virgolette
 * tipografiche le mette il testo scritto a mano (`d’Italia`), il segno meno
 * unicode e la freccia arrivano dai copia-incolla, i puntini di sospensione
 * dall'autocorrezione. Quindi ogni stringa passa di qui prima di finire nel PDF.
 *
 * `€`, `–`, `—`, `²`, `³` e le lettere accentate restano: sono in WinAnsi e
 * servono (metri quadri, metri cubi, importi).
 */
export function pulisci(testo: string | null | undefined): string {
  if (!testo) return ''
  return (
    testo
      // virgolette e apostrofi tipografici: \u2018 \u2019 \u201A \u2039 \u203A \u2032
      .replace(/[\u2018\u2019\u201A\u2039\u203A\u2032]/g, "'")
      // \u201C \u201D \u201E \u2033
      .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
      .replace(/\u2026/g, '...') // puntini di sospensione
      .replace(/[\u2212\u2010\u2011\u2012\u2015]/g, '-') // meno unicode e trattini vari
      .replace(/\u2248/g, '~') // circa uguale
      .replace(/\u2264/g, '<=')
      .replace(/\u2265/g, '>=')
      .replace(/[\u2192\u27A1]/g, '->') // frecce
      .replace(/\u2190/g, '<-')
      .replace(/[\u2022\u25CF\u25AA]/g, '\u00B7') // pallini -> punto mediano (WinAnsi)
      .replace(/[\u2007\u2008\u2009\u200A\u202F]/g, ' ') // spazi sottili
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // spazi a larghezza zero
      // Rete di sicurezza: tutto ciò che resta fuori da WinAnsi sparisce, così una
      // stringa inattesa non manda in errore la generazione. Restano ASCII stampabile,
      // Latin-1 (accenti, \u00B2, \u00B3, \u00B7, spazio unificatore), l'euro e i trattini lunghi.
      .replace(/[^\n\t\u0020-\u007E\u00A0-\u00FF\u20AC\u2013\u2014]/g, '')
  )
}

// ---------------------------------------------------------------------------
// Geometria e colori
// ---------------------------------------------------------------------------

export const M = 16 // margine sinistro
export const DESTRA = 194 // margine destro (210 − 16)
// `FONDO` NON sta qui: ogni stampa ha il suo — il preventivo arriva a 258, il
// DDT si ferma a 250 per far posto alle tre firme. Condividerlo significherebbe
// sbagliarne uno dei due.

export type Rgb = readonly [number, number, number]

export const INK: Rgb = [84, 72, 66] // --wr-ink
export const INK_SOFT: Rgb = [124, 90, 76] // --wr-ink-soft
export const MUTE: Rgb = [150, 127, 105] // --wr-ink-mute
export const BRAND: Rgb = [143, 94, 32] // --wr-brand-strong (in stampa serve il contrasto)
export const ORO: Rgb = [209, 168, 81] // --wr-brand-soft
export const LINEA: Rgb = [227, 216, 200] // --wr-line
export const TINT: Rgb = [234, 216, 175] // --wr-tint

export const inchiostro = (doc: jsPDF, c: Rgb): void => {
  doc.setTextColor(c[0], c[1], c[2])
}
export const tratto = (doc: jsPDF, c: Rgb): void => {
  doc.setDrawColor(c[0], c[1], c[2])
}
export const riempi = (doc: jsPDF, c: Rgb): void => {
  doc.setFillColor(c[0], c[1], c[2])
}

export interface OpzioniTesto {
  align?: 'left' | 'right' | 'center'
}

/** Unico varco verso `doc.text`: nessuna stringa entra nel PDF senza `pulisci`. */
export function scrivi(
  doc: jsPDF,
  testo: string,
  x: number,
  y: number,
  opzioni?: OpzioniTesto,
): void {
  doc.text(pulisci(testo), x, y, opzioni)
}

export function spezza(doc: jsPDF, testo: string, larghezza: number): string[] {
  return doc.splitTextToSize(pulisci(testo), larghezza) as string[]
}

export function riga(doc: jsPDF, y: number, spessore = 0.2, colore: Rgb = LINEA): void {
  tratto(doc, colore)
  doc.setLineWidth(spessore)
  doc.line(M, y, DESTRA, y)
}

// ---------------------------------------------------------------------------
// Pagine
// ---------------------------------------------------------------------------

/**
 * Pagina di continuazione, con la testatina «(segue)». L'etichetta è del
 * chiamante — `Preventivo PRV-2026-0001`, `DDT DDT-2026-0001` — perché è
 * l'unica cosa che i generatori scrivevano in modo diverso.
 */
export function nuovaPagina(doc: jsPDF, etichetta: string): number {
  doc.addPage()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  inchiostro(doc, MUTE)
  scrivi(doc, `${brandConfig.nomeCompleto} — ${etichetta} (segue)`, M, 17)
  riga(doc, 20, 0.4, ORO)
  return 27
}

/** Piede su tutte le pagine, numerazione compresa. Si disegna alla fine,
 *  quando il numero totale di pagine è finalmente noto. */
export function piedi(doc: jsPDF): void {
  const pagine = doc.getNumberOfPages()
  for (let n = 1; n <= pagine; n++) {
    doc.setPage(n)
    riga(doc, 280, 0.2)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    inchiostro(doc, MUTE)
    scrivi(
      doc,
      `${brandConfig.nomeCompleto} · ${indirizzoCompleto} · P.IVA ${brandConfig.piva}`,
      M,
      284.5,
    )
    scrivi(doc, `Pagina ${n} di ${pagine}`, DESTRA, 284.5, { align: 'right' })
  }
}
