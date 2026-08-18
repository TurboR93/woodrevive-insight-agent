/**
 * PDF del preventivo.
 *
 * jsPDF arriva con `await import('jspdf')`: la libreria pesa più di tutto il
 * resto del pannello messo insieme e non deve entrare nel bundle iniziale.
 * Vite la isola in un chunk a parte, che si scarica solo quando qualcuno
 * stampa davvero un documento.
 *
 * ⚠️ `documents/` è l'unica cartella con valori colore letterali ammessi:
 * jsPDF vuole terne RGB numeriche. Palette, geometria e helper condivisi
 * stanno in `comune.ts`; qui restano `FONDO` e il layout, che sono di questa
 * stampa e di nessun'altra.
 */

import type { jsPDF } from 'jspdf'

import { brandConfig, indirizzoCompleto } from '../brand.config'
import {
  ESSENZA_LABEL,
  PATINA_LABEL,
  identificativoFiscale,
  type Cliente,
  type Essenza,
  type Patina,
  type Preventivo,
  type RigaPreventivo,
  etichettaVoceRiepilogo,
} from '../domain'
import { formatData, formatImporto, formatPercentuale, formatQuantita } from '../lib/format'
import { totaliDocumento, type TotaliDocumento } from '../lib/money'
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

const FONDO = 258 // oltre questa quota si cambia pagina: sotto c'è il piede

// ---------------------------------------------------------------------------
// Colonne della tabella righe
// ---------------------------------------------------------------------------

const COL = {
  descrizione: M,
  larghezzaDescrizione: 84,
  quantita: 120, // allineate a destra
  prezzo: 143,
  sconto: 158,
  imponibile: DESTRA,
} as const

// ===========================================================================
// Generatore
// ===========================================================================

export async function generaPreventivoPdf(
  preventivo: Preventivo,
  cliente: Cliente,
): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setLineHeightFactor(1.2)

  // I totali si ricalcolano con la stessa funzione che li ha scritti sul
  // documento: il PDF non deve poter dire un numero diverso dalla scheda.
  const totali = totaliDocumento(preventivo.righe, preventivo.sconto_generale_percentuale)

  let y = intestazione(doc, preventivo)
  y = blocchiTesta(doc, preventivo, cliente, y)
  y = tabellaRighe(doc, preventivo, y)
  y = riepilogoTotali(doc, preventivo, totali, y)
  y = condizioni(doc, preventivo, y)
  y = noteFinali(doc, preventivo, y)
  firme(doc, y)
  piedi(doc)

  doc.save(`${pulisci(preventivo.numero)}.pdf`)
}

// ---------------------------------------------------------------------------
// Testata
// ---------------------------------------------------------------------------

/**
 * Mittente a sinistra, dati del documento a destra.
 * Il logo non c'è di proposito: l'unico file disponibile è un PNG 401×68 e a
 * 300 dpi si vede. Finché non arriva il vettoriale dal cliente, il nome scritto
 * in grande è più dignitoso di un logo sgranato (vedi docs/stato-progetto.md).
 */
