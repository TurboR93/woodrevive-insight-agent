/**
 * Incassi — acconti, saldi e scadenzario.
 *
 * Un commerciante non vive di fatturato ma di soldi entrati. Fra la conferma
 * dell'ordine e il saldo passano settimane, spesso mesi: senza un registro
 * degli incassi il gestionale dice quanto si è venduto e tace su quanto si è
 * riscosso, che è la domanda vera.
 *
 * Il `Pagamento` è un fatto: un movimento di denaro con una data e un mezzo.
 * `incassato_cents` e `residuo_cents` dell'ordine si DERIVANO da qui, non si
 * scrivono — stessa regola della giacenza.
 *
 * La nota di credito è un pagamento con importo NEGATIVO: uno storno riduce
 * ciò che il cliente deve, e tenerlo nella stessa collezione fa sì che la
 * somma dei pagamenti sia sempre "quanto è stato regolato", senza casi
 * speciali da nessuna parte.
 */

import type { ID, Importabile, Tracciabile } from './comuni'

export type TipoPagamento = 'acconto' | 'saldo' | 'nota_credito'

export const TIPO_PAGAMENTO_LABEL: Record<TipoPagamento, string> = {
  acconto: 'Acconto',
  saldo: 'Saldo',
  nota_credito: 'Nota di credito',
}

/**
 * Come il denaro si muove.
 *
 * `sdd` distingue un addebito automatico da un pagamento da sollecitare e non
 * va quindi classificato genericamente come «altro».
 */
export type MezzoPagamento =
  | 'bonifico'
  | 'contanti'
  | 'assegno'
  | 'pos'
  | 'riba'
  | 'sdd'
  | 'altro'

export const MEZZO_PAGAMENTO_LABEL: Record<MezzoPagamento, string> = {
  bonifico: 'Bonifico',
  contanti: 'Contanti',
  assegno: 'Assegno',
  pos: 'POS / carta',
  riba: 'Ri.Ba.',
  sdd: 'Addebito SEPA (SDD)',
  altro: 'Altro',
}

export interface Pagamento extends Tracciabile, Importabile {
  cliente_id: ID
  cliente_nome: string // snapshot
  /** Null per una caparra generica non ancora legata a un ordine. */
  ordine_id: ID | null
  ordine_numero: string | null

  tipo: TipoPagamento
  data: string
  /** Centesimi interi. La nota di credito è negativa. */
  importo_cents: number
  mezzo: MezzoPagamento
  riferimento: string | null // CRO del bonifico, numero dell'assegno
  note: string | null
}

export type PagamentoInput = Omit<
  Pagamento,
  keyof Tracciabile | keyof Importabile | 'cliente_nome' | 'ordine_numero'
>

// ===========================================================================
// SCADENZA — quello che è atteso, distinto da quello che è arrivato
// ===========================================================================

/**
 * Una partita in scadenza su una fattura.
 *
 * ## Perché non basta il `Pagamento`
 *
 * `Pagamento` è un fatto avvenuto: soldi entrati, con una data e un mezzo. Una
 * scadenza è un'**attesa**: «questa fattura va incassata il 30 settembre». Sono
 * due cose diverse. Un piano a rate non si può rappresentare con un solo campo
 * `data_scadenza_saldo` sull'ordine.
 *
 * Serve anche per sorgenti che registrano l'incasso contro la fattura e non
 * contro l'ordine.
 *
 * ## Il verso sta qui, non negli importi
 *
 * `importo_cents` è sempre **positivo**; `verso` dice se è un incasso o un
 * pagamento. Nel vecchio gestionale la convenzione era il segno (incassi
 * positivi, pagamenti negativi), e tradurla in un campo esplicito toglie la
 * classe di errori in cui un `Math.abs` di troppo trasforma un'uscita in
 * un'entrata.
 */
export type VersoScadenza = 'incasso' | 'pagamento'

