/**
 * Documenti commerciali: preventivo → ordine → DDT, più l'ordine di acquisto
 * che fa entrare la merce e la partita da cui proviene.
 *
 * Perché entità separate e non una tabella unica con un discriminatore di tipo
 * (il pattern del gestionale hAutomatico): là i movimenti sono tutti importi
 * senza righe, e la tabella unica funziona. Qui ogni documento ha righe proprie
 * con campi diversi — l'ordine porta la quantità evasa, il DDT i colli e il peso,
 * il preventivo la validità — e una tabella unica diventerebbe un modulo con
 * quaranta colonne nulle e altrettanti `if (tipo === …)`.
 *
 * I MOVIMENTI di magazzino, invece, restano una tabella unica: là il pattern è
 * corretto, perché carichi, scarichi e rettifiche hanno esattamente la stessa forma.
 *
 * ── Snapshot ──────────────────────────────────────────────────────────────
 * Ogni riga congela descrizione, prezzo, misure ed essenza al momento
 * dell'inserimento. Se il listino cambia domani, il preventivo che il cliente
 * ha firmato resta quello firmato. Vale anche per il nome del cliente sul
 * documento: `cliente_nome` è una copia, non una join.
 */

import type {
  Essenza,
  ID,
  Importabile,
  Patina,
  TipoRigaDocumento,
  Tracciabile,
  UnitaMisura,
} from './comuni'

// ===========================================================================
// Intestazione congelata
// ===========================================================================

/**
 * L'anagrafica **come era il giorno del documento**.
 *
 * Senza questo snapshot una fattura già emessa cambierebbe retroattivamente
 * quando qualcuno aggiorna l'anagrafica. La usano fatture e DDT anche quando il
 * destinatario è diverso dal cliente.
 */
export interface IntestazioneDocumento {
  nome: string
  indirizzo: string | null
  cap: string | null
  citta: string | null
  provincia: string | null
  nazione: string
  codice_fiscale: string | null
  piva: string | null
}

/**
 * Congela un'anagrafica nel momento in cui nasce il documento.
 *
 * Prende una forma, non un `Cliente`: così vale anche per i fornitori e
 * `domain/documenti.ts` non deve conoscere `domain/anagrafiche.ts`.
 *
 * ⚠️ Si chiama **una volta sola**, alla nascita del documento. Richiamarla su un
 * documento già emesso ne riscriverebbe l'indirizzo con quello di oggi, che è
 * precisamente ciò che lo snapshot esiste per impedire.
 */
export function intestazioneDa(a: {
  ragione_sociale: string
  indirizzo: string | null
  cap: string | null
  citta: string | null
  provincia: string | null
  nazione: string
  codice_fiscale: string | null
  piva: string | null
}): IntestazioneDocumento {
  return {
    nome: a.ragione_sociale,
    indirizzo: a.indirizzo,
    cap: a.cap,
    citta: a.citta,
    provincia: a.provincia,
    nazione: a.nazione,
    codice_fiscale: a.codice_fiscale,
    piva: a.piva,
  }
}

// ===========================================================================
// Riga comune
// ===========================================================================

/** Campi condivisi da tutte le righe di un documento di vendita. */
export interface RigaBase {
  id: ID
  /**
   * Cosa fa questa riga. Vedi `TipoRigaDocumento` in `comuni.ts`.
   *
   * ⚠️ Obbligatorio, senza default a `'merce'`: un default lo si dimentica
   * nell'importer e una riga di riferimento potrebbe diventare merce senza
   * prezzo. Meglio che il compilatore lo chieda ogni volta.
   */
  tipo: TipoRigaDocumento
  articolo_id: ID | null // null = riga libera, digitata a mano
  codice_articolo: string | null // snapshot
  descrizione: string // snapshot
  /** Lotto da cui prelevare, quando il cliente sceglie una partita precisa. */
  lotto_id: ID | null
  lotto_codice: string | null

