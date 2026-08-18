/**
 * Anagrafiche: clienti e fornitori.
 *
 * Wood Revive rivende materiale proprio ad aziende (imprese edili, architetti,
 * rivenditori) e a privati. Le due nature convivono nella stessa entità perché
 * la differenza pratica è solo quale identificativo fiscale è obbligatorio:
 * tenerle separate raddoppierebbe le liste, i filtri e i selettori senza che
 * nessun campo commerciale cambi davvero.
 */

import type { Essenza, Importabile, Tracciabile } from './comuni'

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export type TipoCliente = 'azienda' | 'privato'

export const TIPO_CLIENTE_LABEL: Record<TipoCliente, string> = {
  azienda: 'Azienda',
  privato: 'Privato',
}

/**
 * Cosa è il soggetto agli occhi del fisco, dedotto dalla forma degli
 * identificativi. Easyfatt non ha un campo azienda/privato: ha una partita IVA
 * e un codice fiscale, e la loro forma dice tutto.
 *
 *   società            → il codice fiscale è la partita IVA (11 cifre)
 *   ditta individuale  → codice fiscale di persona (16 caratteri) + partita IVA
 *   privato            → solo codice fiscale di persona
 *   estero             → solo partita IVA, spesso non italiana
 *   non identificato   → né l'uno né l'altro: succede, e va detto
 *
 * È più ricco di `TipoCliente`, che resta perché decide quale identificativo è
 * obbligatorio e cosa si stampa sui documenti.
 */
export type NaturaFiscale =
  | 'societa'
  | 'ditta_individuale'
  | 'privato'
  | 'estero'
  | 'non_identificato'

export const NATURA_FISCALE_LABEL: Record<NaturaFiscale, string> = {
  societa: 'Società',
  ditta_individuale: 'Ditta individuale / professionista',
  privato: 'Privato consumatore',
  estero: 'Soggetto estero',
  non_identificato: 'Senza identificativo fiscale',
}

const SOLO_CIFRE = /^\d{11}$/
const CF_PERSONA = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/

/**
 * Deduce la natura fiscale dalla forma di partita IVA e codice fiscale.
 *
 * Unica sorgente di verità: la usano sia l'import dei dati storici sia il seed,
 * così non esistono due modi di classificare lo stesso soggetto.
 */
export function naturaFiscaleDa(
  piva: string | null,
  codiceFiscale: string | null,
): NaturaFiscale {
  const p = piva?.trim().toUpperCase() ?? ''
  const cf = codiceFiscale?.trim().toUpperCase() ?? ''
  if (!p && !cf) return 'non_identificato'
  if (p && !cf) return SOLO_CIFRE.test(p) ? 'societa' : 'estero'
  if (!p && cf) return CF_PERSONA.test(cf) ? 'privato' : 'societa'
  if (p === cf) return 'societa'
  return CF_PERSONA.test(cf) ? 'ditta_individuale' : 'societa'
}

/** Come è arrivato il cliente: serve a capire quali canali rendono. */
export type CanaleCliente =
  | 'diretto'
  | 'architetto'
  | 'impresa'
  | 'rivenditore'
  | 'showroom'
  | 'online'

export const CANALE_LABEL: Record<CanaleCliente, string> = {
  diretto: 'Contatto diretto',
  architetto: 'Studio di architettura',
  impresa: 'Impresa edile',
  rivenditore: 'Rivenditore',
  showroom: 'Showroom',
  online: 'Sito / online',
}

export interface Cliente extends Tracciabile, Importabile {
  codice: string // CLI-0001
  tipo: TipoCliente
  /** Dedotta dagli identificativi con `naturaFiscaleDa`. Più ricca di `tipo`. */
  natura_fiscale: NaturaFiscale
  ragione_sociale: string // per i privati: nome e cognome
  referente: string | null

  // Fiscali — per le aziende serve la P.IVA, per i privati il codice fiscale.
  // Il vincolo è nella validazione, non nei tipi: un'azienda in fase di
  // apertura può esistere in anagrafica prima di avere la partita IVA.
  piva: string | null
  codice_fiscale: string | null
  codice_sdi: string | null // fatturazione elettronica
  pec: string | null

  email: string | null
  telefono: string | null

  indirizzo: string | null
  cap: string | null
  citta: string | null
  provincia: string | null
  nazione: string // 'IT'

