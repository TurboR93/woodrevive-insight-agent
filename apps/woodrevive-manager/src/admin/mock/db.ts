/**
 * Database finto in memoria, persistito in localStorage.
 *
 * Perché scrivibile e non in sola lettura: un gestionale che non salva niente
 * non si può provare. Il committente deve poter creare un preventivo, generare
 * il DDT e vedere la giacenza scendere — è l'unico modo di capire se il modello
 * dati regge prima di costruirci sopra un backend.
 *
 * Il prezzo è che il DB del browser può invecchiare rispetto al codice: per
 * questo esiste SEED_VERSION.
 */

import type {
  Articolo,
  Cliente,
  DDT,
  Fattura,
  FatturaAcquisto,
  Fornitore,
  ID,
  Lotto,
  MovimentoMagazzino,
  Ordine,
  OrdineAcquisto,
  Pagamento,
  Preventivo,
  Scadenza,
  SchedaLavorazione,
} from '../domain'
import { chiaveGiacenza, quantitaConSegno } from '../domain'
import { comprimi, decomprimi } from './compressione'
import { costruisciSeed } from './seed'

/**
 * ⚠️ ALZALA a ogni cambio di forma dei dati (campo aggiunto, rinominato,
 * significato cambiato). Chi ha il vecchio DB in localStorage riceverebbe
 * altrimenti errori incomprensibili su campi che non esistono più.
 *
 * A 8 dalla collezione `schede_lavorazione` del 2026-08-06.
 */
export const SEED_VERSION = 8

const CHIAVE = 'woodrevive.db'

export interface Db {
  versione: number
  clienti: Cliente[]
  fornitori: Fornitore[]
  articoli: Articolo[]
  lotti: Lotto[]
  movimenti: MovimentoMagazzino[]
  preventivi: Preventivo[]
  ordini: Ordine[]
  ddt: DDT[]
  acquisti: OrdineAcquisto[]
  pagamenti: Pagamento[]
  /** Fatture di vendita: fatture, acconti e note di credito insieme. */
  fatture: Fattura[]
  /** Il registro degli acquisti: fatture fornitore e note di credito fornitore. */
  fatture_acquisto: FatturaAcquisto[]
  /** Le partite in scadenza, in entrata e in uscita. */
  scadenze: Scadenza[]
  /** Le specifiche d'acquisto verso i fornitori. Non muovono il magazzino. */
  schede_lavorazione: SchedaLavorazione[]
}

// ---------------------------------------------------------------------------
// Derivati — la giacenza non si scrive, si calcola
// ---------------------------------------------------------------------------

/**
 * Giacenza per coppia (articolo, lotto), dai soli movimenti.
 *
 * È la tracciabilità vera: non "dichiaro che quel pavimento viene dal fienile
 * di Cordignano", ma "di quell'articolo esistono N m² entrati con quella
 * partita e ne sono usciti M". Chiave `articolo|lotto` — vedi `chiaveGiacenza`.
 *
 * Ritorna sia il caricato sia il residuo: servono a due domande diverse. Il
 * residuo dice cosa si può ancora consegnare da quella partita; il caricato
 * dice cosa ne è passato, e resta > 0 anche a partita finita, che è ciò che
 * permette di rispondere al cliente cinque anni dopo.
 */
export interface GiacenzaCoppia {
  articolo_id: ID
  lotto_id: ID | null
  caricato_milli: number
  residuo_milli: number
}

export function giacenzePerCoppia(db: Db): Map<string, GiacenzaCoppia> {
  const out = new Map<string, GiacenzaCoppia>()
  for (const m of db.movimenti) {
    if (!m.articolo_id) continue
    const chiave = chiaveGiacenza(m.articolo_id, m.lotto_id)
    let voce = out.get(chiave)
    if (!voce) {
      voce = { articolo_id: m.articolo_id, lotto_id: m.lotto_id, caricato_milli: 0, residuo_milli: 0 }
      out.set(chiave, voce)
    }
    const delta = quantitaConSegno(m)
    if (delta > 0) voce.caricato_milli += delta
    voce.residuo_milli += delta
  }
  return out
}