  quantita_milli: number
  unita_misura: UnitaMisura
  prezzo_unitario_cents: number
  sconto_percentuale: number
  aliquota_iva: number
  /**
   * Derivato: quantità × prezzo − sconto. Ricalcolato a ogni salvataggio —
   * **tranne sui documenti importati**, dove è il valore scritto sul documento
   * che il cliente ha firmato. Vedi le guardie `eStorico` in `mockApi.ts`.
   */
  imponibile_cents: number

  // snapshot delle caratteristiche, per la stampa
  essenza: Essenza | null
  patina: Patina | null
  spessore_mm: number | null

  note: string | null
}

// ===========================================================================
// PREVENTIVO
// ===========================================================================

export type StatoPreventivo =
  | 'bozza'
  | 'inviato'
  | 'accettato'
  | 'rifiutato'
  | 'scaduto'
  | 'convertito' // è diventato un ordine: fine della sua vita

export const STATO_PREVENTIVO_LABEL: Record<StatoPreventivo, string> = {
  bozza: 'Bozza',
  inviato: 'Inviato',
  accettato: 'Accettato',
  rifiutato: 'Rifiutato',
  scaduto: 'Scaduto',
  convertito: 'Convertito in ordine',
}

export interface RigaPreventivo extends RigaBase {}

export interface Preventivo extends Tracciabile, Importabile {
  numero: string // PRV-2026-0001
  data: string
  cliente_id: ID
  cliente_nome: string // snapshot
  /** L'anagrafica come era quel giorno. Vedi `IntestazioneDocumento`. */
  intestazione: IntestazioneDocumento
  oggetto: string // "Pavimento rovere antico — villa a Conegliano"

  /** Vedi `Ordine.agente_nome`: un nome copiato, non un collegamento. */
  agente_nome: string | null
  provvigione_cents: number

  righe: RigaPreventivo[]
  sconto_generale_percentuale: number

  // Derivati da `totaliDocumento`
  imponibile_cents: number
  iva_cents: number
  totale_cents: number

  validita_giorni: number
  data_scadenza: string // derivata: data + validita_giorni

  condizioni_pagamento: string | null
  tempi_consegna: string | null
  note: string | null

  stato: StatoPreventivo
  ordine_id: ID | null // valorizzato alla conversione
}

export type PreventivoInput = Omit<
  Preventivo,
  | keyof Tracciabile
  | keyof Importabile
  | 'numero'
  | 'imponibile_cents'
  | 'iva_cents'
  | 'totale_cents'
  | 'data_scadenza'
> & { numero?: string }

export function preventivoScaduto(p: Preventivo, oggi: string): boolean {
  return (
    (p.stato === 'inviato' || p.stato === 'bozza') && Boolean(p.data_scadenza) && p.data_scadenza < oggi
  )
}

// ===========================================================================
// ORDINE (di vendita)
// ===========================================================================

/**
 * `chiuso_forzato` rappresenta un ordine dichiarato finito a mano, senza che le
 * consegne lo evadessero fino in fondo — merce non più voluta, quantità
 * arrotondata alla consegna, commessa chiusa a trattativa.
 *
 * Non è `evaso` (le consegne non coprono l'ordinato) e non è `annullato` (la
 * merce è partita e la fattura è stata emessa). Chiamarlo con uno dei due nomi
 * esistenti altererebbe il significato del documento.
 *
 * ⚠️⚠️ **Non è uno stato aperto** e non deve entrare nell'elenco degli stati
 * aperti in `ricalcolaDerivati` (`mock/db.ts`), altrimenti tornerebbe a impegnare
 * merce che non esiste più. Lo verifica un test.
 */
export type StatoOrdine =
  | 'bozza'
  | 'confermato'
  | 'in_preparazione'
  | 'evaso_parziale'
  | 'evaso'
  | 'chiuso_forzato'
  | 'annullato'

export const STATO_ORDINE_LABEL: Record<StatoOrdine, string> = {
  bozza: 'Da confermare',
  confermato: 'Confermato',
  in_preparazione: 'In preparazione',
  evaso_parziale: 'Evaso parzialmente',
  evaso: 'Evaso',
  chiuso_forzato: 'Chiuso a mano',
  annullato: 'Annullato',
}

