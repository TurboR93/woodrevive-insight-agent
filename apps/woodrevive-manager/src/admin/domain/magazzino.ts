/**
 * Magazzino — il cuore del gestionale.
 *
 * Wood Revive **compra e rivende** legno antico di recupero già lavorato:
 * tavole, perlinati, lamelle, pannelli, travature e prodotti finiti che
 * arrivano pronti da segherie, recuperanti, demolitori e commercianti. Non
 * esegue lavorazioni, non esegue trattamenti, non esegue posa in opera.
 *
 * Il magazzino ha quindi due livelli soli, e sono paralleli, non in cascata:
 *
 *   ARTICOLO      cosa si vende: "Perlinato abete antico 20 mm", 195 m²
 *      │
 *      │  movimenti di magazzino (carichi, scarichi, rettifiche)
 *      ▼
 *   GIACENZA      derivata, mai scritta a mano
 *
 *   LOTTO         la PARTITA D'ACQUISTO: da dove viene quel materiale
 *                 es. "Fienile di Cordignano, 1890" — abete prima patina
 *
 * Il lotto non è una fase della filiera: è la provenienza. Ogni movimento di
 * carico porta articolo_id **e** lotto_id insieme, quindi la giacenza si può
 * leggere per coppia (articolo, lotto). È ciò che rende la tracciabilità un
 * fatto verificabile e non una dichiarazione: la riga di DDT indica il lotto,
 * e si controlla che di quell'articolo esistano davvero N unità di quel lotto.
 * Un cliente che fra cinque anni chiede da dove viene il suo pavimento ottiene
 * risposta.
 *
 * L'invariante che regge tutto:
 *   articolo.giacenza_milli === Σ(movimenti dell'articolo, con segno)
 * Se non torna, c'è un bug: qualcuno ha scritto la giacenza direttamente invece
 * di generare un movimento. Vedi `verificaInvarianteGiacenze` in mock/db.ts.
 */

import type { Essenza, ID, Importabile, Patina, Qualita, Tracciabile, UnitaMisura } from './comuni'

// ===========================================================================
// LOTTO — la partita d'acquisto
// ===========================================================================

/**
 * `disponibile` ed `esaurito` sono DERIVATI dai movimenti: un lotto è esaurito
 * quando di tutto ciò che è entrato con quella partita non resta più niente.
 * `archiviato` è l'unico stato che si decide a mano, per togliere dalle liste
 * una partita vecchia senza cancellarne la storia.
 */
export type StatoLotto = 'disponibile' | 'esaurito' | 'archiviato'

export const STATO_LOTTO_LABEL: Record<StatoLotto, string> = {
  disponibile: 'Disponibile',
  esaurito: 'Esaurito',
  archiviato: 'Archiviato',
}

export interface Lotto extends Tracciabile, Importabile {
  codice: string // LOT-2026-0001
  descrizione: string // "Fienile Cordignano"

  fornitore_id: ID | null
  ordine_acquisto_id: ID | null

  // Provenienza — è il valore aggiunto del legno antico: va raccontata al
  // cliente, e finisce stampata sulla scheda lotto allegata alla fornitura.
  provenienza_edificio: string | null // "Fienile ottocentesco"
  provenienza_localita: string | null
  provenienza_provincia: string | null
  anno_costruzione_stimato: number | null
  /** Data in cui la partita è entrata in magazzino. */
  data_acquisto: string

  essenza: Essenza
  patina: Patina
  qualita: Qualita

  /** Costo della partita, quota di trasporto ripartita compresa. */
  costo_acquisto_cents: number

  ubicazione: string | null // "Capannone A — campata 3"
  stato: StatoLotto
  note_storiche: string | null // la storia da raccontare al cliente
  note: string | null
  foto: string[]
}

export type LottoInput = Omit<Lotto, keyof Tracciabile | keyof Importabile | 'codice'> & {
  codice?: string
}

// ===========================================================================
// ARTICOLO — cosa si vende
// ===========================================================================

/**
 * In quale forma il materiale si compra e si rivende. Non è una filiera
 * interna: è una classificazione commerciale del catalogo.
 */
export type Stadio = 'grezzo' | 'semilavorato' | 'finito'

