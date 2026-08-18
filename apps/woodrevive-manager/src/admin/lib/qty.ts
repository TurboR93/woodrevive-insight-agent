/**
 * Quantità in MILLESIMI INTERI.
 *
 * Il legno si vende a metri quadri, metri lineari e metri cubi, e ha sempre
 * decimali: 12,5 m², 3,457 m³. Con i float, sommare trecento righe di un
 * inventario produce 340.99999999999994 e la giacenza non torna mai.
 * Quindi: come per il denaro, si conta in interi e si divide solo per stampare.
 *
 *   12,5 m²   → 12500
 *   3,457 m³  →  3457
 *   8 pz      →  8000
 *
 * Tre decimali bastano: sotto il millesimo di metro cubo c'è un truciolo.
 */

export const MILLI = 1000

/** Converte una quantità decimale in millesimi interi. */
export function aMilli(valore: number): number {
  return Math.round(valore * MILLI)
}

/** Converte millesimi interi in decimale. Solo per stampare o per i grafici. */
export function daMilli(milli: number): number {
  return milli / MILLI
}

/**
 * Legge una quantità digitata da tastiera, in italiano o in inglese.
 * Accetta "12,5" · "12.5" · "1.234,56" · "1,234.56" · "" → 0
 */
export function inputAMilli(testo: string): number {
  const pulito = testo.trim().replace(/\s|m²|m³|mq|mc|ml|pz|kg/gi, '')
  if (!pulito) return 0

  const ultimaVirgola = pulito.lastIndexOf(',')
  const ultimoPunto = pulito.lastIndexOf('.')
  let normalizzato: string

  if (ultimaVirgola > ultimoPunto) {
    // formato italiano: il punto separa le migliaia
    normalizzato = pulito.replace(/\./g, '').replace(',', '.')
  } else if (ultimoPunto > ultimaVirgola) {
    normalizzato = pulito.replace(/,/g, '')
  } else {
    normalizzato = pulito
  }

  const n = Number(normalizzato)
  return Number.isFinite(n) ? Math.round(n * MILLI) : 0
}

/** Millesimi → stringa per un campo di input (senza separatore di migliaia). */
export function milliAInput(milli: number): string {
  if (!milli) return ''
  return String(daMilli(milli)).replace('.', ',')
}

/**
 * Moltiplica una quantità in millesimi per un prezzo in centesimi.
 * Restituisce centesimi interi, arrotondati una volta sola alla fine.
 *
 *   3,5 m² a 89,00 €/m²  →  moltiplica(3500, 8900) = 31150  (311,50 €)
 */
export function moltiplica(quantitaMilli: number, prezzoCents: number): number {
  return Math.round((quantitaMilli * prezzoCents) / MILLI)
}

/** Somma sicura di millesimi (gli interi non hanno bisogno di tolleranze). */
export function sommaMilli(valori: number[]): number {
  return valori.reduce((tot, v) => tot + v, 0)
}

/**
 * Volume in metri cubi (millesimi) di un pezzo di legno dalle sue misure in mm.
 * Ritorna null se manca una misura: senza spessore non si calcola il volume, e
 * mostrare 0 m³ farebbe credere che il dato ci sia.
 */
export function volumeMilli(
  spessoreMm: number | null | undefined,
  larghezzaMm: number | null | undefined,
  lunghezzaMm: number | null | undefined,
  pezzi = 1,
): number | null {
  if (!spessoreMm || !larghezzaMm || !lunghezzaMm) return null
  const mc = (spessoreMm / 1000) * (larghezzaMm / 1000) * (lunghezzaMm / 1000) * pezzi
  return Math.round(mc * MILLI)
}

/**
 * Da metri quadri a metri cubi conoscendo lo spessore.
 * È la conversione che serve continuamente: il fornitore quota a metri cubi, il
 * listino di vendita è a metri quadri, e il confronto va fatto sulla stessa
 * unità o il margine è un'illusione.
 *
 *   340 m² di tavola da 30 mm  →  mqAMc(340000, 30) = 10200  (10,2 m³)
 */
export function mqAMc(mqMilli: number, spessoreMm: number | null | undefined): number | null {
  if (!spessoreMm) return null
  return Math.round((mqMilli * spessoreMm) / 1000)
}

/** Inverso di `mqAMc`: quanti m² ricavo da tot m³ a un dato spessore. */
export function mcAMq(mcMilli: number, spessoreMm: number | null | undefined): number | null {
  if (!spessoreMm) return null
  return Math.round((mcMilli * 1000) / spessoreMm)
}