export interface RigaOrdine extends RigaBase {
  /** Quanto è già uscito con i DDT. Derivato dai DDT emessi. */
  quantita_evasa_milli: number
}

export interface Ordine extends Tracciabile, Importabile {
  numero: string // ORD-2026-0001
  data: string
  cliente_id: ID
  cliente_nome: string
  /** L'anagrafica come era quel giorno. Vedi `IntestazioneDocumento`. */
  intestazione: IntestazioneDocumento

  preventivo_id: ID | null
  preventivo_numero: string | null

  /**
   * Chi ha portato la trattativa, e quanto ci guadagna.
   *
   * ⚠️ Un **nome copiato**, non un collegamento a un'anagrafica. Nei sei anni di
   * storico esiste un agente solo, per giunta già disattivato nel vecchio
   * gestionale: un'entità `Agente` con una scheda, una pagina e una lista
   * sarebbe stata impalcatura attorno a un record. Se un giorno gli agenti si
   * gestiscono davvero, questo campo diventa la chiave — il dato c'è già.
   */
  agente_nome: string | null
  provvigione_cents: number

  righe: RigaOrdine[]
  sconto_generale_percentuale: number

  imponibile_cents: number
  iva_cents: number
  totale_cents: number
  /** Acconto **pattuito** alla conferma. È un patto, non un incasso. */
  acconto_cents: number
  /** Entro quando è atteso il saldo. Null = nessuna scadenza concordata. */
  data_scadenza_saldo: string | null

  /** Somma dei `Pagamento` collegati. Derivato: non scriverlo mai a mano. */
  incassato_cents: number
  /** totale − incassato. Derivato. */
  residuo_cents: number

  data_consegna_prevista: string | null
  indirizzo_consegna: string | null
  condizioni_pagamento: string | null
  note: string | null

  stato: StatoOrdine
}

export type OrdineInput = Omit<
  Ordine,
  | keyof Tracciabile
  | keyof Importabile
  | 'numero'
  | 'imponibile_cents'
  | 'iva_cents'
  | 'totale_cents'
  | 'incassato_cents'
  | 'residuo_cents'
> & { numero?: string }

/** Percentuale di evasione dell'ordine, sulle quantità. */
export function evasioneOrdine(o: Ordine): number {
  const totale = o.righe.reduce((t, r) => t + r.quantita_milli, 0)
  if (!totale) return 0
  const evaso = o.righe.reduce((t, r) => t + Math.min(r.quantita_evasa_milli, r.quantita_milli), 0)
  return (evaso / totale) * 100
}

export function residuoRiga(r: RigaOrdine): number {
  return Math.max(0, r.quantita_milli - r.quantita_evasa_milli)
}

/** Saldo **pattuito**: quanto resterebbe da pagare dopo l'acconto concordato. */
export function saldoOrdine(o: Ordine): number {
  return o.totale_cents - o.acconto_cents
}

/**
 * Residuo **reale** da incassare: totale meno quanto è davvero entrato.
 * Diverso da `saldoOrdine`: quello è il patto, questo è la cassa.
 */
export function residuoOrdine(o: Ordine): number {
  return o.totale_cents - o.incassato_cents
}

/**
 * Vero quando del residuo di questo ordine **non sappiamo abbastanza** per
 * dichiararlo, e va scritto «—» invece di un numero.
 *
 * Può riguardare ordini chiusi per cui la sorgente non conserva un collegamento
 * ricostruibile con la fattura incassata. In tal caso mostrare l'intero ordine
 * come scoperto produrrebbe un sollecito errato.
 *
 * Un ordine **aperto** senza incassi è invece un residuo vero: quello si dice.
 */
export function residuoIncerto(o: Ordine): boolean {
  if (o.id_esterno === null) return false
  const chiuso = o.stato === 'evaso' || o.stato === 'chiuso_forzato' || o.stato === 'annullato'
  return chiuso && o.incassato_cents === 0
}