function intestazione(doc: jsPDF, preventivo: Preventivo): number {
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
  scrivi(
    doc,
    `${brandConfig.telefono} · ${brandConfig.email} · ${brandConfig.sito}`,
    M,
    40,
  )

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  inchiostro(doc, BRAND)
  scrivi(doc, 'PREVENTIVO', DESTRA, 21, { align: 'right' })

  doc.setFontSize(11)
  inchiostro(doc, INK)
  scrivi(doc, preventivo.numero, DESTRA, 27.5, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  inchiostro(doc, INK_SOFT)
  scrivi(doc, `Data ${formatData(preventivo.data)}`, DESTRA, 33, { align: 'right' })
  scrivi(doc, `Valido fino al ${formatData(preventivo.data_scadenza)}`, DESTRA, 37.5, {
    align: 'right',
  })

  riga(doc, 45, 0.8, ORO)
  return 53
}

/** Destinatario a destra, oggetto a sinistra. */
function blocchiTesta(
  doc: jsPDF,
  preventivo: Preventivo,
  cliente: Cliente,
  yTop: number,
): number {
  const xBox = 108
  const larghezzaBox = DESTRA - xBox

  const righeCliente = [
    cliente.ragione_sociale,
    cliente.referente ? `c.a. ${cliente.referente}` : null,
    cliente.indirizzo,
    [cliente.cap, cliente.citta, cliente.provincia ? `(${cliente.provincia})` : null]
      .filter(Boolean)
      .join(' '),
    identificativoFiscale(cliente),
    cliente.email,
  ].filter((r): r is string => Boolean(r && r.trim()))

  const altezzaBox = 9 + righeCliente.length * 4.4 + 3

  tratto(doc, LINEA)
  doc.setLineWidth(0.2)
  doc.rect(xBox, yTop, larghezzaBox, altezzaBox)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  inchiostro(doc, MUTE)
  scrivi(doc, 'SPETTABILE', xBox + 4, yTop + 6)

  let yRiga = yTop + 12
  righeCliente.forEach((testo, i) => {
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal')
    doc.setFontSize(i === 0 ? 10 : 8.5)
    inchiostro(doc, i === 0 ? INK : INK_SOFT)
    scrivi(doc, testo, xBox + 4, yRiga)
    yRiga += 4.4
  })

  // oggetto, a sinistra
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  inchiostro(doc, MUTE)
  scrivi(doc, 'OGGETTO', M, yTop + 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  inchiostro(doc, INK)
  const linee = spezza(doc, preventivo.oggetto || '—', 84)
  let yOggetto = yTop + 12
  for (const linea of linee.slice(0, 4)) {
    scrivi(doc, linea, M, yOggetto)
    yOggetto += 4.8
  }

  return Math.max(yTop + altezzaBox, yOggetto) + 10
}

// ---------------------------------------------------------------------------
// Righe
// ---------------------------------------------------------------------------

function intestazioneTabella(doc: jsPDF, y: number): number {
  riempi(doc, TINT)
  doc.rect(M, y, DESTRA - M, 7, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  inchiostro(doc, INK)
  const base = y + 4.7
  scrivi(doc, 'DESCRIZIONE', COL.descrizione + 2, base)
  scrivi(doc, 'QUANTITÀ', COL.quantita, base, { align: 'right' })
  scrivi(doc, 'PREZZO', COL.prezzo, base, { align: 'right' })
  scrivi(doc, 'SCONTO', COL.sconto, base, { align: 'right' })
  scrivi(doc, 'IMPONIBILE', COL.imponibile - 2, base, { align: 'right' })

  return y + 7
}

/** Seconda riga della cella descrizione: le caratteristiche del materiale. */
function dettaglioRiga(r: RigaPreventivo): string {
  const parti = [
    r.codice_articolo,
    r.essenza ? ESSENZA_LABEL[r.essenza as Essenza] : null,
    r.patina ? PATINA_LABEL[r.patina as Patina] : null,
    r.spessore_mm ? `${r.spessore_mm} mm` : null,
    r.lotto_codice ? `lotto ${r.lotto_codice}` : null,
    r.note,
  ].filter((p): p is string => Boolean(p && p.trim()))
  return parti.join(' · ')
}


function tabellaRighe(doc: jsPDF, preventivo: Preventivo, yIniziale: number): number {
  let y = intestazioneTabella(doc, yIniziale)

  if (!preventivo.righe.length) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    inchiostro(doc, MUTE)
    scrivi(doc, 'Nessuna riga.', M + 2, y + 6)
    return y + 12
  }

  for (const r of preventivo.righe) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const linee = spezza(doc, r.descrizione, COL.larghezzaDescrizione)
    const dettaglio = dettaglioRiga(r)
    const altezza = linee.length * 4.2 + (dettaglio ? 3.8 : 0) + 3.6

    if (y + altezza > FONDO) {
      y = intestazioneTabella(doc, nuovaPagina(doc, `Preventivo ${preventivo.numero}`))
    }

    let yTesto = y + 4.6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    inchiostro(doc, INK)
    for (const linea of linee) {
      scrivi(doc, linea, COL.descrizione + 2, yTesto)
      yTesto += 4.2
    }

    // gli importi stanno sulla prima riga della descrizione
    const baseNumeri = y + 4.6
    scrivi(doc, formatQuantita(r.quantita_milli, r.unita_misura), COL.quantita, baseNumeri, {
      align: 'right',
    })
    scrivi(doc, formatImporto(r.prezzo_unitario_cents), COL.prezzo, baseNumeri, {
      align: 'right',
    })
    scrivi(
      doc,
      r.sconto_percentuale ? formatPercentuale(r.sconto_percentuale, 0) : '—',
      COL.sconto,
      baseNumeri,
      { align: 'right' },
    )
    doc.setFont('helvetica', 'bold')
    scrivi(doc, formatImporto(r.imponibile_cents), COL.imponibile - 2, baseNumeri, {
      align: 'right',
    })

    if (dettaglio) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      inchiostro(doc, MUTE)
      const [primaLinea] = spezza(doc, dettaglio, COL.larghezzaDescrizione + 20)
      scrivi(doc, primaLinea, COL.descrizione + 2, yTesto)
    }

    y += altezza
    riga(doc, y)
  }

  return y
}

// ---------------------------------------------------------------------------
// Totali
// ---------------------------------------------------------------------------

function voceTotale(
  doc: jsPDF,
  etichetta: string,
  valore: string,
  y: number,
  grassetto = false,
): void {
  doc.setFont('helvetica', grassetto ? 'bold' : 'normal')
  doc.setFontSize(9)
  inchiostro(doc, grassetto ? INK : INK_SOFT)
  scrivi(doc, etichetta, 118, y)
  scrivi(doc, valore, DESTRA - 2, y, { align: 'right' })
}