export const STADIO_LABEL: Record<Stadio, string> = {
  grezzo: 'Grezzo',
  semilavorato: 'Semilavorato',
  finito: 'Prodotto finito',
}

/** Le famiglie di prodotto di Wood Revive, dal sito. */
export type CategoriaArticolo =
  | 'tavola'
  | 'perlinato'
  | 'pannello'
  | 'lamella'
  | 'travatura'
  | 'pavimento'
  | 'rivestimento'
  | 'mobile'

export const CATEGORIA_LABEL: Record<CategoriaArticolo, string> = {
  tavola: 'Tavole',
  perlinato: 'Perlinati',
  pannello: 'Pannelli',
  lamella: 'Lamelle',
  travatura: 'Travature',
  pavimento: 'Pavimenti',
  rivestimento: 'Rivestimenti',
  mobile: 'Mobili e arredi',
}

/**
 * Che cosa è la voce a catalogo.
 *
 * Wood Revive vende legno, e **subappalta** la posa e il trasporto: li vende e li
 * fattura, li esegue un posatore o un vettore terzo. Sono quindi righe di
 * documento a tutti gli effetti — negarne l'esistenza significherebbe non poter
 * emettere le fatture che l'azienda emette già oggi — ma non sono attività
 * interne, non sono fasi di produzione e non sono commesse.
 *
 *   merce          → legno. È l'UNICA natura che entra in magazzino, che ha una
 *                    giacenza, un costo medio, una partita di provenienza e un
 *                    margine. Tutto il resto del modello parla di questa.
 *   servizio_terzi → prestazione subappaltata e rifatturata: posa in opera,
 *                    lavorazione conto terzi.
 *   spesa          → trasporto, imballo, bolli.
 *
 * ⚠️ La regola che il codice fa rispettare: **solo `merce` movimenta il
 * magazzino.** La guardia sta in `mockApi.ricevalAcquisto` (400 se una riga
 * d'acquisto non è merce) e due test in `seed.test.ts` la verificano sui
 * movimenti. Vedi CLAUDE.md §Cosa NON fare e docs/dominio-legno.md §9.
 */
export type NaturaArticolo = 'merce' | 'servizio_terzi' | 'spesa'

export const NATURA_ARTICOLO_LABEL: Record<NaturaArticolo, string> = {
  merce: 'Merce',
  servizio_terzi: 'Servizio di terzi',
  spesa: 'Spesa da riaddebitare',
}

export interface Articolo extends Tracciabile, Importabile {
  codice: string // ART-0001
  nome: string
  descrizione: string | null

  /** Solo `merce` entra in magazzino. Vedi `NaturaArticolo`. */
  natura: NaturaArticolo
  /**
   * Se questa voce tiene una giacenza. Falso per i servizi e le spese, ma anche
   * per la merce che si compra su ordinazione e non si stocca mai.
   */
  gestione_magazzino: boolean

  stadio: Stadio
  categoria: CategoriaArticolo
  essenza: Essenza | null
  patina: Patina | null

  spessore_mm: number | null
  larghezza_min_mm: number | null
  larghezza_max_mm: number | null
  lunghezza_min_mm: number | null
  lunghezza_max_mm: number | null

  unita_misura: UnitaMisura

  /**
   * Metri cubi per unità di misura. Il legno antico si compra spesso a metri
   * cubi e si rivende a metri quadri: senza questo ponte non si confronta il
   * prezzo di un fornitore con il proprio listino.
   * Una tavola da 30 mm venduta a m² "pesa" 0,030 m³ per ogni m².
   */
  mc_per_unita_milli: number | null

  /** Prezzo di riferimento del fornitore: quanto costa comprarlo, IVA esclusa. */
  prezzo_acquisto_cents: number
  prezzo_listino_cents: number
  aliquota_iva: number

  /** Costo medio ponderato, aggiornato a ogni carico. Derivato. */
  costo_medio_cents: number
  /** Somma dei movimenti. Derivato: non scriverlo mai a mano. */
  giacenza_milli: number
  /** Quantità promessa da ordini confermati e non ancora consegnata. Derivato. */
  impegnato_milli: number
  scorta_minima_milli: number

  ubicazione: string | null
  attivo: boolean
  note: string | null
}

