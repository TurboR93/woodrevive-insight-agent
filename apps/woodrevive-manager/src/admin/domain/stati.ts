/**
 * Macchine a stati dei documenti.
 *
 * Ogni transizione è dichiarata qui, in un solo posto. L'interfaccia mostra
 * soltanto le transizioni ammesse (niente select con stati impossibili) e il
 * layer dati le rifiuta comunque, perché quando arriverà il backend la
 * validazione lato client non varrà più nulla.
 *
 * Le transizioni con EFFETTI COLLATERALI sul magazzino sono marcate: sono i due
 * punti — e solo quelli — in cui la giacenza si muove.
 */

import type {
  StatoDDT,
  StatoOrdine,
  StatoOrdineAcquisto,
  StatoPreventivo,
  StatoScheda,
} from './documenti'
import type { StatoLotto } from './magazzino'

/** Tono cromatico dello stato. I colori veri stanno in index.css. */
export type TonoStato = 'ok' | 'warn' | 'danger' | 'info' | 'neutro'

// ---------------------------------------------------------------------------
// Preventivo
// ---------------------------------------------------------------------------

export const TRANSIZIONI_PREVENTIVO: Record<StatoPreventivo, StatoPreventivo[]> = {
  bozza: ['inviato'],
  inviato: ['accettato', 'rifiutato', 'scaduto'],
  accettato: ['convertito', 'rifiutato'],
  rifiutato: ['inviato'], // il cliente ci ripensa: si rimanda
  scaduto: ['inviato'], // si rinnova la validità
  convertito: [], // fine: l'ordine è la sua continuazione
}

export const TONO_PREVENTIVO: Record<StatoPreventivo, TonoStato> = {
  bozza: 'neutro',
  inviato: 'info',
  accettato: 'ok',
  rifiutato: 'danger',
  scaduto: 'warn',
  convertito: 'ok',
}

// ---------------------------------------------------------------------------
// Ordine di vendita
// ---------------------------------------------------------------------------

/**
 * `evaso_parziale` ed `evaso` NON si impostano a mano: li calcola l'emissione
 * dei DDT. Restano fuori dalle transizioni manuali proprio per questo.
 *
 * `chiuso_forzato` è invece **esattamente** una decisione a mano: è l'ordine che
 * si dichiara finito pur non essendo stato consegnato del tutto. Ci si arriva da
 * un ordine aperto e non se ne esce — riaprirlo vorrebbe dire far ricomparire
 * merce impegnata che nessuno sta più aspettando.
 */
export const TRANSIZIONI_ORDINE: Record<StatoOrdine, StatoOrdine[]> = {
  bozza: ['confermato', 'annullato'],
  confermato: ['in_preparazione', 'chiuso_forzato', 'annullato'],
  in_preparazione: ['confermato', 'chiuso_forzato', 'annullato'],
  evaso_parziale: ['chiuso_forzato', 'annullato'],
  evaso: [],
  chiuso_forzato: [],
  annullato: [],
}

export const TONO_ORDINE: Record<StatoOrdine, TonoStato> = {
  bozza: 'neutro',
  confermato: 'info',
  in_preparazione: 'warn',
  evaso_parziale: 'warn',
  evaso: 'ok',
  // Non è un errore e non è un successo: è una decisione. Neutro.
  chiuso_forzato: 'neutro',
  annullato: 'danger',
}

// ---------------------------------------------------------------------------
// DDT
// ---------------------------------------------------------------------------

/**
 * ⚠️ `bozza → emesso` è la transizione che SCARICA il magazzino, e non torna
 * indietro. Un DDT emesso non si annulla cancellandolo: si emette un DDT di
 * reso, così i movimenti raccontano cosa è successo davvero.
 */
export const TRANSIZIONI_DDT: Record<StatoDDT, StatoDDT[]> = {
  bozza: ['emesso', 'annullato'],
  emesso: ['consegnato'],
  consegnato: [],
  annullato: [],
}

export const TONO_DDT: Record<StatoDDT, TonoStato> = {
  bozza: 'neutro',
  emesso: 'info',
  consegnato: 'ok',
  annullato: 'danger',
}

// ---------------------------------------------------------------------------
// Ordine di acquisto
// ---------------------------------------------------------------------------

/** ⚠️ La ricezione CARICA il magazzino: genera il lotto e i carichi di articolo. */
export const TRANSIZIONI_ACQUISTO: Record<StatoOrdineAcquisto, StatoOrdineAcquisto[]> = {
  bozza: ['inviato', 'annullato'],
  inviato: ['confermato', 'annullato'],
  confermato: ['ricevuto_parziale', 'ricevuto', 'annullato'],
  ricevuto_parziale: ['ricevuto'],
  ricevuto: [],
  annullato: [],
}

export const TONO_ACQUISTO: Record<StatoOrdineAcquisto, TonoStato> = {
  bozza: 'neutro',
  inviato: 'info',
  confermato: 'info',
  ricevuto_parziale: 'warn',
  ricevuto: 'ok',
  annullato: 'danger',
}

// ---------------------------------------------------------------------------
// Scheda lavorazione
// ---------------------------------------------------------------------------

/**
 * Nessuna transizione tocca il magazzino: la scheda è una specifica verso il
 * fornitore, non un'operazione. `inviata` resta modificabile — col fornitore
 * si aggiusta al telefono, e i campi sono tutti suoi, senza join che driftano.
 * Da `chiusa` e `annullata` non si esce: una scheda superata si rifà, non si
 * riapre.
 */
export const TRANSIZIONI_SCHEDA: Record<StatoScheda, StatoScheda[]> = {
  bozza: ['inviata', 'annullata'],
  inviata: ['chiusa', 'annullata'],
  chiusa: [],
  annullata: [],
}

export const TONO_SCHEDA: Record<StatoScheda, TonoStato> = {
  bozza: 'neutro',
  inviata: 'info',
  chiusa: 'ok',
  annullata: 'danger',
}

// ---------------------------------------------------------------------------
// Lotto
// ---------------------------------------------------------------------------

/**
 * `disponibile` ed `esaurito` NON si impostano a mano: li deriva la giacenza
 * residua della partita, esattamente come `evaso` per l'ordine. L'unica
 * transizione manuale è l'archiviazione, e il ritorno indietro se è stata un
 * errore — archiviare non cancella niente.
 */
export const TRANSIZIONI_LOTTO: Record<StatoLotto, StatoLotto[]> = {
  disponibile: ['archiviato'],
  esaurito: ['archiviato'],
  archiviato: ['disponibile'],
}

export const TONO_LOTTO: Record<StatoLotto, TonoStato> = {
  disponibile: 'ok',
  esaurito: 'neutro',
  archiviato: 'neutro',
}

// ---------------------------------------------------------------------------
// Helper generici
// ---------------------------------------------------------------------------

export function transizioneAmmessa<S extends string>(
  tabella: Record<S, S[]>,
  da: S,
  a: S,
): boolean {
  return (tabella[da] ?? []).includes(a)
}

/** Stati raggiungibili da quello attuale: alimenta la select di cambio stato. */
export function prossimiStati<S extends string>(tabella: Record<S, S[]>, da: S): S[] {
  return tabella[da] ?? []
}
