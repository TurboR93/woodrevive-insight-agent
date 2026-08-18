/**
 * Impalcatura del seed.
 *
 * Le date sono **ancorate a oggi**: un lotto recuperato "quattro mesi fa" resta
 * quattro mesi fa anche se il pannello si apre fra un anno. Un seed con date
 * fisse invecchia e dopo qualche mese mostra un gestionale pieno di documenti
 * scaduti, che non è la demo che vogliamo far vedere.
 */

const OGGI = new Date()

export function giorniFa(n: number): string {
  const d = new Date(OGGI)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export function giorniTra(n: number): string {
  return giorniFa(-n)
}

export function mesiFa(n: number, giorno = 12): string {
  const d = new Date(OGGI.getFullYear(), OGGI.getMonth() - n, giorno)
  return d.toISOString().slice(0, 10)
}

/** Timestamp coerente con una data ISO: i record non risultano creati nel futuro. */
export function ms(dataIso: string): number {
  return Date.parse(`${dataIso}T09:00:00Z`)
}

export const ANNO = OGGI.getFullYear()

/** Numero di documento dell'anno corrente: PRV-2026-0003 */
export function num(prefisso: string, n: number): string {
  return `${prefisso}-${ANNO}-${String(n).padStart(4, '0')}`
}

export function codice(prefisso: string, n: number): string {
  return `${prefisso}-${String(n).padStart(4, '0')}`
}

/** Campi di tracciabilità a partire dalla data del documento. */
export function tracce(dataIso: string) {
  return { created_at: ms(dataIso), updated_at: ms(dataIso) }
}

/**
 * Un record del seed dimostrativo: l'entità meno i campi che il seed non
 * dichiara perché sono uniformi per costruzione.
 *
 * `id_esterno` è sempre `null`: niente nel seed viene dal vecchio gestionale, ed
 * è esattamente la differenza fra i dati dimostrativi e quelli importati.
 * Lo stampiglia `costruisciSeed`.
 */
export type Seme<T> = Omit<T, 'id_esterno'>

/**
 * Le anagrafiche del seed non dichiarano nemmeno `natura_fiscale`: si deriva
 * dagli identificativi con `naturaFiscaleDa`, così il seed e l'import
 * classificano un soggetto nello stesso modo e non esistono due verità.
 */
export type SemeAnagrafica<T> = Omit<T, 'id_esterno' | 'natura_fiscale'>

/**
 * I documenti del seed non dichiarano l'intestazione: la copia `costruisciSeed`
 * dall'anagrafica del cliente.
 *
 * È corretto **solo qui**. Sui documenti veri l'intestazione è uno snapshot del
 * giorno, e derivarla dall'anagrafica corrente sarebbe esattamente l'errore che
 * lo snapshot esiste per impedire. Ma i documenti dimostrativi sono nati oggi,
 * da queste anagrafiche: copiarle a mano trenta volte darebbe solo trenta
 * occasioni di scrivere un indirizzo diverso da quello della scheda.
 *
 * Nemmeno l'agente: nel seed non ce n'è, e `costruisciSeed` mette `null`.
 */
export type SemeDocumento<T> = Omit<
  T,
  'id_esterno' | 'intestazione' | 'agente_nome' | 'provvigione_cents'
>