export type ArticoloInput = Omit<
  Articolo,
  | keyof Tracciabile
  | keyof Importabile
  | 'codice'
  | 'giacenza_milli'
  | 'impegnato_milli'
  | 'costo_medio_cents'
> & {
  codice?: string
}

/** Quantità realmente vendibile. */
export function disponibile(a: Articolo): number {
  return a.giacenza_milli - a.impegnato_milli
}

export function sottoScorta(a: Articolo): boolean {
  return a.scorta_minima_milli > 0 && disponibile(a) < a.scorta_minima_milli
}

/** Valore di magazzino dell'articolo, a costo medio. */
export function valoreGiacenza(a: Articolo): number {
  return Math.round((a.giacenza_milli * a.costo_medio_cents) / 1000)
}

// ---------------------------------------------------------------------------
// Margine e ricarico — i numeri di chi compra e rivende
// ---------------------------------------------------------------------------

/**
 * Costo a cui confrontare il prezzo di vendita.
 *
 * Si preferisce il costo medio, che è un fatto: è la media ponderata di quello
 * che si è davvero pagato. Se l'articolo non è mai stato caricato (arredo su
 * richiesta, novità di catalogo) si ripiega sul prezzo di acquisto di
 * riferimento, che è una previsione ma è meglio di niente.
 * Zero significa "non lo so": chi legge deve ottenere `null`, non `0`.
 */
export function costoRiferimentoCents(a: Articolo): number {
  return a.costo_medio_cents || a.prezzo_acquisto_cents || 0
}

/**
 * Margine unitario in centesimi: prezzo di listino meno costo.
 * `null` se il costo non è noto — un margine di 0 e un margine sconosciuto
 * sono cose diverse, e mostrarli uguali fa prendere decisioni sbagliate.
 */
export function margineCents(a: Articolo): number | null {
  const costo = costoRiferimentoCents(a)
  if (!costo) return null
  return a.prezzo_listino_cents - costo
}

/** Margine in percentuale **sul prezzo di vendita**. Null se il costo è zero. */
export function marginePercentualeArticolo(a: Articolo): number | null {
  const costo = costoRiferimentoCents(a)
  if (!costo || !a.prezzo_listino_cents) return null
  return ((a.prezzo_listino_cents - costo) / a.prezzo_listino_cents) * 100
}

/**
 * Ricarico in percentuale **sul costo**: quanto si aggiunge a quello che si è
 * pagato. Non è il margine, ed è il numero con cui si tratta con il fornitore.
 * Su 100 € di costo e 160 € di prezzo: margine 37,5%, ricarico 60%.
 */
export function ricaricoPercentuale(a: Articolo): number | null {
  const costo = costoRiferimentoCents(a)
  if (!costo) return null
  return ((a.prezzo_listino_cents - costo) / costo) * 100
}

// ===========================================================================
// MOVIMENTO DI MAGAZZINO — il libro giornale
// ===========================================================================

export type TipoMovimento = 'carico' | 'scarico' | 'rettifica'

export const TIPO_MOVIMENTO_LABEL: Record<TipoMovimento, string> = {
  carico: 'Carico',
  scarico: 'Scarico',
  rettifica: 'Rettifica',
}

/** Da dove nasce il movimento. Serve a risalire sempre al documento. */
export type OrigineMovimento =
  | 'acquisto' // ricezione di un ordine di acquisto
  | 'ddt' // uscita per consegna al cliente
  | 'inventario' // rettifica dopo conta fisica
  | 'reso' // rientro da cliente
  | 'scarto' // materiale deperito in magazzino: rotto, bagnato, inservibile
  /**
   * Merce che c'era già quando è cominciato l'archivio importato.
   *
   * Non è un `acquisto` — non esiste un ordine né un fornitore da cui farla
   * arrivare — e non è un `inventario`, perché nessuno è andato a contarla. È
   * la quantità che i documenti storici dimostrano essere uscita, riconosciuta
   * come entrata prima del primo di quei documenti. Vedi
   * `docs/modello-dati.md` §4.5.
   */
  | 'storico'