function riepilogoTotali(
  doc: jsPDF,
  preventivo: Preventivo,
  totali: TotaliDocumento,
  yIniziale: number,
): number {
  // il blocco totali non si spezza mai a metà: se non ci sta, va a pagina nuova
  const altezzaStimata = 26 + totali.riepilogo_iva.length * 5
  let y = yIniziale + 6
  if (y + altezzaStimata > FONDO) y = nuovaPagina(doc, `Preventivo ${preventivo.numero}`)

  if (totali.sconto_generale_cents > 0) {
    voceTotale(doc, 'Imponibile lordo', formatImporto(totali.imponibile_lordo_cents), y)
    y += 5
    voceTotale(
      doc,
      `Sconto generale ${formatPercentuale(preventivo.sconto_generale_percentuale, 0)}`,
      `− ${formatImporto(totali.sconto_generale_cents)}`,
      y,
    )
    y += 5
  }

  voceTotale(doc, 'Totale imponibile', formatImporto(totali.imponibile_cents), y, true)
  y += 5.5

  // Riepilogo IVA per CODICE: l'IVA si calcola sulla somma degli imponibili dello
  // stesso codice, non riga per riga. Vedi docs/documenti-e-numerazione.md.
  //
  // L'etichetta non è l'aliquota ma il riferimento normativo, quando ce n'è uno:
  // «IVA 0% su 12.000,00» su un'esportazione non è solo brutto, è una fattura
  // irregolare — il motivo della non imponibilità va indicato.
  for (const voce of totali.riepilogo_iva) {
    voceTotale(
      doc,
      `${etichettaVoceRiepilogo(voce)} su ${formatImporto(voce.imponibile_cents)}`,
      formatImporto(voce.iva_cents),
      y,
    )
    y += 5
  }

  y += 1
  riempi(doc, TINT)
  doc.rect(114, y, DESTRA - 114, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  inchiostro(doc, INK)
  scrivi(doc, 'TOTALE', 118, y + 6.6)
  scrivi(doc, `${formatImporto(totali.totale_cents)} €`, DESTRA - 3, y + 6.6, {
    align: 'right',
  })

  return y + 14
}

// ---------------------------------------------------------------------------
// Condizioni, note, firme, piede
// ---------------------------------------------------------------------------

function vocePiede(doc: jsPDF, etichetta: string, valore: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  inchiostro(doc, MUTE)
  scrivi(doc, etichetta.toUpperCase(), M, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  inchiostro(doc, INK)
  const linee = spezza(doc, valore, DESTRA - M)
  let yTesto = y + 4.4
  for (const linea of linee) {
    scrivi(doc, linea, M, yTesto)
    yTesto += 4.2
  }
  return yTesto + 3
}

function condizioni(doc: jsPDF, preventivo: Preventivo, yIniziale: number): number {
  let y = yIniziale + 2
  if (y + 30 > FONDO) y = nuovaPagina(doc, `Preventivo ${preventivo.numero}`)

  y = vocePiede(
    doc,
    'Condizioni di pagamento',
    preventivo.condizioni_pagamento || brandConfig.documenti.condizioniPagamento,
    y,
  )
  y = vocePiede(
    doc,
    'Tempi di consegna',
    preventivo.tempi_consegna || brandConfig.documenti.tempiConsegna,
    y,
  )
  y = vocePiede(
    doc,
    'Validità dell’offerta',
    `${preventivo.validita_giorni} giorni — fino al ${formatData(preventivo.data_scadenza)}`,
    y,
  )
  return y
}

function noteFinali(doc: jsPDF, preventivo: Preventivo, yIniziale: number): number {
  let y = yIniziale
  if (preventivo.note?.trim()) {
    if (y + 20 > FONDO) y = nuovaPagina(doc, `Preventivo ${preventivo.numero}`)
    y = vocePiede(doc, 'Note', preventivo.note, y)
  }

  const testo = brandConfig.documenti.noteFinaliPreventivo
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  const linee = spezza(doc, testo, DESTRA - M)
  if (y + linee.length * 3.6 + 6 > FONDO) y = nuovaPagina(doc, `Preventivo ${preventivo.numero}`)

  riga(doc, y)
  y += 5
  inchiostro(doc, MUTE)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  for (const linea of linee) {
    scrivi(doc, linea, M, y)
    y += 3.6
  }
  return y + 6
}

/** Due righe firma: chi propone e chi accetta. */
function firme(doc: jsPDF, yIniziale: number): void {
  let y = yIniziale + 8
  if (y + 22 > 276) {
    doc.addPage()
    y = 40
  }

  const larghezza = 76
  const xDestra = DESTRA - larghezza

  tratto(doc, LINEA)
  doc.setLineWidth(0.2)
  doc.line(M, y, M + larghezza, y)
  doc.line(xDestra, y, DESTRA, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  inchiostro(doc, MUTE)
  scrivi(doc, brandConfig.nomeCompleto, M, y + 4)
  scrivi(doc, 'Per accettazione — il Cliente', xDestra, y + 4)
}

