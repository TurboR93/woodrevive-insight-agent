/**
 * Denaro in CENTESIMI INTERI. Mai float per gli importi.
 *
 * Regola di arrotondamento del progetto: si arrotonda **una volta per riga**,
 * sull'imponibile. L'IVA si calcola **per codice IVA** sulla somma degli
 * imponibili già arrotondati, non riga per riga: è così che la calcola una
 * fattura elettronica, ed è così che il totale del nostro PDF coincide con
 * quello del commercialista.
 *
 * Il raggruppamento è per codice e non per aliquota perché nove dei codici usati
 * hanno aliquota zero con nature diverse, e due hanno la stessa aliquota con
 * nature diverse. Vedi `domain/fiscale.ts`.
 */

import { moltiplica } from './qty'

/** Calcola l'imponibile di una riga: quantità × prezzo, meno lo sconto riga. */
export function imponibileRiga(
  quantitaMilli: number,
  prezzoUnitarioCents: number,
  scontoPercentuale = 0,
): number {
  const lordo = moltiplica(quantitaMilli, prezzoUnitarioCents)
  if (!scontoPercentuale) return lordo
  return Math.round(lordo * (1 - scontoPercentuale / 100))
}

export interface RigaCalcolabile {
  imponibile_cents: number
  aliquota_iva: number
  /**
   * Codice IVA. Se manca, il raggruppamento è per sola aliquota — il
   * comportamento di sempre, che resta corretto per un documento a una o due
   * aliquote imponibili.
   *
   * `lib/` non conosce il dominio (vedi CLAUDE.md), quindi qui il codice è una
   * stringa qualunque: chi chiama lo prende da `domain/fiscale.ts`.
   */
  codice_iva?: string | null
  /** Natura dell'operazione, per farla comparire nel riepilogo. */
  natura_iva?: string | null
}

export interface VoceIva {
  /** Il codice, se la riga ne portava uno; altrimenti l'aliquota come stringa. */
  codice: string
  aliquota: number
  natura: string | null
  imponibile_cents: number
  iva_cents: number
}

export interface TotaliDocumento {
  imponibile_lordo_cents: number
  sconto_generale_cents: number
  imponibile_cents: number
  riepilogo_iva: VoceIva[]
  iva_cents: number
  totale_cents: number
}

/**
 * Totali di un documento, con sconto generale e riepilogo IVA multi-aliquota.
 *
 * Lo sconto generale si ripartisce proporzionalmente sulle righe **prima** di
 * calcolare l'IVA, altrimenti uno sconto del 10% su un documento con righe al
 * 22% e al 10% sposterebbe l'IVA nel modo sbagliato. L'ultimo residuo di
 * arrotondamento va sulla riga più grande, così la somma delle parti fa sempre
 * il totale (niente scarti da un centesimo nei PDF).
 */