/** Un ordine è scaduto se ha ancora residuo e la data del saldo è passata. */
export function ordineScaduto(o: Ordine, oggi: string): boolean {
  if (o.stato === 'annullato') return false
  if (residuoOrdine(o) <= 0) return false
  return Boolean(o.data_scadenza_saldo) && o.data_scadenza_saldo! < oggi
}

// ===========================================================================
// DDT — documento di trasporto
// ===========================================================================

export type StatoDDT = 'bozza' | 'emesso' | 'consegnato' | 'annullato'

export const STATO_DDT_LABEL: Record<StatoDDT, string> = {
  bozza: 'Bozza',
  emesso: 'Emesso',
  consegnato: 'Consegnato',
  annullato: 'Annullato',
}

/**
 * Perché la merce sta viaggiando.
 *
 * Le ultime tre sono previste soltanto per archivi importati. Per questo
 * stanno nella union ma **non** in `CAUSALI_SELEZIONABILI`: si leggono, non si
 * scelgono. In particolare il conto vendita e il conto lavorazione sono vietati
 * dal modello nuovo (vedi CLAUDE.md, «Cosa NON fare»), e negarne l'esistenza
 * nello storico impedirebbe di mostrare documenti compatibili.
 */
export type CausaleTrasporto =
  | 'vendita'
  | 'conto_visione'
  | 'reso'
  | 'sostituzione'
  | 'campionatura'
  | 'riparazione'
  // ── solo storico ──
  | 'conto_vendita'
  | 'conto_installazione'
  | 'conto_lavorazione'

export const CAUSALE_LABEL: Record<CausaleTrasporto, string> = {
  vendita: 'Vendita',
  conto_visione: 'Conto visione',
  reso: 'Reso',
  sostituzione: 'Sostituzione',
  campionatura: 'Campionatura',
  riparazione: 'Riparazione',
  conto_vendita: 'Conto vendita',
  conto_installazione: 'Conto installazione',
  conto_lavorazione: 'Conto lavorazione',
}

/**
 * Come si legge la causale di un DDT.
 *
 * Quando manca si ripiega su quello che c'era scritto, e solo se non c'è
 * nemmeno quello si scrive «—». Un trattino al posto di una
 * dicitura che il documento porta sarebbe informazione buttata.
 */
export function etichettaCausale(d: {
  causale: CausaleTrasporto | null
  causale_dichiarata: string | null
}): string {
  if (d.causale) return CAUSALE_LABEL[d.causale]
  return d.causale_dichiarata?.trim() || '—'
}

/**
 * Le causali che si possono scegliere emettendo un DDT oggi. Le altre restano
 * leggibili sui documenti importati e non ricompaiono in nessuna select.
 */
export const CAUSALI_SELEZIONABILI: CausaleTrasporto[] = [
  'vendita',
  'conto_visione',
  'reso',
  'sostituzione',
  'campionatura',
  'riparazione',
]

export type TrasportoACura = 'mittente' | 'destinatario' | 'vettore'

export const TRASPORTO_LABEL: Record<TrasportoACura, string> = {
  mittente: 'Mittente',
  destinatario: 'Destinatario',
  vettore: 'Vettore',
}

export interface RigaDDT {
  id: ID
  /** Cosa fa questa riga. Vedi `TipoRigaDocumento` in `comuni.ts`. */
  tipo: TipoRigaDocumento
  /**
   * Nullabile perché la merce può essere descritta a mano. Solo le righe con un
   * articolo muovono il magazzino; `emettiDdt` salta le altre.
   */
  articolo_id: ID | null
  /** Da quale lotto esce fisicamente la merce: è la tracciabilità verso il cliente. */
  lotto_id: ID | null
  lotto_codice: string | null
  codice_articolo: string | null
  descrizione: string
  quantita_milli: number
  unita_misura: UnitaMisura
  prezzo_unitario_cents: number
  /**
   * Copiato dalla riga d'ordine. Senza, un DDT valorizzato stampava il prezzo
   * di listino invece di quello pattuito, e il venduto risultava più alto di
   * quanto il cliente ha effettivamente ordinato.
   */
  sconto_percentuale: number
  aliquota_iva: number
  imponibile_cents: number
  colli: number
  peso_kg_milli: number
  /** Riga d'ordine che questa consegna sta evadendo. */
  riga_ordine_id: ID | null
  note: string | null
}