/**
 * Ricalcola tutti i campi derivati dai fatti che li generano.
 *
 *   giacenza    ← somma dei movimenti dell'articolo
 *   impegnato   ← righe di ordini aperti, meno quanto già evaso
 *   costo medio ← media ponderata dei carichi
 *   stato lotto ← residuo della partita: a zero è esaurito
 *   evaso riga  ← somma delle righe DDT emesse che la riferiscono
 *   incassato   ← somma dei pagamenti collegati all'ordine
 *
 * Gira dopo ogni mutazione. È volutamente sprecona: con questi volumi costa
 * niente, e in cambio non esiste il caso "derivato rimasto indietro".
 */
export function ricalcolaDerivati(db: Db): void {
  // --- giacenze e costo medio ---------------------------------------------
  const perArticolo = new Map<ID, MovimentoMagazzino[]>()
  for (const m of db.movimenti) {
    if (!m.articolo_id) continue
    const lista = perArticolo.get(m.articolo_id)
    if (lista) lista.push(m)
    else perArticolo.set(m.articolo_id, [m])
  }

  for (const a of db.articoli) {
    const movimenti = (perArticolo.get(a.id) ?? []).slice().sort((x, y) =>
      x.data === y.data ? x.created_at - y.created_at : x.data.localeCompare(y.data),
    )

    let giacenza = 0
    let costoMedio = 0
    for (const m of movimenti) {
      const delta = quantitaConSegno(m)
      if (delta > 0) {
        // costo medio ponderato: ricalcolato a ogni carico
        const nuovaQta = giacenza + delta
        costoMedio =
          nuovaQta > 0
            ? Math.round((giacenza * costoMedio + delta * m.valore_unitario_cents) / nuovaQta)
            : m.valore_unitario_cents
      }
      giacenza += delta
    }
    a.giacenza_milli = giacenza
    a.costo_medio_cents = costoMedio
  }

  // --- quantità evasa delle righe d'ordine --------------------------------
  const evasoPerRiga = new Map<ID, number>()
  for (const d of db.ddt) {
    if (d.stato !== 'emesso' && d.stato !== 'consegnato') continue
    // Solo una vendita evade un ordine: un reso, una campionatura o un conto
    // visione muovono la merce ma non consegnano ciò che è stato ordinato.
    if (d.causale !== 'vendita') continue
    for (const r of d.righe) {
      if (!r.riga_ordine_id) continue
      evasoPerRiga.set(r.riga_ordine_id, (evasoPerRiga.get(r.riga_ordine_id) ?? 0) + r.quantita_milli)
    }
  }

  const impegnatoPerArticolo = new Map<ID, number>()
  for (const o of db.ordini) {
    const aperto = o.stato === 'confermato' || o.stato === 'in_preparazione' || o.stato === 'evaso_parziale'
    for (const r of o.righe) {
      r.quantita_evasa_milli = evasoPerRiga.get(r.id) ?? 0
      if (!aperto || !r.articolo_id) continue
      const residuo = Math.max(0, r.quantita_milli - r.quantita_evasa_milli)
      impegnatoPerArticolo.set(
        r.articolo_id,
        (impegnatoPerArticolo.get(r.articolo_id) ?? 0) + residuo,
      )
    }
  }

  for (const a of db.articoli) {
    a.impegnato_milli = impegnatoPerArticolo.get(a.id) ?? 0
  }

  // --- stato dei lotti ----------------------------------------------------
  // La partita non ha una quantità propria: la sua consistenza è la somma di
  // quello che è entrato con quel lotto e non è ancora uscito. Un lotto senza
  // nessun carico resta `disponibile`, non `esaurito`: è appena stato
  // registrato, non è finito — sono due cose diverse e dirle uguali farebbe
  // sparire dalle liste una partita che è in cortile.
  const perLotto = new Map<ID, { caricato: number; residuo: number }>()
  for (const voce of giacenzePerCoppia(db).values()) {
    if (!voce.lotto_id) continue
    const corrente = perLotto.get(voce.lotto_id) ?? { caricato: 0, residuo: 0 }
    corrente.caricato += voce.caricato_milli
    corrente.residuo += voce.residuo_milli
    perLotto.set(voce.lotto_id, corrente)
  }

  for (const l of db.lotti) {
    if (l.stato === 'archiviato') continue // deciso a mano, non si tocca
    const tot = perLotto.get(l.id)
    l.stato = tot && tot.caricato > 0 && tot.residuo <= 0 ? 'esaurito' : 'disponibile'
  }

  // --- incassato per ordine -----------------------------------------------
  // Due sorgenti, e sono disgiunte per costruzione: un `Pagamento` registrato nel
  // pannello punta all'ordine, una `Scadenza` importata punta alla fattura. Lo
  // Una sorgente storica può incassare contro la fattura e non contro l'ordine;
  // ignorarla mostrerebbe ogni ordine importato come non pagato.
  const incassatoPerOrdine = new Map<ID, number>()
  for (const p of db.pagamenti) {
    if (!p.ordine_id) continue
    incassatoPerOrdine.set(p.ordine_id, (incassatoPerOrdine.get(p.ordine_id) ?? 0) + p.importo_cents)
  }

  const ordineDellaFattura = new Map<ID, ID>()
  for (const f of db.fatture) {
    if (f.ordine_id) ordineDellaFattura.set(f.id, f.ordine_id)
  }
  for (const s of db.scadenze) {
    if (s.verso !== 'incasso' || !s.saldato) continue
    if (s.documento_tipo !== 'fattura') continue
    const ordineId = ordineDellaFattura.get(s.documento_id)
    if (!ordineId) continue
    incassatoPerOrdine.set(ordineId, (incassatoPerOrdine.get(ordineId) ?? 0) + s.importo_cents)
  }

  for (const o of db.ordini) {
    o.incassato_cents = incassatoPerOrdine.get(o.id) ?? 0
    o.residuo_cents = o.totale_cents - o.incassato_cents
  }
}

