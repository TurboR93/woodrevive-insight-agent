/**
 * Formattazione per l'interfaccia. È l'unico posto dove i centesimi tornano a
 * essere euro e i millesimi tornano a essere metri quadri.
 */

import { daMilli } from './qty'
import type { UnitaMisura } from '../domain/comuni'

const EURO = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const NUMERO = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
})

/** 31150 → "311,50 €" */
export function formatEuro(cents: number | null | undefined): string {
  return EURO.format((cents ?? 0) / 100)
}

/** 31150 → "311,50" (senza simbolo, per le colonne allineate a destra) */
export function formatImporto(cents: number | null | undefined): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((cents ?? 0) / 100)
}

/** "1.234,56" o "1234.56" → 123456 centesimi */
export function euroACents(testo: string): number {
  const pulito = testo.trim().replace(/[€\s]/g, '')
  if (!pulito) return 0
  const ultimaVirgola = pulito.lastIndexOf(',')
  const ultimoPunto = pulito.lastIndexOf('.')
  let normalizzato: string
  if (ultimaVirgola > ultimoPunto) normalizzato = pulito.replace(/\./g, '').replace(',', '.')
  else if (ultimoPunto > ultimaVirgola) normalizzato = pulito.replace(/,/g, '')
  else normalizzato = pulito
  const n = Number(normalizzato)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Centesimi → stringa per un campo di input, senza separatore di migliaia. */
export function centsAInput(cents: number | null | undefined): string {
  if (cents == null) return ''
  return ((cents ?? 0) / 100).toFixed(2).replace('.', ',')
}

export const SIMBOLO_UM: Record<UnitaMisura, string> = {
  mq: 'm²',
  ml: 'm',
  mc: 'm³',
  pz: 'pz',
  kg: 'kg',
  ora: 'h',
  // Una voce a corpo non ha simbolo: si scriverebbe "1 corpo", che non vuol dire
  // niente. La quantità di una riga a corpo non si stampa affatto.
  corpo: '',
}

/**
 * 12500 + 'mq' → "12,5 m²"
 * I pezzi non hanno decimali: "8 pz", mai "8,000 pz".
 * A corpo non c'è quantità da mostrare: "a corpo".
 */
export function formatQuantita(
  milli: number | null | undefined,
  um?: UnitaMisura | null,
  conUnita = true,
): string {
  if (um === 'corpo') return conUnita ? 'a corpo' : ''
  const valore = daMilli(milli ?? 0)
  const testo = um === 'pz' ? String(Math.round(valore)) : NUMERO.format(valore)
  return conUnita && um ? `${testo} ${SIMBOLO_UM[um]}` : testo
}

/** 12,7 → "12,7%" · null → "—" */
export function formatPercentuale(v: number | null | undefined, decimali = 1): string {
  if (v == null) return '—'
  return `${v.toFixed(decimali).replace('.', ',')}%`
}

/** "2026-03-18" → "18/03/2026" */
export function formatData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, g] = iso.split('-')
  if (!a || !m || !g) return iso
  return `${g}/${m}/${a}`
}

/** "2026-03-18" → "mar 2026" */
export function formatMese(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return new Intl.DateTimeFormat('it-IT', { month: 'short', year: 'numeric' }).format(d)
}

/** Data di oggi in ISO. */
export function oggiISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Somma giorni a una data ISO, restituendo ISO. */
export function aggiungiGiorni(iso: string, giorni: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + giorni)
  return d.toISOString().slice(0, 10)
}

/** Giorni tra due date ISO (b − a). Negativo se b precede a. */
export function giorniTra(a: string, b: string): number {
  const ms = new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()
  return Math.round(ms / 86_400_000)
}

/** Millimetri → "30 mm" · range → "90–210 mm" */
export function formatMm(min?: number | null, max?: number | null): string {
  if (min && max && min !== max) return `${min}–${max} mm`
  const v = min ?? max
  return v ? `${v} mm` : '—'
}

/** Trasforma 'prima_patina' in 'Prima patina' quando manca una label esplicita. */
export function umanizza(chiave: string): string {
  const t = chiave.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