export interface DDT extends Tracciabile, Importabile {
  numero: string // DDT-2026-0001
  data: string
  data_trasporto: string
  ora_trasporto: string | null

  cliente_id: ID
  cliente_nome: string
  /** L'anagrafica come era quel giorno. Vedi `IntestazioneDocumento`. */
  intestazione: IntestazioneDocumento
  ordine_id: ID | null
  ordine_numero: string | null

  /** Vedi `Ordine.agente_nome`: un nome copiato, non un collegamento. */
  agente_nome: string | null
  provvigione_cents: number

  destinazione_indirizzo: string | null
  destinazione_cap: string | null
  destinazione_citta: string | null
  destinazione_provincia: string | null
  /**
   * **Chi** riceve, quando non è il cliente che paga: cantiere, magazzino,
   * cliente del cliente. Valorizzato su 340 DDT storici su 342 — l'indirizzo di
   * destinazione da solo non bastava a dire di chi fosse.
   */
  destinatario: IntestazioneDocumento | null

  /** Null sui 4 DDT storici che non la dichiarano. */
  causale: CausaleTrasporto | null
  /**
   * La causale **come era scritta sul documento**. I 342 DDT storici portano 21
   * diciture diverse per nove significati, refusi compresi (`Sostutuzione`,
   * `Reco C/Visione`). La union serve a ragionarci, questa stringa a non perdere
   * il motivo: «Reso materiale non conforme» e «Reso per sostituzione» sono
   * entrambi `reso`, ma non sono la stessa storia.
   */
  causale_dichiarata: string | null
  trasporto_a_cura_di: TrasportoACura
  /**
   * Chi paga il trasporto. Diverso da `trasporto_a_cura_di`, che dice chi lo
   * organizza: sul documento sono due caselle distinte e lo storico le usa
   * entrambe (assegnato 166, franco 74).
   */
  porto: 'franco' | 'assegnato' | null
  vettore: string | null
  aspetto_beni: string // "Bancali", "Pacchi"
  colli_totali: number
  peso_totale_kg_milli: number
  /**
   * Colli e peso **come erano scritti**, quando non sono numeri.
   *
   * ⚠️ Non è ridondanza: i valori reali sono `SFUSI`, `TON. 9 circa`, `kg. 130`,
   * `1.746,00`. Il numero accanto serve a sommare, l'originale a non mentire —
   * `1.746,00` letto male diventa 1.746 kg invece di 1,746.
   */
  colli_dichiarati: string | null
  peso_dichiarato: string | null

  /** Se false, il PDF non stampa i prezzi (DDT non valorizzato). */
  valorizzato: boolean

  /** Ereditato dall'ordine: il DDT deve valere quanto è stato pattuito. */
  sconto_generale_percentuale: number

  righe: RigaDDT[]
  imponibile_cents: number
  iva_cents: number
  totale_cents: number

  stato: StatoDDT
  note: string | null
}

export type DDTInput = Omit<
  DDT,
  | keyof Tracciabile
  | keyof Importabile
  | 'numero'
  | 'imponibile_cents'
  | 'iva_cents'
  | 'totale_cents'
> & { numero?: string }

// ===========================================================================
// ORDINE DI ACQUISTO — da qui entrano i lotti
// ===========================================================================

export type StatoOrdineAcquisto =
  | 'bozza'
  | 'inviato'
  | 'confermato'
  | 'ricevuto_parziale'
  | 'ricevuto'
  | 'annullato'