/**
 * Verifica l'invariante: giacenza dichiarata = somma dei movimenti.
 * Ritorna le divergenze; array vuoto significa magazzino coerente.
 *
 * Se stampa qualcosa, c'è un bug: qualcuno ha scritto `giacenza_milli` invece
 * di generare un movimento.
 */
export function verificaInvarianteGiacenze(
  db: Db,
): Array<{ articolo: string; dichiarata: number; calcolata: number }> {
  const somme = new Map<ID, number>()
  for (const m of db.movimenti) {
    if (!m.articolo_id) continue
    somme.set(m.articolo_id, (somme.get(m.articolo_id) ?? 0) + quantitaConSegno(m))
  }
  const divergenze = []
  for (const a of db.articoli) {
    const calcolata = somme.get(a.id) ?? 0
    if (a.giacenza_milli !== calcolata) {
      divergenze.push({ articolo: `${a.codice} ${a.nome}`, dichiarata: a.giacenza_milli, calcolata })
    }
  }
  return divergenze
}

/**
 * Verifica l'invariante dei lotti: da una partita non può uscire più di quanto
 * ci è entrato, articolo per articolo.
 *
 * `verificaInvarianteGiacenze` non lo prenderebbe: un DDT che scarica 60 m² di
 * perlinato dichiarando un lotto che ne conteneva 40 lascia la giacenza totale
 * dell'articolo perfettamente in ordine — è la provenienza a essere falsa, e
 * senza questo controllo la promessa commerciale del gestionale sarebbe una
 * dichiarazione non verificata.
 */
export function verificaInvarianteLotti(
  db: Db,
): Array<{ lotto: string; articolo: string; caricato: number; residuo: number }> {
  const articoli = new Map(db.articoli.map((a) => [a.id, a]))
  const lotti = new Map(db.lotti.map((l) => [l.id, l]))
  const divergenze = []
  for (const voce of giacenzePerCoppia(db).values()) {
    if (!voce.lotto_id || voce.residuo_milli >= 0) continue
    const l = lotti.get(voce.lotto_id)
    const a = articoli.get(voce.articolo_id)
    divergenze.push({
      lotto: l ? `${l.codice} ${l.descrizione}` : voce.lotto_id,
      articolo: a ? `${a.codice} ${a.nome}` : voce.articolo_id,
      caricato: voce.caricato_milli,
      residuo: voce.residuo_milli,
    })
  }
  return divergenze
}

// ---------------------------------------------------------------------------
// Persistenza
// ---------------------------------------------------------------------------

let istanza: Db | null = null
let origineCorrente: OrigineDati = 'seed'
let generatoIl: number | null = null
let sorgente: string | null = null

/** Da dove vengono i dati che si stanno guardando. */
export type OrigineDati = 'seed' | 'import'

export interface StatoDati {
  origine: OrigineDati
  versione: number
  generato_il: number | null
  sorgente: string | null
}

export function statoDati(): StatoDati {
  const d = db()
  return { origine: origineCorrente, versione: d.versione, generato_il: generatoIl, sorgente }
}