export function totaliDocumento(
  righe: RigaCalcolabile[],
  scontoGeneralePercentuale = 0,
): TotaliDocumento {
  const imponibileLordo = righe.reduce((t, r) => t + r.imponibile_cents, 0)

  // Ripartizione dello sconto generale
  let scontoTotale = 0
  const imponibiliScontati = righe.map((r) => r.imponibile_cents)
  if (scontoGeneralePercentuale && imponibileLordo > 0) {
    scontoTotale = Math.round(imponibileLordo * (scontoGeneralePercentuale / 100))
    let ripartito = 0
    righe.forEach((r, i) => {
      const quota = Math.round((scontoTotale * r.imponibile_cents) / imponibileLordo)
      imponibiliScontati[i] = r.imponibile_cents - quota
      ripartito += quota
    })
    // il residuo di arrotondamento va sulla riga di importo maggiore
    const residuo = scontoTotale - ripartito
    if (residuo !== 0 && righe.length > 0) {
      let iMax = 0
      righe.forEach((r, i) => {
        if (r.imponibile_cents > righe[iMax].imponibile_cents) iMax = i
      })
      imponibiliScontati[iMax] -= residuo
    }
  }

  // Riepilogo per CODICE IVA, non per aliquota.
  //
  // Due righe entrambe allo 0% possono essere un'esportazione e una prestazione
  // esente, e su una fattura elettronica vanno dichiarate separate: raggruppate
  // per aliquota diventerebbero una sola voce «0%», e lo SDI la scarta. Idem per
  // `22` e `22r`, stessa aliquota e IVA versata da soggetti diversi.
  //
  // Il metodo di arrotondamento NON cambia (vedi il commento in testa al file):
  // si somma prima, si arrotonda una volta per gruppo. Cambia solo la finezza
  // della chiave — e più fine è più corretto.
  interface Gruppo {
    codice: string
    aliquota: number
    natura: string | null
    imponibile: number
  }
  const perCodice = new Map<string, Gruppo>()
  righe.forEach((r, i) => {
    const codice = r.codice_iva?.trim() || String(r.aliquota_iva)
    const gruppo = perCodice.get(codice)
    if (gruppo) {
      gruppo.imponibile += imponibiliScontati[i]
      return
    }
    perCodice.set(codice, {
      codice,
      aliquota: r.aliquota_iva,
      natura: r.natura_iva ?? null,
      imponibile: imponibiliScontati[i],
    })
  })

  const riepilogoIva: VoceIva[] = [...perCodice.values()]
    // ordinate per aliquota crescente, e a pari aliquota per codice: così un
    // documento con 22 e 22r ha un ordine stabile fra due esecuzioni
    .sort((a, b) => a.aliquota - b.aliquota || a.codice.localeCompare(b.codice))
    .map((g) => ({
      codice: g.codice,
      aliquota: g.aliquota,
      natura: g.natura,
      imponibile_cents: g.imponibile,
      iva_cents: Math.round((g.imponibile * g.aliquota) / 100),
    }))

  const imponibile = imponibileLordo - scontoTotale
  const iva = riepilogoIva.reduce((t, v) => t + v.iva_cents, 0)

  return {
    imponibile_lordo_cents: imponibileLordo,
    sconto_generale_cents: scontoTotale,
    imponibile_cents: imponibile,
    riepilogo_iva: riepilogoIva,
    iva_cents: iva,
    totale_cents: imponibile + iva,
  }
}

/** Margine percentuale di un prezzo di vendita rispetto al costo. Null se il costo è zero. */
export function marginePercentuale(
  prezzoCents: number,
  costoCents: number,
): number | null {
  if (!prezzoCents) return null
  if (!costoCents) return null
  return ((prezzoCents - costoCents) / prezzoCents) * 100
}

/**
 * Costo medio ponderato dopo un carico. È il criterio di valorizzazione del
 * magazzino: più semplice del FIFO e adatto a un materiale che si mescola
 * (due lotti di abete prima patina finiscono nella stessa catasta).
 */
export function nuovoCostoMedio(
  giacenzaMilli: number,
  costoMedioCents: number,
  caricoMilli: number,
  costoCaricoCents: number,
): number {
  const totaleQta = giacenzaMilli + caricoMilli
  if (totaleQta <= 0) return costoCaricoCents
  const valore = (giacenzaMilli * costoMedioCents + caricoMilli * costoCaricoCents) / totaleQta
  return Math.round(valore)
}

/**
 * Ripartisce un importo (tipicamente il trasporto di un ordine di acquisto)
 * sulle righe, in proporzione al loro valore. Il residuo va sulla prima riga:
 * la somma delle quote deve fare esattamente l'importo di partenza.
 */
export function ripartisci(importoCents: number, pesi: number[]): number[] {
  const totalePesi = pesi.reduce((t, p) => t + p, 0)
  if (!totalePesi || !importoCents) return pesi.map(() => 0)
  const quote = pesi.map((p) => Math.round((importoCents * p) / totalePesi))
  const residuo = importoCents - quote.reduce((t, q) => t + q, 0)
  if (residuo !== 0) quote[0] += residuo
  return quote
}