  /** Sede di consegna, se diversa dalla sede legale. Vuota = si consegna in sede. */
  consegna_indirizzo: string | null
  consegna_cap: string | null
  consegna_citta: string | null
  consegna_provincia: string | null

  canale: CanaleCliente
  /** Sconto proposto d'ufficio sui nuovi preventivi. Il preventivo può cambiarlo. */
  sconto_default_percentuale: number
  /** Aliquota proposta d'ufficio. 10% per le ristrutturazioni, 22% ordinaria. */
  aliquota_iva_default: number

  note: string | null
  attivo: boolean
}

export type ClienteInput = Omit<
  Cliente,
  keyof Tracciabile | keyof Importabile | 'codice' | 'natura_fiscale'
> & {
  codice?: string
}

// ---------------------------------------------------------------------------
// Fornitore
// ---------------------------------------------------------------------------

/**
 * Da chi arriva la merce. Wood Revive compra legno antico **già lavorato**:
 * demolitori, recuperanti, segherie e commercianti sono i quattro canali
 * d'acquisto; gli altri servono il trasporto e i materiali di consumo.
 */
export type TipoFornitore =
  | 'demolitore'
  | 'recuperante'
  | 'segheria'
  | 'commerciante'
  | 'ferramenta'
  | 'trasportatore'
  | 'altro'

export const TIPO_FORNITORE_LABEL: Record<TipoFornitore, string> = {
  demolitore: 'Impresa di demolizione',
  recuperante: 'Recuperante / rigattiere',
  segheria: 'Segheria',
  commerciante: 'Commerciante di legno antico',
  ferramenta: 'Ferramenta / utensileria',
  trasportatore: 'Trasportatore',
  altro: 'Altro',
}

export interface Fornitore extends Tracciabile, Importabile {
  codice: string // FOR-0001
  ragione_sociale: string
  tipo: TipoFornitore
  /** Dedotta dagli identificativi con `naturaFiscaleDa`. */
  natura_fiscale: NaturaFiscale
  referente: string | null

  // Fiscali. Un fornitore si paga e si registra in contabilità come un
  // cliente si fattura: gli servono gli stessi identificativi, non meno.
  piva: string | null
  codice_fiscale: string | null
  codice_sdi: string | null
  pec: string | null

  email: string | null
  telefono: string | null

  indirizzo: string | null
  cap: string | null
  citta: string | null
  provincia: string | null
  nazione: string // 'IT'

  /** Essenze che questo fornitore procura di solito: aiuta a scegliere chi chiamare. */
  essenze_tipiche: Essenza[]

  note: string | null
  attivo: boolean
}

export type FornitoreInput = Omit<
  Fornitore,
  keyof Tracciabile | keyof Importabile | 'codice' | 'natura_fiscale'
> & {
  codice?: string
}

// ---------------------------------------------------------------------------
// Dati calcolati, non persistiti
// ---------------------------------------------------------------------------

/** Riepilogo mostrato nella scheda cliente. Lo calcola l'API, non sta a database. */
export interface ClienteConTotali extends Cliente {
  preventivi_aperti: number
  ordini_aperti: number
  fatturato_cents: number
  ultimo_ordine: string | null
}

export interface FornitoreConTotali extends Fornitore {
  /** Partite d'acquisto arrivate da questo fornitore. */
  lotti_conferiti: number
  /** Quanto gli è stato pagato in totale, trasporto ripartito compreso. */
  speso_cents: number
  ultimo_acquisto: string | null
}

/** Indirizzo di consegna effettivo: quello dedicato se c'è, altrimenti la sede. */
export function indirizzoConsegna(c: Cliente): string {
  const usaConsegna = Boolean(c.consegna_indirizzo || c.consegna_citta)
  const via = usaConsegna ? c.consegna_indirizzo : c.indirizzo
  const cap = usaConsegna ? c.consegna_cap : c.cap
  const citta = usaConsegna ? c.consegna_citta : c.citta
  const prov = usaConsegna ? c.consegna_provincia : c.provincia
  return [via, [cap, citta].filter(Boolean).join(' '), prov ? `(${prov})` : null]
    .filter(Boolean)
    .join(', ')
}

/** Identificativo fiscale da stampare sui documenti. */
export function identificativoFiscale(c: Cliente): string {
  if (c.tipo === 'azienda') return c.piva ? `P.IVA ${c.piva}` : '—'
  return c.codice_fiscale ? `C.F. ${c.codice_fiscale}` : '—'
}
