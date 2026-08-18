/**
 * PDF della scheda di lavorazione: il CALCO del modulo cartaceo che Wood
 * Revive consegna al fornitore (mat_cliente/scheda_lavorazione.jpeg), riga per
 * riga — logo in alto a sinistra, riquadro con data/committente/telefono/
 * consegna in alto a destra, l'elenco delle tipologie coi pallini, il riquadro
 * delle specifiche con i campi da compilare sottolineati, le ANNOTAZIONI in
 * grassetto dentro il loro riquadro. Chi maneggia il modulo da anni deve
 * riconoscerlo al primo sguardo: i valori compilati si scrivono SULLE righe,
 * come a penna, e un campo vuoto resta una riga bianca — non un «—».
 *
 * ⚠️ Qui il logo C'È, a differenza di preventivo e DDT: è il pezzo più
 * riconoscibile del modulo originale, e `logo-square.png` (694 px) regge i
 * ~62 mm di stampa a ~285 dpi. Se il file non si carica, il nome scritto in
 * grande fa da rete di sicurezza.
 *
 * Non serve nessun parametro oltre alla scheda: è tutta snapshot. Nel caso
 * tipico sta in una pagina; sbordano solo le annotazioni, che proseguono col
 * loro riquadro nelle pagine seguenti.
 *
 * Come gli altri generatori, jsPDF arriva con `await import('jspdf')` e resta
 * fuori dal bundle iniziale.
 *
 * ⚠️ `documents/` è l'unica cartella con valori colore letterali ammessi:
 * jsPDF vuole terne RGB numeriche. Palette, geometria e helper condivisi
 * stanno in `comune.ts`; qui restano `FONDO` e il layout, che sono di questa
 * stampa e di nessun'altra.
 */

import type { jsPDF } from 'jspdf'

import { brandConfig } from '../brand.config'
import {
  ESSENZA_LABEL,
  TIPOLOGIA_SCHEDA_LABEL,
  TIPOLOGIE_SCHEDA,
  type SchedaLavorazione,
} from '../domain'
import { formatData, formatQuantita } from '../lib/format'
import {
  DESTRA,
  INK,
  INK_SOFT,
  M,
  MUTE,
  inchiostro,
  nuovaPagina,
  piedi,
  pulisci,
  riempi,
  scrivi,
  spezza,
  tratto,
} from './comune'

// ---------------------------------------------------------------------------
// Geometria propria di questa stampa
// ---------------------------------------------------------------------------

const FONDO = 268 // niente firme in fondo: solo il piede

/** Proporzioni di `logo-square.png`: 694×116 px. */
const LOGO_LARGHEZZA = 62
const LOGO_ALTEZZA = (LOGO_LARGHEZZA * 116) / 694

// ===========================================================================
// Generatore
// ===========================================================================

export async function generaSchedaLavorazionePdf(scheda: SchedaLavorazione): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setLineHeightFactor(1.2)

  const logo = await caricaLogo()

  testata(doc, logo)
  boxCommittente(doc, scheda)
  titoloETipologie(doc, scheda)
  rigaGestionale(doc, scheda)
  const y = boxSpecifiche(doc, scheda, 74)
  annotazioni(doc, scheda, y + 10)
  piedi(doc)

  doc.save(`${pulisci(scheda.numero)}.pdf`)
}

/**
 * Il logo del modulo. Torna `null` se il file non è raggiungibile: il PDF
 * esce lo stesso, col nome in grande al posto dell'immagine.
 */