function nuovoDb(): Db {
  const db = { versione: SEED_VERSION, ...costruisciSeed() }
  ricalcolaDerivati(db)
  return db
}

/** Sotto test (Node) non c'è storage: il DB vive in memoria e basta. */
const storageDisponibile = (): boolean => typeof localStorage !== 'undefined'

/**
 * Quello che c'è in localStorage, con l'involucro che dice da dove viene.
 * Il DB nudo (senza `origine`) è il formato vecchio: si legge ancora e si
 * considera seed, così chi aggiorna il pannello non perde il lavoro in corso.
 */
interface Salvato {
  origine?: OrigineDati
  generato_il?: number | null
  sorgente?: string | null
  db?: Db
}

/**
 * Interpreta il payload già decompresso.
 *
 * Il DB nudo (senza `origine`) è il formato vecchio: si legge ancora e si
 * considera seed, così chi aggiorna il pannello non perde il lavoro in corso.
 */
function interpreta(
  testo: string,
): { db: Db; origine: OrigineDati; generato_il: number | null; sorgente: string | null } | null {
  const letto = JSON.parse(testo) as Salvato & Db
  const involucro = letto.db !== undefined
  const contenuto = involucro ? (letto.db as Db) : (letto as unknown as Db)
  const origine: OrigineDati = involucro ? (letto.origine ?? 'seed') : 'seed'

  if (contenuto.versione !== SEED_VERSION) {
    // ⚠️ La differenza che conta. Dati dimostrativi obsoleti si ributtano: si
    // rigenerano identici. Dati IMPORTATI obsoleti sono l'archivio dell'azienda,
    // e buttarli sarebbe una perdita — quindi si rifiuta di partire e si chiede
    // di rifare l'import, che è ripetibile per progetto.
    if (origine === 'import') {
      throw new ErroreDatiObsoleti(contenuto.versione, SEED_VERSION)
    }
    console.info(
      `[woodrevive] dati demo v${contenuto.versione} obsoleti (attuale v${SEED_VERSION}): rigenerati.`,
    )
    return null
  }

  return {
    db: contenuto,
    origine,
    generato_il: letto.generato_il ?? null,
    sorgente: letto.sorgente ?? null,
  }
}

function leggiDaStorage(): { db: Db; origine: OrigineDati; generato_il: number | null; sorgente: string | null } | null {
  if (!storageDisponibile()) return null
  try {
    const grezzo = localStorage.getItem(CHIAVE)
    if (!grezzo) return null
    // Un payload compresso qui non si può leggere: `decomprimi` è asincrona, e
    // chi passa da questa strada (un `db()` senza `avviaDb()` atteso) ottiene il
    // seed. È il comportamento sotto test, dove lo storage non esiste comunque.
    if (grezzo.startsWith('gz1:')) return null

    const letto = JSON.parse(grezzo) as Salvato & Db
    const involucro = letto.db !== undefined
    const contenuto = involucro ? (letto.db as Db) : (letto as unknown as Db)
    const origine: OrigineDati = involucro ? (letto.origine ?? 'seed') : 'seed'

    if (contenuto.versione !== SEED_VERSION) {
      // ⚠️ La differenza che conta. Dati dimostrativi obsoleti si ributtano: si
      // rigenerano identici. Dati IMPORTATI obsoleti sono l'archivio
      // dell'azienda, e buttarli sarebbe una perdita — quindi si rifiuta di
      // partire e si chiede di rifare l'import, che è ripetibile per progetto.
      if (origine === 'import') {
        throw new ErroreDatiObsoleti(contenuto.versione, SEED_VERSION)
      }
      console.info(
        `[woodrevive] dati demo v${contenuto.versione} obsoleti (attuale v${SEED_VERSION}): rigenerati.`,
      )
      return null
    }

    return {
      db: contenuto,
      origine,
      generato_il: letto.generato_il ?? null,
      sorgente: letto.sorgente ?? null,
    }
  } catch (e) {
    if (e instanceof ErroreDatiObsoleti) throw e
    console.warn('[woodrevive] dati demo illeggibili, rigenerati.', e)
    return null
  }
}

/**
 * I dati importati sono più vecchi del codice. Non si scartano: si chiede di
 * rifare l'import. È l'unico caso in cui il pannello si rifiuta di partire, e la
 * ragione è che l'alternativa sarebbe cancellare cinque anni di documenti.
 */
