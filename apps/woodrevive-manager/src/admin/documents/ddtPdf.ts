/**
 * PDF del documento di trasporto.
 *
 * Come per il preventivo, jsPDF arriva con `await import('jspdf')` e finisce in
 * un chunk separato: la libreria non deve pesare sul primo caricamento del
 * pannello.
 *
 * ⚠️ `documents/` è l'unica cartella con valori colore letterali ammessi:
 * jsPDF vuole terne RGB numeriche. Palette, geometria e helper condivisi
 * stanno in `comune.ts`; qui restano `FONDO`, le colonne e le tre firme, che
 * sono di questa stampa e di nessun'altra.
 *
 * ── La regola che conta ───────────────────────────────────────────────────
 * Se `ddt.valorizzato === false` il PDF **non stampa prezzi né totali**: solo
 * descrizioni e quantità. È il caso normale quando la merce va in cantiere e
 * chi scarica non deve leggere quanto è stata pagata. La regola sta qui e in
 * un posto solo: non esiste un secondo ramo che ristampi gli importi.
 */

import type { jsPDF } from 'jspdf'

import { brandConfig, indirizzoCompleto } from '../brand.config'
import {
  etichettaCausale,
  TRASPORTO_LABEL,
  identificativoFiscale,
  type Cliente,
  type DDT,
  type RigaDDT,
  etichettaVoceRiepilogo,
} from '../domain'
import { formatData, formatImporto, formatQuantita } from '../lib/format'
import { totaliDocumento } from '../lib/money'
import {
  BRAND,
  DESTRA,
  INK,
  INK_SOFT,
  LINEA,
  M,
  MUTE,
  ORO,
  TINT,
  inchiostro,
  nuovaPagina,
  piedi,
  pulisci,
  riempi,
  riga,
  scrivi,
  spezza,
  tratto,
} from './comune'

// ---------------------------------------------------------------------------
// Geometria propria di questa stampa
// ---------------------------------------------------------------------------

const FONDO = 250 // sotto ci stanno le tre firme e il piede

// ---------------------------------------------------------------------------
// Colonne: due disposizioni, secondo `valorizzato`
// ---------------------------------------------------------------------------

interface Colonne {
  larghezzaDescrizione: number
  quantita: number
  colli: number
  peso: number
  prezzo: number | null
  imponibile: number | null
}

/** Senza prezzi la descrizione si prende lo spazio che avanza. */
const COLONNE_VALORIZZATO: Colonne = {
  larghezzaDescrizione: 62,
  quantita: 104,
  colli: 118,
  peso: 138,
  prezzo: 162,
  imponibile: DESTRA,
}

const COLONNE_SEMPLICI: Colonne = {
  larghezzaDescrizione: 108,
  quantita: 146,
  colli: 168,
  peso: DESTRA,
  prezzo: null,
  imponibile: null,
}

// ===========================================================================
// Generatore
// ===========================================================================

export async function generaDdtPdf(ddt: DDT, cliente: Cliente): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setLineHeightFactor(1.2)

  const colonne = ddt.valorizzato ? COLONNE_VALORIZZATO : COLONNE_SEMPLICI

  let y = intestazione(doc, ddt)
  y = blocchiTesta(doc, ddt, cliente, y)
  y = strisciaTrasporto(doc, ddt, y)
  y = tabellaRighe(doc, ddt, colonne, y)
  y = totali(doc, ddt, y)
  y = note(doc, ddt, y)
  firme(doc, ddt, y)
  piedi(doc)

  doc.save(`${pulisci(ddt.numero)}.pdf`)
}

// ---------------------------------------------------------------------------
// Testata
// ---------------------------------------------------------------------------