async function caricaLogo(): Promise<Uint8Array | null> {
  try {
    const risposta = await fetch(brandConfig.logo.quadrato)
    if (!risposta.ok) return null
    return new Uint8Array(await risposta.arrayBuffer())
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// I campi da compilare: etichetta, riga, valore SULLA riga
// ---------------------------------------------------------------------------

/**
 * «DATA__________03/08/26____________» — il mattone del modulo. L'etichetta in
 * tondo, la riga fino a `fineX`, il valore in grassetto centrato sulla riga.
 * Vuoto = riga bianca, come su un modulo vero.
 */
function campoModulo(
  doc: jsPDF,
  etichetta: string,
  valore: string | null,
  x: number,
  y: number,
  fineX: number,
  corpo = 10,
): void {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(corpo)
  inchiostro(doc, INK)
  scrivi(doc, etichetta, x, y)

  const inizioRiga = x + doc.getTextWidth(pulisci(etichetta)) + 1.5
  tratto(doc, INK_SOFT)
  doc.setLineWidth(0.25)
  doc.line(inizioRiga, y + 0.8, fineX, y + 0.8)

  if (!valore?.trim()) return
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(corpo)
  const larghezza = fineX - inizioRiga - 3
  const linee = spezza(doc, valore, larghezza)
  const testo = linee.length > 1 ? `${linee[0]}…` : linee[0]
  scrivi(doc, testo, (inizioRiga + fineX) / 2, y, { align: 'center' })
}

// ---------------------------------------------------------------------------
// Testata: logo a sinistra, riquadro del committente a destra
// ---------------------------------------------------------------------------

function testata(doc: jsPDF, logo: Uint8Array | null): void {
  if (logo) {
    doc.addImage(logo, 'PNG', M, 12, LOGO_LARGHEZZA, LOGO_ALTEZZA)
    return
  }
  // Rete di sicurezza: il nome in grande, come sulle altre stampe.
  doc.setFont('times', 'bold')
  doc.setFontSize(19)
  inchiostro(doc, INK)
  scrivi(doc, 'WOOD REVIVE', M, 18)
  doc.setFont('times', 'italic')
  doc.setFontSize(9)
  inchiostro(doc, MUTE)
  scrivi(doc, brandConfig.payoff, M, 22.5)
}

/** Il riquadro in alto a destra del modulo: quattro campi da compilare. */
function boxCommittente(doc: jsPDF, scheda: SchedaLavorazione): void {
  const xBox = 104
  const yBox = 12
  const altezza = 42

  tratto(doc, INK)
  doc.setLineWidth(0.3)
  doc.rect(xBox, yBox, DESTRA - xBox, altezza)

  const campi: Array<[string, string | null]> = [
    ['DATA', formatData(scheda.data)],
    ['COMMITTENTE', scheda.committente],
    ['TELEFONO', scheda.telefono],
    ['CONSEGNA', scheda.data_consegna ? formatData(scheda.data_consegna) : null],
  ]
  campi.forEach(([etichetta, valore], i) => {
    campoModulo(doc, etichetta, valore, xBox + 4, yBox + 9 + i * 9.4, DESTRA - 4)
  })
}

/** Il titolo in grassetto e l'elenco delle tipologie coi pallini, come sul modulo. */
function titoloETipologie(doc: jsPDF, scheda: SchedaLavorazione): void {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14.5)
  inchiostro(doc, INK)
  scrivi(doc, 'SCHEDA LAVORAZIONE', M + 12, 33)

  let y = 40.5
  for (const t of TIPOLOGIE_SCHEDA) {
    const segnata = scheda.tipologie.includes(t)
    // Il pallino del modulo: vuoto se non segnata, pieno se segnata.
    tratto(doc, INK)
    doc.setLineWidth(0.3)
    if (segnata) {
      riempi(doc, INK)
      doc.circle(M + 10.5, y - 1.1, 1.3, 'FD')
    } else {
      doc.circle(M + 10.5, y - 1.1, 1.3, 'S')
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    inchiostro(doc, segnata ? INK : INK_SOFT)
    scrivi(doc, TIPOLOGIA_SCHEDA_LABEL[t].toUpperCase(), M + 15, y)
    y += 6.4
  }
}

/**
 * L'unica riga che sul cartaceo non c'è: numero della scheda, destinatario e
 * ordine di provenienza. Piccola e in disparte — il gestionale ha bisogno
 * dell'identità del documento, il modulo non deve cambiare faccia.
 */
function rigaGestionale(doc: jsPDF, scheda: SchedaLavorazione): void {
  const parti = [
    `Scheda ${scheda.numero}`,
    scheda.fornitore_nome ? `per ${scheda.fornitore_nome}` : null,
    scheda.ordine_numero ? `rif. ordine ${scheda.ordine_numero}` : null,
  ].filter(Boolean)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  inchiostro(doc, MUTE)
  scrivi(doc, parti.join(' · '), M, 70)
}

// ---------------------------------------------------------------------------
// Il riquadro delle specifiche
// ---------------------------------------------------------------------------

function boxSpecifiche(doc: jsPDF, scheda: SchedaLavorazione, yBox: number): number {
  const altezza = 50
  tratto(doc, INK)
  doc.setLineWidth(0.3)
  doc.rect(M, yBox, DESTRA - M, altezza)

  const sx = M + 5
  const dx = DESTRA - 5
  const mm = (v: number | null) => (v !== null ? String(v) : null)

  // ESSENZA____________
  campoModulo(
    doc,
    'ESSENZA',
    scheda.essenza ? ESSENZA_LABEL[scheda.essenza] : null,
    sx,
    yBox + 10,
    sx + 70,
  )

  // Larghezza da ____ a ____  Lunghezza da ____ a ____  Spessore ____
  const yMisure = yBox + 21
  campoModulo(doc, 'Larghezza da', mm(scheda.larghezza_da_mm), sx, yMisure, sx + 42)
  campoModulo(doc, 'a', mm(scheda.larghezza_a_mm), sx + 43.5, yMisure, sx + 60)
  campoModulo(doc, 'Lunghezza da', mm(scheda.lunghezza_da_mm), sx + 63, yMisure, sx + 108)
  campoModulo(doc, 'a', mm(scheda.lunghezza_a_mm), sx + 109.5, yMisure, sx + 128)
  campoModulo(doc, 'Spessore', mm(scheda.spessore_mm), sx + 131, yMisure, dx)

  // Spazzolatura ______________ Stucco colore ______________
  const yLav = yBox + 32
  const meta = M + (DESTRA - M) / 2
  campoModulo(doc, 'Spazzolatura', scheda.spazzolatura, sx, yLav, meta - 3)
  campoModulo(doc, 'Stucco colore', scheda.stucco_colore, meta + 1, yLav, dx)

  // Bordo frontale ______________ Finitura ______________
  const yBordo = yBox + 43
  campoModulo(doc, 'Bordo frontale', scheda.bordo_frontale, sx, yBordo, meta - 3)
  campoModulo(doc, 'Finitura', scheda.finitura, meta + 1, yBordo, dx)

  return yBox + altezza
}

// ---------------------------------------------------------------------------
// ANNOTAZIONI: il riquadro col testo in grassetto, quantità in fondo
// ---------------------------------------------------------------------------

function annotazioni(doc: jsPDF, scheda: SchedaLavorazione, yTitolo: number): void {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  inchiostro(doc, INK)
  scrivi(doc, 'ANNOTAZIONI', M, yTitolo)

  // Il testo del riquadro: le annotazioni e — come sul modulo d'esempio, dove
  // «100 MQ» chiude il blocco — la quantità come ultima riga.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  const linee = scheda.annotazioni?.trim() ? spezza(doc, scheda.annotazioni, DESTRA - M - 14) : []
  if (scheda.quantita_milli !== null && scheda.unita_misura) {
    linee.push(formatQuantita(scheda.quantita_milli, scheda.unita_misura))
  }

  const passo = 5.6
  let daRiga = 0
  let yBox = yTitolo + 3

  // Il riquadro si ridisegna su ogni pagina in cui il testo prosegue; vuoto,
  // resta un riquadro bianco alto quanto basta — come su un modulo in bianco.
  do {
    const spazioRighe = Math.max(0, Math.floor((FONDO - yBox - 12) / passo))
    const finoA = Math.min(linee.length, daRiga + spazioRighe)
    const quante = finoA - daRiga
    const altezza = Math.max(34, quante * passo + 11)

    tratto(doc, INK)
    doc.setLineWidth(0.3)
    doc.rect(M, yBox, DESTRA - M, altezza)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    inchiostro(doc, INK)
    for (let i = daRiga; i < finoA; i++) {
      scrivi(doc, linee[i], M + 7, yBox + 8 + (i - daRiga) * passo)
    }

    daRiga = finoA
    if (daRiga < linee.length) yBox = nuovaPagina(doc, `Scheda ${scheda.numero}`) + 2
  } while (daRiga < linee.length)
}