export class ErroreDatiObsoleti extends Error {
  constructor(
    readonly versioneDati: number,
    readonly versioneCodice: number,
  ) {
    super(
      `I dati importati sono alla versione ${versioneDati}, il codice alla ${versioneCodice}.`,
    )
    this.name = 'ErroreDatiObsoleti'
  }
}

/**
 * Cosa c'è di sbagliato nello storage, **senza lanciare**.
 *
 * Serve al bootstrap: `db()` lancia, e un'eccezione durante il primo render dà
 * una pagina bianca. Con questa si può guardare prima di montare, e mostrare una
 * schermata da cui l'utente possa uscire.
 */
export async function problemaStorage(): Promise<ErroreDatiObsoleti | null> {
  if (!storageDisponibile()) return null
  try {
    const grezzo = localStorage.getItem(CHIAVE)
    if (!grezzo) return null
    interpreta(await decomprimi(grezzo))
    return null
  } catch (e) {
    if (e instanceof ErroreDatiObsoleti) return e
    // illeggibile per altri motivi: `avviaDb` lo gestisce rigenerando il seed
    return null
  }
}

/**
 * Butta il contenuto dello storage.
 *
 * È l'uscita di emergenza dalla schermata di recupero, e l'unico posto in cui il
 * progetto cancella dei dati importati su richiesta esplicita di una persona.
 */
export function scartaStorage(): void {
  if (storageDisponibile()) localStorage.removeItem(CHIAVE)
  istanza = null
  origineCorrente = 'seed'
  generatoIl = null
  sorgente = null
}

/**
 * Carica il DB dallo storage, **una volta**, prima del primo render.
 *
 * È asincrona perché il payload è compresso (vedi `compressione.ts`) e
 * `DecompressionStream` è asincrona. Tenerla qui e non dentro `db()` è ciò che
 * permette a `db()` di restare sincrona, e quindi alle ~60 chiamate a `salva()`
 * dentro `mockApi` di non diventare `await`.
 *
 * Chi non la chiama non rompe niente: `db()` semina in memoria, che è il
 * comportamento sotto test.
 */
export async function avviaDb(): Promise<void> {
  if (istanza) return
  if (!storageDisponibile()) return

  const reset =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reset')
  if (reset) return

  const grezzo = localStorage.getItem(CHIAVE)
  if (!grezzo) return

  try {
    const testo = await decomprimi(grezzo)
    const salvato = interpreta(testo)
    if (!salvato) return
    istanza = salvato.db
    origineCorrente = salvato.origine
    generatoIl = salvato.generato_il
    sorgente = salvato.sorgente
  } catch (e) {
    if (e instanceof ErroreDatiObsoleti) throw e
    console.warn('[woodrevive] dati illeggibili, rigenerati.', e)
  }
}

/**
 * Che cosa `avviaDb` ha trovato in questo browser, o `null` se non c'era niente.
 *
 * ⚠️ **Non semina.** `statoDati()` chiama `db()`, che se lo storage è vuoto
 * costruisce il seed: chiamarla per decidere se scaricare l'archivio darebbe
 * sempre «ci sono già dei dati», e in produzione il pannello si aprirebbe sulla
 * demo. Qui si guarda e basta.
 */
export function identitaCaricata(): { origine: OrigineDati; generato_il: number | null } | null {
  return istanza ? { origine: origineCorrente, generato_il: generatoIl } : null
}

/** Il DB corrente. Al primo accesso lo carica o lo semina. */
export function db(): Db {
  if (istanza) return istanza

  const reset =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('reset')

  const salvato = reset ? null : leggiDaStorage()
  if (salvato) {
    istanza = salvato.db
    origineCorrente = salvato.origine
    generatoIl = salvato.generato_il
    sorgente = salvato.sorgente
  } else {
    istanza = nuovoDb()
    origineCorrente = 'seed'
    generatoIl = null
    sorgente = null
  }
  if (reset) salva()
  return istanza
}

/**
 * Sostituisce tutto il contenuto con una busta prodotta dall'import.
 *
 * ⚠️ Rifiuta se nel pannello esistono documenti nati qui (`id_esterno === null`):
 * sarebbero cancellati senza rimedio. Il passaggio dal vecchio gestionale deve
 * essere un taglio secco — si importa, e *poi* si comincia a inserire — e questa
 * guardia è ciò che lo rende difficile da sbagliare. `forza` esiste per il caso
 * in cui si sappia cosa si sta buttando.
 */
