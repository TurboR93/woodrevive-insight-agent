/**
 * Vocabolario di base condiviso da tutto il dominio.
 *
 * Convenzioni di rappresentazione valide OVUNQUE in questo progetto:
 *   denaro     → centesimi interi          `*_cents`
 *   quantità   → millesimi interi          `*_milli`
 *   misure     → millimetri interi         `*_mm`
 *   date       → stringa ISO 'YYYY-MM-DD'
 *   timestamp  → epoch in millisecondi     `created_at`, `updated_at`
 *   percentuali→ number con decimali       `22`, `10.5`
 *
 * Il perché sta in docs/modello-dati.md §2.
 */

export type ID = string

/** Campi presenti su ogni entità persistita. */
export interface Tracciabile {
  id: ID
  created_at: number
  updated_at: number
}

/**
 * Riferimento opzionale al record di una sorgente esterna.
 *
 * È la chiave dell'idempotenza: ri-eseguire l'import riconosce il record e lo
 * sostituisce invece di duplicarlo. `null` = record nato in questo gestionale.
 *
 * È unico dentro la propria collezione, non globalmente: la stessa controparte
 * può comparire come cliente e fornitore in collezioni distinte.
 */
export interface Importabile {
  id_esterno: string | null
}

/** Vero se il record arriva da una sorgente esterna e non è nato qui. */
export function eStorico(x: Importabile): boolean {
  return x.id_esterno !== null
}

// ---------------------------------------------------------------------------
// Legno
// ---------------------------------------------------------------------------

/** Essenze trattate da Wood Revive. Vedi docs/dominio-legno.md §1. */
export type Essenza =
  | 'abete'
  | 'larice'
  | 'rovere'
  | 'castagno'
  | 'olmo'
  | 'noce'
  | 'cirmolo'

export const ESSENZA_LABEL: Record<Essenza, string> = {
  abete: 'Abete',
  larice: 'Larice',
  rovere: 'Rovere',
  castagno: 'Castagno',
  olmo: 'Olmo',
  noce: 'Noce',
  cirmolo: 'Cirmolo',
}

/**
 * Patina: l'aspetto che il tempo ha dato alla superficie. Non è una finitura
 * che si applica, è un dato di fatto del materiale recuperato — e determina il
 * prezzo più dell'essenza. Vedi docs/dominio-legno.md §2.
 */
export type Patina =
  | 'prima_patina'
  | 'seconda_patina'
  | 'grigio'
  | 'bruciato_sole'
  | 'spazzolato'
  | 'naturale'

export const PATINA_LABEL: Record<Patina, string> = {
  prima_patina: 'Prima patina',
  seconda_patina: 'Seconda patina',
  grigio: 'Grigio',
  bruciato_sole: 'Bruciato dal sole',
  spazzolato: 'Spazzolato',
  naturale: 'Naturale (a vivo)',
}

/** Grado qualitativo di una partita: quanto materiale è di prima scelta. */
export type Qualita = 'A' | 'B' | 'C'

export const QUALITA_LABEL: Record<Qualita, string> = {
  A: 'A — prima scelta',
  B: 'B — commerciale',
  C: 'C — rustico',
}

// ---------------------------------------------------------------------------
// Unità di misura
// ---------------------------------------------------------------------------

/**
 * `corpo` serve per voci come una fornitura completa con un importo ma senza
 * un'unità fisica da moltiplicare.
 */
export type UnitaMisura = 'mq' | 'ml' | 'mc' | 'pz' | 'kg' | 'ora' | 'corpo'

export const UM_LABEL: Record<UnitaMisura, string> = {
  mq: 'Metri quadri',
  ml: 'Metri lineari',
  mc: 'Metri cubi',
  pz: 'Pezzi',
  kg: 'Chilogrammi',
  ora: 'Ore',
  corpo: 'A corpo',
}

// ---------------------------------------------------------------------------
// Tipo di riga di un documento
// ---------------------------------------------------------------------------

/**
 * Che cosa fa una riga dentro un documento commerciale.
 *
 *   merce        → una quantità con un prezzo
 *   sconto       → importo negativo; filtrarlo gonfierebbe i totali
 *   descrizione  → prosa commerciale, senza quantità né prezzo
 *   riferimento  → l'intestazione «** Rif. Doc. di trasporto 12 del 3/5/24»,
 *                  generata dal collegamento fra documenti
 */
export type TipoRigaDocumento = 'merce' | 'sconto' | 'descrizione' | 'riferimento'

export const TIPO_RIGA_LABEL: Record<TipoRigaDocumento, string> = {
  merce: 'Merce',
  sconto: 'Sconto',
  descrizione: 'Descrizione',
  riferimento: 'Riferimento',
}

/**
 * Vero se la riga porta un importo che entra nei totali.
 *
 * ⚠️ Non è la stessa domanda di «ha un articolo collegato»: una riga di merce
 * digitata a mano ha `articolo_id: null` e vale eccome.
 */
export function rigaValorizzata(r: { tipo: TipoRigaDocumento }): boolean {
  return r.tipo === 'merce' || r.tipo === 'sconto'
}

// ---------------------------------------------------------------------------
// Filtri di lista — forma comune a tutte le API
// ---------------------------------------------------------------------------

export interface FiltriLista {
  q?: string
  stato?: string
  dal?: string
  al?: string
  limite?: number
  [chiave: string]: string | number | boolean | undefined
}

/** Errore applicativo con codice HTTP: il mock lancia gli stessi codici del REST futuro. */
export class ErroreApi extends Error {
  status: number
  constructor(status: number, messaggio: string) {
    super(messaggio)
    this.name = 'ErroreApi'
    this.status = status
  }
}