export const ORIGINE_LABEL: Record<OrigineMovimento, string> = {
  acquisto: 'Acquisto',
  ddt: 'Consegna (DDT)',
  inventario: 'Rettifica inventario',
  reso: 'Reso da cliente',
  scarto: 'Scarto di magazzino',
  storico: 'Giacenza d’apertura (vecchio gestionale)',
}

export interface MovimentoMagazzino extends Tracciabile, Importabile {
  data: string
  tipo: TipoMovimento
  origine: OrigineMovimento

  articolo_id: ID | null
  /**
   * Partita d'acquisto da cui la merce entra o esce. Insieme ad `articolo_id`
   * è la coppia su cui si calcola la giacenza tracciata.
   */
  lotto_id: ID | null

  /**
   * Sempre positiva: il segno lo dà `tipo`. Una rettifica può però essere
   * negativa, ed è l'unico caso in cui il valore è firmato — vedi `segno()`.
   */
  quantita_milli: number
  unita_misura: UnitaMisura

  valore_unitario_cents: number
  valore_totale_cents: number

  documento_tipo: 'ordine_acquisto' | 'ddt' | 'rettifica' | null
  documento_id: ID | null
  documento_numero: string | null

  causale: string
  note: string | null
}

export type MovimentoInput = Omit<MovimentoMagazzino, keyof Tracciabile | keyof Importabile>

/** Quantità con segno, per sommare la giacenza. */
export function quantitaConSegno(m: MovimentoMagazzino): number {
  if (m.tipo === 'carico') return m.quantita_milli
  if (m.tipo === 'scarico') return -m.quantita_milli
  return m.quantita_milli // la rettifica porta già il proprio segno
}

/**
 * Chiave della giacenza tracciata: la coppia (articolo, lotto).
 * I movimenti senza lotto — inventario iniziale, rettifiche — finiscono nella
 * chiave con lotto vuoto: sono merce reale, ma senza provenienza dichiarata.
 */
export function chiaveGiacenza(articoloId: ID, lottoId: ID | null): string {
  return `${articoloId}|${lottoId ?? ''}`
}

/**
 * Una partita con residuo, come la restituisce `api.lottiDisponibiliPerArticolo`.
 *
 * Il tipo vive qui e non in `mock/` perché `proponiLottoFifo` è dominio e non
 * deve conoscere il layer dati: riceve l'array in ingresso e basta.
 */
export interface VoceLottoDisponibile {
  lotto_id: ID
  codice: string
  descrizione: string
  provenienza: string | null
  /** Data di acquisto della partita: è l'ordinamento su cui poggia il FIFO. */
  data_acquisto?: string
  residuo_milli: number
}

/**
 * La partita da proporre per uno scarico: **la più vecchia che basta a coprire
 * la quantità richiesta**.
 *
 * Perché è una regola di dominio e non una comodità dell'interfaccia: decide da
 * quale catasta esce il materiale, quindi decide la provenienza che finirà
 * scritta sul DDT e nel movimento di magazzino. La tracciabilità è la promessa
 * su cui questo gestionale esiste — chi sceglie il lotto sta rispondendo alla
 * domanda «da dove viene questo legno».
 *
 * Si aspetta `disponibili` **già ordinato dalla partita più vecchia**, come lo
 * restituisce `api.lottiDisponibiliPerArticolo`: la regola è «la prima che ci
 * sta». Non ordina da sé perché a parità di data l'ordine della sorgente è
 * l'unica verità disponibile, e riordinare qui la perderebbe.
 *
 * Restituisce `null` quando nessuna partita da sola copre la quantità: in quel
 * caso la riga va divisa o la partita scelta a mano. Non ripiega sulla più
 * capiente — proporre una partita che non basta significherebbe far scoprire
 * l'errore solo all'emissione del DDT.
 *
 * Con quantità nulla o negativa non c'è niente da coprire: propone la prima
 * partita disponibile, così una riga ancora da quantificare mostra comunque una
 * provenienza sensata.
 */
export function proponiLottoFifo<T extends { residuo_milli: number }>(
  disponibili: T[],
  quantitaMilli: number,
): T | null {
  if (quantitaMilli <= 0) return disponibili[0] ?? null
  return disponibili.find((l) => l.residuo_milli >= quantitaMilli) ?? null
}