export function caricaBusta(
  busta: { versione: number; origine: OrigineDati; generato_il: number; sorgente: string | null; db: Db },
  forza = false,
): void {
  if (busta.versione !== SEED_VERSION) {
    throw new ErroreDatiObsoleti(busta.versione, SEED_VERSION)
  }

  if (!forza && istanza) {
    const nostri = [
      ...istanza.preventivi,
      ...istanza.ordini,
      ...istanza.ddt,
      ...istanza.acquisti,
    ].filter((x) => x.id_esterno === null)
    // Il seed dimostrativo è fatto tutto di record senza origine, quindi la
    // guardia scatterebbe sempre: si applica solo a dati già importati, dove un
    // documento senza origine è davvero stato scritto da una persona.
    if (origineCorrente === 'import' && nostri.length) {
      throw new Error(
        `Ci sono ${nostri.length} documenti creati in questo gestionale che non arrivano ` +
          'dall’import: caricare un nuovo file li cancellerebbe. Esportali prima, ' +
          'oppure conferma di volerli sostituire.',
      )
    }
  }

  istanza = busta.db
  origineCorrente = busta.origine
  generatoIl = busta.generato_il
  sorgente = busta.sorgente
  salva()
}

/**
 * Chi vuole sapere che il salvataggio è fallito.
 *
 * Serve perché `salva()` è sincrona e ha una sessantina di chiamanti: renderla
 * asincrona per propagare l'errore vorrebbe dire cambiare sessanta firme. Con i
 * dati dimostrativi un salvataggio fallito è un fastidio; con l'archivio vero è
 * una perdita, e l'utente deve vederlo — non trovarlo in console.
 */
type Ascoltatore = (errore: Error) => void
const ascoltatori = new Set<Ascoltatore>()

export function seLaPersistenzaFallisce(a: Ascoltatore): () => void {
  ascoltatori.add(a)
  return () => ascoltatori.delete(a)
}

/**
 * Scrittura in differita.
 *
 * Comprimere è asincrono, `salva()` non lo è. Invece di rendere `await` una
 * sessantina di chiamate dentro `mockApi`, si accoda: la mutazione risponde
 * subito, la scrittura parte sul microtask successivo. Una raffica di mutazioni
 * produce **una** scrittura, non una per chiamata — che con 2,7 MB da comprimere
 * è la differenza fra un pannello reattivo e uno che si inchioda.
 *
 * ⚠️ La nota che questo comporta: una scrittura fallita si scopre **dopo** che la
 * mutazione ha già risposto. Per questo esiste `seLaPersistenzaFallisce`, e per
 * questo il banner che ne nasce è bloccante.
 */
let scritturaProgrammata = false

function programmaScrittura(): void {
  if (!storageDisponibile() || scritturaProgrammata) return
  scritturaProgrammata = true
  void Promise.resolve().then(async () => {
    scritturaProgrammata = false
    if (!istanza) return
    const testo = JSON.stringify({
      origine: origineCorrente,
      generato_il: generatoIl,
      sorgente,
      db: istanza,
    })
    try {
      localStorage.setItem(CHIAVE, await comprimi(testo))
    } catch (e) {
      const errore =
        e instanceof Error ? e : new Error('Impossibile salvare: lo spazio del browser è esaurito.')
      console.error('[woodrevive] salvataggio fallito.', e)
      for (const a of ascoltatori) a(errore)
    }
  })
}

/** Persiste e ricalcola. Da chiamare dopo ogni mutazione. */
export function salva(): void {
  if (!istanza) return
  ricalcolaDerivati(istanza)
  programmaScrittura()

  if (import.meta.env.DEV) {
    const divergenze = verificaInvarianteGiacenze(istanza)
    if (divergenze.length) {
      console.error('[woodrevive] invariante giacenze violato:', divergenze)
    }
    const perLotto = verificaInvarianteLotti(istanza)
    if (perLotto.length) {
      console.error('[woodrevive] invariante lotti violato:', perLotto)
    }
  }
}

/** Ributta il seed originale. Usato da Impostazioni e da ?reset=1. */
export function ripristinaSeed(): void {
  istanza = nuovoDb()
  origineCorrente = 'seed'
  generatoIl = null
  sorgente = null
  salva()
}

/** Esporta il DB per ispezionarlo o allegarlo a una segnalazione. */
export function esportaDb(): Db {
  return JSON.parse(JSON.stringify(db()))
}

export const ora = (): number => Date.now()