export const STATO_ACQUISTO_LABEL: Record<StatoOrdineAcquisto, string> = {
  bozza: 'Bozza',
  inviato: 'Inviato',
  confermato: 'Confermato',
  ricevuto_parziale: 'Ricevuto parzialmente',
  ricevuto: 'Ricevuto',
  annullato: 'Annullato',
}

/**
 * Ogni riga compra un ARTICOLO preciso: `articolo_id` è obbligatorio perché
 * alla ricezione la riga deve generare un carico di magazzino, e un carico
 * senza articolo non muove nessuna giacenza — resterebbe merce che il
 * gestionale non sa di avere.
 *
 * Essenza e patina non stanno più qui: le ha già l'articolo, e la partita le
 * dichiara sul lotto. Ripeterle su tre livelli garantiva solo che prima o poi
 * si sarebbero contraddette.
 */
export interface RigaOrdineAcquisto {
  id: ID
  articolo_id: ID
  codice_articolo: string | null // snapshot
  descrizione: string // "Perlinato abete antico 20 mm — da stalla"
  quantita_milli: number
  unita_misura: UnitaMisura
  prezzo_unitario_cents: number
  aliquota_iva: number
  imponibile_cents: number
  /** Lotto generato alla ricezione. Valorizzato dalla ricezione, non a mano. */
  lotto_id: ID | null
  note: string | null
}

export interface OrdineAcquisto extends Tracciabile, Importabile {
  numero: string // ACQ-2026-0001
  data: string
  fornitore_id: ID
  fornitore_nome: string

  righe: RigaOrdineAcquisto[]
  /**
   * Il trasporto si ripartisce sulle righe in proporzione al valore e finisce
   * nel costo di carico degli articoli: è lì che deve stare, altrimenti il
   * margine risulta più alto di quello che è.
   */
  spese_trasporto_cents: number

  imponibile_cents: number
  iva_cents: number
  totale_cents: number

  data_consegna_prevista: string | null
  data_ricezione: string | null
  stato: StatoOrdineAcquisto
  note: string | null
}

export type OrdineAcquistoInput = Omit<
  OrdineAcquisto,
  | keyof Tracciabile
  | keyof Importabile
  | 'numero'
  | 'imponibile_cents'
  | 'iva_cents'
  | 'totale_cents'
> & { numero?: string }

// ===========================================================================
// SCHEDA LAVORAZIONE — la specifica d'acquisto verso il fornitore
// ===========================================================================

/**
 * Il modulo che Wood Revive compila e consegna al fornitore per dirgli COME
 * deve arrivare il materiale: essenza, range di misure, spazzolatura, stucco,
 * bordo, finitura. Ricalca il modulo cartaceo in uso (mat_cliente/).
 *
 * ⚠️ Il nome inganna, e va letto per quello che il documento è. La lavorazione
 * la esegue il FORNITORE prima della consegna: Wood Revive continua a comprare
 * materiale già lavorato e a rivenderlo com'è (vedi CLAUDE.md, «Cosa NON
 * fare»). La scheda non è un'attività interna, non è una commessa, non è una
 * fase di produzione, e NON MUOVE MAI IL MAGAZZINO: i punti che lo muovono
 * restano due. È carta che viaggia verso il fornitore, come un ordine
 * d'acquisto — solo che invece di quantità e prezzi porta specifiche.
 *
 * Non ha righe e non ha importi: è un documento piatto. Il prezzo lo farà
 * l'ordine di acquisto quando la fornitura si concretizza.
 */

/**
 * A cosa è destinato il materiale. Vocabolario PROPRIO della scheda, dal
 * modulo cartaceo: «piani» (piani di lavoro, top) non esiste in
 * `CategoriaArticolo` e non deve entrarci — qui è l'impiego dichiarato al
 * fornitore, non una categoria di catalogo.
 */
export type TipologiaScheda = 'pavimenti' | 'rivestimenti' | 'piani' | 'mobili'

export const TIPOLOGIA_SCHEDA_LABEL: Record<TipologiaScheda, string> = {
  pavimenti: 'Pavimenti',
  rivestimenti: 'Rivestimenti',
  piani: 'Piani',
  mobili: 'Mobili',
}