export const VERSO_SCADENZA_LABEL: Record<VersoScadenza, string> = {
  incasso: 'Da incassare',
  pagamento: 'Da pagare',
}

export interface Scadenza extends Tracciabile, Importabile {
  documento_tipo: 'fattura' | 'fattura_acquisto'
  documento_id: ID
  /** Snapshot: lo scadenzario si legge senza una join. */
  documento_numero: string

  verso: VersoScadenza
  /** Uno dei due è valorizzato, secondo il verso. */
  cliente_id: ID | null
  fornitore_id: ID | null
  /** Snapshot del nome della controparte. */
  controparte_nome: string

  /** Quando è attesa. */
  data_scadenza: string
  /** Quando è stata regolata. Null se non lo è ancora. */
  data_pagamento: string | null
  /** Centesimi interi, sempre positivo: il verso sta in `verso`. */
  importo_cents: number

  /**
   * ⚠️ **Importato, non dedotto.**
   *
   * Non va dedotto da `data_pagamento !== null`: una data può essere prevista
   * senza che l'incasso sia stato confermato.
   */
  saldato: boolean

  /** Null se la sorgente non dichiara un mezzo di pagamento. */
  mezzo: MezzoPagamento | null
  /** Il conto di tesoreria: `BANCA BPM`, `Cassa contanti`, `Carta di credito`. */
  conto_tesoreria: string | null
  /** L'etichetta della rata: `1/2`, `2/2`, `Acc.`. Null se è l'unica. */
  rata_etichetta: string | null
  riferimento: string | null
  note: string | null
}

export type ScadenzaInput = Omit<
  Scadenza,
  keyof Tracciabile | keyof Importabile | 'controparte_nome' | 'documento_numero'
>

/** Vero se la scadenza è passata e non è stata regolata. */
export function scadenzaScaduta(s: Scadenza, oggi: string): boolean {
  return !s.saldato && s.data_scadenza < oggi
}

/** Quanto resta da incassare (o da pagare) da un insieme di scadenze. */
export function espostoCents(scadenze: Scadenza[], verso: VersoScadenza): number {
  return scadenze
    .filter((s) => !s.saldato && s.verso === verso)
    .reduce((t, s) => t + s.importo_cents, 0)
}

/** Giorni di ritardo di una scadenza rispetto a oggi. Zero se non è scaduta. */
export function giorniDiRitardo(dataScadenza: string | null, oggi: string): number {
  if (!dataScadenza || dataScadenza >= oggi) return 0
  const ms = new Date(oggi + 'T12:00:00').getTime() - new Date(dataScadenza + 'T12:00:00').getTime()
  return Math.round(ms / 86_400_000)
}

/** Riga dello scadenzario: un ordine con del residuo da incassare. */
/**
 * Una riga della lista «cosa devo ancora incassare».
 *
 * ⚠️ Ha **due sorgenti**, e non è un dettaglio implementativo: per i documenti
 * nati nel pannello il residuo è quello dell'ordine (totale meno i pagamenti
 * registrati); per l'archivio importato è la **scadenza di prima nota** non
 * saldata, perché nel vecchio gestionale si incassa contro la fattura e non
 * contro l'ordine.
 *
 * Mescolarle male sovrastimerebbe l'esposizione oppure ignorerebbe del tutto le
 * scadenze importate.
 */
export interface VoceScadenzario {
  /** Identità della riga in lista: l'ordine o la scadenza da cui nasce. */
  chiave: ID
  /** L'ordine, quando la voce nasce da un ordine. Null per una scadenza storica. */
  ordine_id: ID | null
  numero: string
  cliente_id: ID
  cliente_nome: string
  data_scadenza_saldo: string | null
  totale_cents: number
  incassato_cents: number
  residuo_cents: number
  giorni_ritardo: number
  scaduto: boolean
  /** Da dove viene la riga: cambia dove si va a incassare. */
  origine: 'ordine' | 'scadenza'
}