function intestazione(doc: jsPDF, ddt: DDT): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  inchiostro(doc, INK)
  scrivi(doc, brandConfig.nomeCompleto, M, 21)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  inchiostro(doc, MUTE)
  scrivi(doc, brandConfig.payoff, M, 26)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  inchiostro(doc, INK_SOFT)
  scrivi(doc, indirizzoCompleto, M, 32)
  scrivi(doc, `P.IVA ${brandConfig.piva}`, M, 36)
  scrivi(doc, `${brandConfig.telefono} · ${brandConfig.email} · ${brandConfig.sito}`, M, 40)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  inchiostro(doc, BRAND)
  scrivi(doc, 'D.D.T.', DESTRA, 21, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  inchiostro(doc, MUTE)
  scrivi(doc, 'Documento di trasporto', DESTRA, 25.5, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  inchiostro(doc, INK)
  scrivi(doc, ddt.numero, DESTRA, 31.5, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  inchiostro(doc, INK_SOFT)
  scrivi(doc, `Data ${formatData(ddt.data)}`, DESTRA, 36.5, { align: 'right' })
  if (ddt.ordine_numero) {
    scrivi(doc, `Vs. ordine ${ddt.ordine_numero}`, DESTRA, 41, { align: 'right' })
  }

  riga(doc, 45, 0.8, ORO)
  return 53
}

/** Destinatario a destra, luogo di destinazione a sinistra: sul DDT sono due
 *  cose diverse e capita spesso che non coincidano (cantiere, deposito). */
function blocchiTesta(doc: jsPDF, ddt: DDT, cliente: Cliente, yTop: number): number {
  const xBox = 108
  const larghezzaBox = DESTRA - xBox

  const righeCliente = [
    ddt.cliente_nome || cliente.ragione_sociale,
    cliente.indirizzo,
    [cliente.cap, cliente.citta, cliente.provincia ? `(${cliente.provincia})` : null]
      .filter(Boolean)
      .join(' '),
    identificativoFiscale(cliente),
  ].filter((r): r is string => Boolean(r && r.trim()))

  const righeDestinazione = [
    ddt.destinazione_indirizzo,
    [
      ddt.destinazione_cap,
      ddt.destinazione_citta,
      ddt.destinazione_provincia ? `(${ddt.destinazione_provincia})` : null,
    ]
      .filter(Boolean)
      .join(' '),
  ].filter((r): r is string => Boolean(r && r.trim()))

  const altezzaBox = 9 + Math.max(righeCliente.length, righeDestinazione.length + 1) * 4.4 + 3

  tratto(doc, LINEA)
  doc.setLineWidth(0.2)
  doc.rect(xBox, yTop, larghezzaBox, altezzaBox)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  inchiostro(doc, MUTE)
  scrivi(doc, 'DESTINATARIO', xBox + 4, yTop + 6)

  let yRiga = yTop + 12
  righeCliente.forEach((testo, i) => {
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal')
    doc.setFontSize(i === 0 ? 10 : 8.5)
    inchiostro(doc, i === 0 ? INK : INK_SOFT)
    scrivi(doc, testo, xBox + 4, yRiga)
    yRiga += 4.4
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  inchiostro(doc, MUTE)
  scrivi(doc, 'LUOGO DI DESTINAZIONE', M, yTop + 6)

  doc.setFontSize(8.5)
  inchiostro(doc, INK)
  let yDest = yTop + 12
  if (righeDestinazione.length === 0) {
    doc.setFont('helvetica', 'italic')
    scrivi(doc, 'Sede del destinatario', M, yDest)
    yDest += 4.4
  } else {
    for (const testo of righeDestinazione) {
      scrivi(doc, testo, M, yDest)
      yDest += 4.4
    }
  }

  return Math.max(yTop + altezzaBox, yDest) + 8
}

/** Causale, trasporto, vettore, aspetto, colli, peso: i dati che rendono il
 *  documento valido come prova del trasporto. */
function strisciaTrasporto(doc: jsPDF, ddt: DDT, yTop: number): number {
  const altezza = 20
  riempi(doc, TINT)
  doc.rect(M, yTop, DESTRA - M, altezza, 'F')

  const voci: Array<[string, string]> = [
    ['Causale del trasporto', etichettaCausale(ddt)],
    ['Trasporto a cura di', TRASPORTO_LABEL[ddt.trasporto_a_cura_di]],
    ['Vettore', ddt.vettore || '—'],
    ['Aspetto dei beni', ddt.aspetto_beni || brandConfig.documenti.aspettoBeniDefault],
    ['Colli', String(ddt.colli_totali)],
    [
      'Peso lordo',
      ddt.peso_totale_kg_milli ? formatQuantita(ddt.peso_totale_kg_milli, 'kg') : '—',
    ],
  ]

  const larghezzaColonna = (DESTRA - M) / 3
  voci.forEach(([etichetta, valore], i) => {
    const x = M + 3 + (i % 3) * larghezzaColonna
    const y = yTop + (i < 3 ? 6 : 15)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    inchiostro(doc, MUTE)
    scrivi(doc, etichetta.toUpperCase(), x, y)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    inchiostro(doc, INK)
    const [prima] = spezza(doc, valore, larghezzaColonna - 5)
    scrivi(doc, prima ?? valore, x, y + 4)
  })

  // data e ora del trasporto, sotto la striscia
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  inchiostro(doc, INK_SOFT)
  const ora = ddt.ora_trasporto ? ` — ore ${ddt.ora_trasporto}` : ''
  scrivi(doc, `Data e ora del trasporto: ${formatData(ddt.data_trasporto)}${ora}`, M, yTop + altezza + 5)

  return yTop + altezza + 11
}

// ---------------------------------------------------------------------------
// Righe
// ---------------------------------------------------------------------------

function intestazioneTabella(doc: jsPDF, c: Colonne, y: number): number {
  riempi(doc, TINT)
  doc.rect(M, y, DESTRA - M, 7, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  inchiostro(doc, INK)
  const base = y + 4.7
  scrivi(doc, 'DESCRIZIONE', M + 2, base)
  scrivi(doc, 'QUANTITÀ', c.quantita, base, { align: 'right' })
  scrivi(doc, 'COLLI', c.colli, base, { align: 'right' })
  scrivi(doc, 'PESO KG', c.peso - (c.prezzo ? 0 : 2), base, { align: 'right' })
  if (c.prezzo !== null && c.imponibile !== null) {
    scrivi(doc, 'PREZZO', c.prezzo, base, { align: 'right' })
    scrivi(doc, 'IMPONIBILE', c.imponibile - 2, base, { align: 'right' })
  }

  return y + 7
}

/** Seconda riga della cella descrizione. Il lotto è la tracciabilità che il
 *  cliente si porta a casa: da quale partita di legno esce la sua fornitura. */
function dettaglioRiga(r: RigaDDT): string {
  return [
    r.codice_articolo,
    r.lotto_codice ? `lotto ${r.lotto_codice}` : null,
    r.note,
  ]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(' · ')
}


function tabellaRighe(doc: jsPDF, ddt: DDT, c: Colonne, yIniziale: number): number {
  let y = intestazioneTabella(doc, c, yIniziale)

  if (!ddt.righe.length) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    inchiostro(doc, MUTE)
    scrivi(doc, 'Nessuna riga.', M + 2, y + 6)
    return y + 12
  }

  for (const r of ddt.righe) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const linee = spezza(doc, r.descrizione, c.larghezzaDescrizione)
    const dettaglio = dettaglioRiga(r)
    const altezza = linee.length * 4.2 + (dettaglio ? 3.8 : 0) + 3.6

    if (y + altezza > FONDO) {
      y = intestazioneTabella(doc, c, nuovaPagina(doc, `DDT ${ddt.numero}`))
    }

    let yTesto = y + 4.6
    inchiostro(doc, INK)
    for (const linea of linee) {
      scrivi(doc, linea, M + 2, yTesto)
      yTesto += 4.2
    }

    const base = y + 4.6
    scrivi(doc, formatQuantita(r.quantita_milli, r.unita_misura), c.quantita, base, {
      align: 'right',
    })
    scrivi(doc, r.colli ? String(r.colli) : '—', c.colli, base, { align: 'right' })
    scrivi(
      doc,
      r.peso_kg_milli ? formatQuantita(r.peso_kg_milli, 'kg', false) : '—',
      c.peso - (c.prezzo ? 0 : 2),
      base,
      { align: 'right' },
    )

    // ⚠️ i prezzi escono solo su un DDT valorizzato
    if (c.prezzo !== null && c.imponibile !== null) {
      scrivi(doc, formatImporto(r.prezzo_unitario_cents), c.prezzo, base, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      scrivi(doc, formatImporto(r.imponibile_cents), c.imponibile - 2, base, { align: 'right' })
      doc.setFont('helvetica', 'normal')
    }

    if (dettaglio) {
      doc.setFontSize(7.5)
      inchiostro(doc, MUTE)
      const [prima] = spezza(doc, dettaglio, c.larghezzaDescrizione + 20)
      scrivi(doc, prima ?? dettaglio, M + 2, yTesto)
      doc.setFontSize(9)
    }

    y += altezza
    riga(doc, y)
  }

  // totali di colli e peso: è ciò che si controlla materialmente allo scarico
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  inchiostro(doc, INK)
  y += 5
  scrivi(doc, `Totale colli ${ddt.colli_totali}`, M + 2, y)
  if (ddt.peso_totale_kg_milli) {
    scrivi(
      doc,
      `Peso complessivo ${formatQuantita(ddt.peso_totale_kg_milli, 'kg')}`,
      c.peso - (c.prezzo ? 0 : 2),
      y,
      { align: 'right' },
    )
  }

  return y + 4
}

// ---------------------------------------------------------------------------
// Totali — solo se il DDT è valorizzato
// ---------------------------------------------------------------------------

function totali(doc: jsPDF, ddt: DDT, yIniziale: number): number {
  if (!ddt.valorizzato) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    inchiostro(doc, MUTE)
    scrivi(doc, 'Documento non valorizzato: le quantità non sono seguite dagli importi.', M, yIniziale + 5)
    return yIniziale + 9
  }

  const t = totaliDocumento(ddt.righe, 0)
  const altezzaStimata = 20 + t.riepilogo_iva.length * 5
  let y = yIniziale + 6
  if (y + altezzaStimata > FONDO) y = nuovaPagina(doc, `DDT ${ddt.numero}`)

  const voce = (etichetta: string, valore: string, grassetto = false): void => {
    doc.setFont('helvetica', grassetto ? 'bold' : 'normal')
    doc.setFontSize(9)
    inchiostro(doc, grassetto ? INK : INK_SOFT)
    scrivi(doc, etichetta, 118, y)
    scrivi(doc, valore, DESTRA - 2, y, { align: 'right' })
    y += 5
  }

  voce('Totale imponibile', formatImporto(t.imponibile_cents), true)
  for (const v of t.riepilogo_iva) {
    // il riferimento normativo, non «IVA 0%»: vedi etichettaVoceRiepilogo
    voce(`${etichettaVoceRiepilogo(v)} su ${formatImporto(v.imponibile_cents)}`, formatImporto(v.iva_cents))
  }

  riempi(doc, TINT)
  doc.rect(114, y, DESTRA - 114, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  inchiostro(doc, INK)
  scrivi(doc, 'TOTALE', 118, y + 6.6)
  scrivi(doc, `${formatImporto(t.totale_cents)} €`, DESTRA - 3, y + 6.6, { align: 'right' })

  return y + 14
}

// ---------------------------------------------------------------------------
// Note e firme
// ---------------------------------------------------------------------------

function note(doc: jsPDF, ddt: DDT, yIniziale: number): number {
  if (!ddt.note?.trim()) return yIniziale
  let y = yIniziale + 4
  if (y + 20 > FONDO) y = nuovaPagina(doc, `DDT ${ddt.numero}`)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  inchiostro(doc, MUTE)
  scrivi(doc, 'NOTE', M, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  inchiostro(doc, INK)
  y += 4.4
  for (const linea of spezza(doc, ddt.note, DESTRA - M)) {
    scrivi(doc, linea, M, y)
    y += 4.2
  }
  return y + 3
}

/** Tre firme: chi consegna, chi trasporta, chi riceve. Sono quelle che rendono
 *  il documento utile davvero — il DDT senza la firma di chi riceve non prova
 *  niente. */
function firme(doc: jsPDF, ddt: DDT, yIniziale: number): void {
  let y = Math.max(yIniziale + 12, 240)
  if (y + 20 > 276) {
    y = nuovaPagina(doc, `DDT ${ddt.numero}`) + 20
  }

  const larghezza = 52
  const passo = (DESTRA - M - larghezza) / 2
  const etichette = ['Firma del conducente', 'Firma del vettore', 'Firma del destinatario']

  tratto(doc, LINEA)
  doc.setLineWidth(0.2)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  etichette.forEach((etichetta, i) => {
    const x = M + i * passo
    doc.line(x, y, x + larghezza, y)
    inchiostro(doc, MUTE)
    scrivi(doc, etichetta, x, y + 4)
  })
}