/** L'elenco nell'ordine del modulo cartaceo: alimenta checkbox e stampa. */
export const TIPOLOGIE_SCHEDA: TipologiaScheda[] = [
  'pavimenti',
  'rivestimenti',
  'piani',
  'mobili',
]

export type StatoScheda = 'bozza' | 'inviata' | 'chiusa' | 'annullata'

export const STATO_SCHEDA_LABEL: Record<StatoScheda, string> = {
  bozza: 'Bozza',
  inviata: 'Inviata al fornitore',
  chiusa: 'Chiusa',
  annullata: 'Annullata',
}

export interface SchedaLavorazione extends Tracciabile, Importabile {
  numero: string // SCH-2026-0001
  data: string // la DATA del modulo cartaceo

  /**
   * Il committente è un NOME COPIATO, non un collegamento: sul modulo è una
   * riga scritta a mano, e il cliente potrebbe non essere in anagrafica.
   * Niente `IntestazioneDocumento`: quello snapshot non porta il telefono,
   * che qui è l'unico recapito che conta (il fornitore chiama per chiarire).
   */
  committente: string
  telefono: string | null
  /** La CONSEGNA del modulo: quando il materiale deve arrivare. ISO. */
  data_consegna: string | null

  /**
   * Da dove è nata la precompilazione. Sono PROVENIENZA, non appartenenza:
   * la scheda resta valida anche se l'ordine o l'articolo spariscono — i
   * valori sono già stati copiati nei campi qui sotto. Per questo le elimina
   * scollegano invece di bloccare (vedi mockApi), e `ordine_numero` è uno
   * snapshot che sopravvive allo scollegamento.
   */
  ordine_id: ID | null
  ordine_numero: string | null
  articolo_id: ID | null

  /**
   * Il destinatario. Sul modulo cartaceo non c'è — si sa a chi lo si dà in
   * mano — ma nel gestionale «a quale fornitore è andata questa scheda?» è
   * la prima domanda dell'archivio. Opzionale: si può stampare anche prima
   * di aver deciso il fornitore.
   */
  fornitore_id: ID | null
  fornitore_nome: string | null // snapshot

  tipologie: TipologiaScheda[]

  // Specifiche del materiale — millimetri interi (regola 3)
  essenza: Essenza | null
  larghezza_da_mm: number | null
  larghezza_a_mm: number | null
  lunghezza_da_mm: number | null
  lunghezza_a_mm: number | null
  spessore_mm: number | null

  /**
   * Le lavorazioni richieste al fornitore: testo libero, come sul modulo.
   * Niente vocabolari finché non emergono valori ricorrenti — inventarli
   * oggi vorrebbe dire indovinare il mestiere di un altro.
   */
  spazzolatura: string | null
  stucco_colore: string | null
  bordo_frontale: string | null
  finitura: string | null

  /**
   * Quantità richiesta, opzionale: sul modulo vive nelle annotazioni
   * («100 MQ»), qui ha un campo suo. Millesimi interi (regola 2).
   */
  quantita_milli: number | null
  unita_misura: UnitaMisura | null

  annotazioni: string | null

  stato: StatoScheda
}

export type SchedaLavorazioneInput = Omit<
  SchedaLavorazione,
  keyof Tracciabile | keyof Importabile | 'numero'
> & { numero?: string }

// ===========================================================================
// Tipi di appoggio per l'interfaccia
// ===========================================================================

/** Documenti che si possono stampare: serve al selettore dei PDF. */
export type TipoDocumento = 'preventivo' | 'ordine' | 'ddt' | 'acquisto' | 'scheda'

export const PREFISSO_DOCUMENTO: Record<TipoDocumento | 'lotto', string> = {
  preventivo: 'PRV',
  ordine: 'ORD',
  ddt: 'DDT',
  acquisto: 'ACQ',
  scheda: 'SCH',
  lotto: 'LOT',
}
