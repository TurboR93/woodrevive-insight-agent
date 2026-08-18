/**
 * Implementazione mock dell'API.
 *
 * **Questo file è la specifica del backend futuro.** Le validazioni, le
 * transizioni di stato, gli effetti sul magazzino e le guardie anti-orfano che
 * stanno qui sono esattamente quelle che dovrà avere il server. Chi scriverà
 * il backend legge questo file, non deve inventarsi le regole.
 *
 * Ciò che qui è una funzione, là sarà una transazione: i due punti che muovono
 * il magazzino (ricezione dell'acquisto, emissione del DDT) devono essere
 * atomici. Vedi docs/roadmap-db.md.
 */

import {
  ErroreApi,
  type Articolo,
  type ArticoloInput,
  type Cliente,
  type ClienteInput,
  type ClienteConTotali,
  type DDT,
  type Fornitore,
  type FornitoreInput,
  type FornitoreConTotali,
  type ID,
  type Lotto,
  type LottoInput,
  type MezzoPagamento,
  type MovimentoMagazzino,
  type Ordine,
  type OrdineAcquisto,
  type Pagamento,
  type PagamentoInput,
  type Preventivo,
  type Scadenza,
  type SchedaLavorazione,
  type SchedaLavorazioneInput,
  type StatoDDT,
  type StatoOrdine,
  type StatoPreventivo,
  type StatoScheda,
  type UnitaMisura,
  type VoceScadenzario,
  TRANSIZIONI_DDT,
  TRANSIZIONI_ORDINE,
  TRANSIZIONI_PREVENTIVO,
  TRANSIZIONI_SCHEDA,
  chiaveGiacenza,
  eStorico,
  giorniDiRitardo,
  intestazioneDa,
  naturaFiscaleDa,
  transizioneAmmessa,
} from '../domain'
import { aggiungiGiorni, giorniTra, oggiISO } from '../lib/format'
import { imponibileRiga, ripartisci, totaliDocumento } from '../lib/money'
import { nuovoId, prossimoCodice, prossimoNumero } from '../lib/id'
import { verificaBusta, type Busta } from './busta'
import {
  caricaBusta,
  db,
  esportaDb,
  giacenzePerCoppia,
  ripristinaSeed,
  salva,
  statoDati,
  type StatoDati,
} from './db'

// ---------------------------------------------------------------------------
// Utilità comuni
// ---------------------------------------------------------------------------

const adesso = () => Date.now()

/** Copia difensiva: chi legge non deve poter mutare il DB per sbaglio. */
const fuori = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

function trova<T extends { id: ID }>(collezione: T[], id: ID, cosa: string): T {
  const t = collezione.find((x) => x.id === id)
  if (!t) throw new ErroreApi(404, `${cosa} non trovato.`)
  return t
}

function testo(...valori: Array<string | null | undefined>): string {
  return valori.filter(Boolean).join(' ').toLowerCase()
}

interface FiltriBase {
  q?: string
  stato?: string
  dal?: string
  al?: string
  limite?: number
}

function applicaFiltri<T extends { stato?: string; data?: string }>(
  righe: T[],
  filtri: FiltriBase | undefined,
  cercaIn: (r: T) => string,
): T[] {
  let out = righe
  const f = filtri ?? {}
  if (f.q) {
    const q = f.q.trim().toLowerCase()
    out = out.filter((r) => cercaIn(r).includes(q))
  }
  if (f.stato) out = out.filter((r) => r.stato === f.stato)
  if (f.dal) out = out.filter((r) => !r.data || r.data >= f.dal!)
  if (f.al) out = out.filter((r) => !r.data || r.data <= f.al!)
  if (f.limite) out = out.slice(0, f.limite)
  return out
}

const perDataDesc = <T extends { data: string; created_at: number }>(a: T, b: T) =>
  a.data === b.data ? b.created_at - a.created_at : b.data.localeCompare(a.data)

/** Conta i riferimenti a un record e produce il messaggio della guardia. */
function bloccaSeReferenziato(descrizioni: string[], suggerimento?: string): void {
  if (!descrizioni.length) return
  const elenco = descrizioni.join(', ')
  throw new ErroreApi(
    409,
    `Non eliminabile: ${elenco}.${suggerimento ? ` ${suggerimento}` : ''}`,
  )
}

function plurale(n: number, singolare: string, plurale_: string): string {
  return `${n} ${n === 1 ? singolare : plurale_}`
}

// ---------------------------------------------------------------------------
// Movimenti di magazzino — l'unico modo di muovere la giacenza
// ---------------------------------------------------------------------------

function creaMovimento(
  m: Omit<MovimentoMagazzino, 'id' | 'created_at' | 'updated_at' | 'id_esterno'>,
): MovimentoMagazzino {
  const mov: MovimentoMagazzino = {
    ...m,
    id: nuovoId(),
    // nato qui, non importato: vedi `Importabile` in domain/comuni.ts
    id_esterno: null,
    created_at: adesso(),
    updated_at: adesso(),
  }
  db().movimenti.push(mov)
  return mov
}

/**
 * Quanto resta di un articolo proveniente da una partita precisa.
 * È la funzione su cui poggia tutta la tracciabilità: la usano il selettore di
 * lotto del DDT, la scheda lotto e la guardia dell'emissione.
 */
function residuoCoppia(articoloId: ID, lottoId: ID | null): number {
  const voce = giacenzePerCoppia(db()).get(chiaveGiacenza(articoloId, lottoId))
  return voce?.residuo_milli ?? 0
}

// ===========================================================================
// API
// ===========================================================================

export const mockApi = {
  // -------------------------------------------------------------------- meta
  async esporta(): Promise<unknown> {
    return esportaDb()
  },

  async ripristina(): Promise<void> {
    ripristinaSeed()
  },

  /** Da dove vengono i dati che si stanno guardando: seed dimostrativo o import. */
  async statoDati(): Promise<StatoDati> {
    return statoDati()
  },

  /**
   * Carica una busta prodotta da `npm run import`.
   *
   * Valida il file prima di toccare qualsiasi cosa: un JSON caricato a mano può
   * essere qualunque cosa, e un errore leggibile vale più di una schermata bianca.
   */
  async importa(grezzo: unknown, forza = false): Promise<StatoDati> {
    const esito = verificaBusta(grezzo)
    if ('errore' in esito) throw new ErroreApi(400, esito.errore)

    const b: Busta = esito.busta
    if (b.origine !== 'import') {
      throw new ErroreApi(
        400,
        'Questo file contiene dati dimostrativi, non un import. Per tornare alla demo usa «Ripristina».',
      )
    }

    try {
      caricaBusta({ ...b, generato_il: b.generato_il ?? 0 }, forza)
    } catch (e) {
      throw new ErroreApi(409, e instanceof Error ? e.message : 'Caricamento non riuscito.')
    }
    return statoDati()
  },

  // ----------------------------------------------------------------- clienti
  async listaClienti(filtri?: FiltriBase & { tipo?: string; canale?: string }): Promise<ClienteConTotali[]> {
    const d = db()
    let out = d.clienti
    if (filtri?.q) {
      const q = filtri.q.toLowerCase()
      out = out.filter((c) =>
        testo(c.ragione_sociale, c.codice, c.citta, c.email, c.piva, c.codice_fiscale, c.referente).includes(q),
      )
    }
    if (filtri?.tipo) out = out.filter((c) => c.tipo === filtri.tipo)
    if (filtri?.canale) out = out.filter((c) => c.canale === filtri.canale)

    return fuori(
      out
        .map((c) => arricchisciCliente(c))
        .sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale)),
    )
  },

  async cliente(id: ID): Promise<ClienteConTotali> {
    return fuori(arricchisciCliente(trova(db().clienti, id, 'Cliente')))
  },

  async creaCliente(input: ClienteInput): Promise<Cliente> {
    const d = db()
    validaCliente(input)
    const c: Cliente = {
      ...input,
      id: nuovoId(),
      id_esterno: null,
      natura_fiscale: naturaFiscaleDa(input.piva, input.codice_fiscale),
      codice: input.codice || prossimoCodice('CLI', d.clienti.map((x) => x.codice)),
      created_at: adesso(),
      updated_at: adesso(),
    }
    d.clienti.push(c)
    salva()
    return fuori(c)
  },

  async aggiornaCliente(id: ID, input: ClienteInput): Promise<Cliente> {
    const c = trova(db().clienti, id, 'Cliente')
    validaCliente(input)
    Object.assign(c, input, { id: c.id, codice: c.codice, updated_at: adesso() })
    salva()
    return fuori(c)
  },

  async eliminaCliente(id: ID): Promise<void> {
    const d = db()
    const c = trova(d.clienti, id, 'Cliente')
    const rif: string[] = []
    const p = d.preventivi.filter((x) => x.cliente_id === id).length
    const o = d.ordini.filter((x) => x.cliente_id === id).length
    const t = d.ddt.filter((x) => x.cliente_id === id).length
    // Gli incassi non si cancellano insieme all'anagrafica: sono movimenti di
    // denaro, e devono restare riconciliabili con l'estratto conto.
    const inc = d.pagamenti.filter((x) => x.cliente_id === id).length
    if (p) rif.push(plurale(p, 'preventivo collegato', 'preventivi collegati'))
    if (o) rif.push(plurale(o, 'ordine collegato', 'ordini collegati'))
    if (t) rif.push(plurale(t, 'DDT collegato', 'DDT collegati'))
    if (inc) rif.push(plurale(inc, 'pagamento registrato', 'pagamenti registrati'))
    bloccaSeReferenziato(rif, 'Disattivalo invece di eliminarlo.')
    d.clienti.splice(d.clienti.indexOf(c), 1)
    salva()
  },

  // --------------------------------------------------------------- fornitori
  async listaFornitori(filtri?: FiltriBase & { tipo?: string }): Promise<FornitoreConTotali[]> {
    const d = db()
    let out = d.fornitori
    if (filtri?.q) {
      const q = filtri.q.toLowerCase()
      out = out.filter((f) => testo(f.ragione_sociale, f.codice, f.citta, f.email, f.piva).includes(q))
    }
    if (filtri?.tipo) out = out.filter((f) => f.tipo === filtri.tipo)
    return fuori(
      out
        .map((f) => arricchisciFornitore(f))
        .sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale)),
    )
  },

  async fornitore(id: ID): Promise<FornitoreConTotali> {
    return fuori(arricchisciFornitore(trova(db().fornitori, id, 'Fornitore')))
  },

  async creaFornitore(input: FornitoreInput): Promise<Fornitore> {
    const d = db()
    if (!input.ragione_sociale?.trim()) throw new ErroreApi(400, 'La ragione sociale è obbligatoria.')
    const f: Fornitore = {
      ...input,
      id: nuovoId(),
      id_esterno: null,
      natura_fiscale: naturaFiscaleDa(input.piva, input.codice_fiscale),
      codice: input.codice || prossimoCodice('FOR', d.fornitori.map((x) => x.codice)),
      created_at: adesso(),
      updated_at: adesso(),
    }
    d.fornitori.push(f)
    salva()
    return fuori(f)
  },

  async aggiornaFornitore(id: ID, input: FornitoreInput): Promise<Fornitore> {
    const f = trova(db().fornitori, id, 'Fornitore')
    if (!input.ragione_sociale?.trim()) throw new ErroreApi(400, 'La ragione sociale è obbligatoria.')
    Object.assign(f, input, { id: f.id, codice: f.codice, updated_at: adesso() })
    salva()
    return fuori(f)
  },

  async eliminaFornitore(id: ID): Promise<void> {
    const d = db()
    const f = trova(d.fornitori, id, 'Fornitore')
    const rif: string[] = []
    const l = d.lotti.filter((x) => x.fornitore_id === id).length
    const a = d.acquisti.filter((x) => x.fornitore_id === id).length
    const s = d.schede_lavorazione.filter((x) => x.fornitore_id === id).length
    if (l) rif.push(plurale(l, 'lotto conferito', 'lotti conferiti'))
    if (a) rif.push(plurale(a, 'ordine di acquisto', 'ordini di acquisto'))
    if (s) rif.push(plurale(s, 'scheda di lavorazione', 'schede di lavorazione'))
    bloccaSeReferenziato(rif, 'Disattivalo invece di eliminarlo.')
    d.fornitori.splice(d.fornitori.indexOf(f), 1)
    salva()
  },

  // ---------------------------------------------------------------- articoli
  async listaArticoli(filtri?: {
    q?: string
    stadio?: string
    categoria?: string
    essenza?: string
    soloSottoScorta?: boolean
    soloAttivi?: boolean
  }): Promise<Articolo[]> {
    const d = db()
    let out = d.articoli
    if (filtri?.q) {
      const q = filtri.q.toLowerCase()
      out = out.filter((a) => testo(a.nome, a.codice, a.descrizione, a.ubicazione).includes(q))
    }
    if (filtri?.stadio) out = out.filter((a) => a.stadio === filtri.stadio)
    if (filtri?.categoria) out = out.filter((a) => a.categoria === filtri.categoria)
    if (filtri?.essenza) out = out.filter((a) => a.essenza === filtri.essenza)
    if (filtri?.soloAttivi) out = out.filter((a) => a.attivo)
    if (filtri?.soloSottoScorta) {
      out = out.filter(
        (a) => a.scorta_minima_milli > 0 && a.giacenza_milli - a.impegnato_milli < a.scorta_minima_milli,
      )
    }
    return fuori(out.slice().sort((a, b) => a.codice.localeCompare(b.codice)))
  },

  async articolo(id: ID): Promise<Articolo> {
    return fuori(trova(db().articoli, id, 'Articolo'))
  },

  async creaArticolo(input: ArticoloInput): Promise<Articolo> {
    const d = db()
    if (!input.nome?.trim()) throw new ErroreApi(400, 'Il nome dell’articolo è obbligatorio.')
    const a: Articolo = {
      ...input,
      id: nuovoId(),
      id_esterno: null,
      codice: input.codice || prossimoCodice('ART', d.articoli.map((x) => x.codice)),
      giacenza_milli: 0,
      impegnato_milli: 0,
      costo_medio_cents: 0,
      created_at: adesso(),
      updated_at: adesso(),
    }
    d.articoli.push(a)
    salva()
    return fuori(a)
  },

  async aggiornaArticolo(id: ID, input: ArticoloInput): Promise<Articolo> {
    const a = trova(db().articoli, id, 'Articolo')
    if (!input.nome?.trim()) throw new ErroreApi(400, 'Il nome dell’articolo è obbligatorio.')
    Object.assign(a, input, {
      id: a.id,
      codice: a.codice,
      // i derivati non si aggiornano da form: li ricalcola il DB dai movimenti
      giacenza_milli: a.giacenza_milli,
      impegnato_milli: a.impegnato_milli,
      costo_medio_cents: a.costo_medio_cents,
      updated_at: adesso(),
    })
    salva()
    return fuori(a)
  },

  async eliminaArticolo(id: ID): Promise<void> {
    const d = db()
    const a = trova(d.articoli, id, 'Articolo')
    const rif: string[] = []
    const m = d.movimenti.filter((x) => x.articolo_id === id).length
    if (m) rif.push(plurale(m, 'movimento di magazzino', 'movimenti di magazzino'))
    bloccaSeReferenziato(rif, 'Disattivalo invece di eliminarlo.')
    // Come per l'ordine: le schede di lavorazione si scollegano, le specifiche
    // le hanno già copiate. Vedi il commento in `eliminaOrdine`.
    for (const s of d.schede_lavorazione) {
      if (s.articolo_id === id) s.articolo_id = null
    }
    d.articoli.splice(d.articoli.indexOf(a), 1)
    salva()
  },

  // ------------------------------------------------------------------- lotti
  async listaLotti(filtri?: FiltriBase & { essenza?: string; patina?: string }): Promise<Lotto[]> {
    const d = db()
    let out = d.lotti
    if (filtri?.q) {
      const q = filtri.q.toLowerCase()
      out = out.filter((l) =>
        testo(l.codice, l.descrizione, l.provenienza_edificio, l.provenienza_localita, l.ubicazione).includes(q),
      )
    }
    if (filtri?.stato) out = out.filter((l) => l.stato === filtri.stato)
    if (filtri?.essenza) out = out.filter((l) => l.essenza === filtri.essenza)
    if (filtri?.patina) out = out.filter((l) => l.patina === filtri.patina)
    return fuori(out.slice().sort((a, b) => b.data_acquisto.localeCompare(a.data_acquisto)))
  },

  async lotto(id: ID): Promise<Lotto> {
    return fuori(trova(db().lotti, id, 'Lotto'))
  },

  /**
   * Cosa è entrato con questa partita e cosa ne resta, articolo per articolo.
   * Alimenta la scheda lotto e il controllo di disponibilità del DDT.
   */
  async giacenzePerLotto(lottoId: ID): Promise<VoceGiacenzaLotto[]> {
    const d = db()
    trova(d.lotti, lottoId, 'Lotto')
    return fuori(giacenzeDelLotto(lottoId))
  },

  /**
   * Da quali partite si può prelevare questo articolo, e quanto ce n'è.
   * È l'elenco che riempie il selettore di lotto sulla riga di DDT: senza,
   * l'operatore dichiarerebbe una provenienza a memoria.
   */
  async lottiDisponibiliPerArticolo(articoloId: ID): Promise<Array<{
    lotto_id: ID
    codice: string
    descrizione: string
    provenienza: string | null
    data_acquisto: string
    residuo_milli: number
  }>> {
    const d = db()
    trova(d.articoli, articoloId, 'Articolo')
    const out = []
    for (const voce of giacenzePerCoppia(d).values()) {
      if (voce.articolo_id !== articoloId || !voce.lotto_id || voce.residuo_milli <= 0) continue
      const l = d.lotti.find((x) => x.id === voce.lotto_id)
      if (!l) continue
      out.push({
        lotto_id: l.id,
        codice: l.codice,
        descrizione: l.descrizione,
        provenienza: descriviProvenienza(l),
        data_acquisto: l.data_acquisto,
        residuo_milli: voce.residuo_milli,
      })
    }
    // prima le partite più vecchie: si smaltisce il legno fermo da più tempo
    return fuori(out.sort((a, b) => a.data_acquisto.localeCompare(b.data_acquisto)))
  },

  /**
   * Discendenza del lotto: quali articoli sono entrati con questa partita e a
   * quali clienti sono andati. È la domanda a cui il committente tiene di più —
   * «da che edificio viene il pavimento di casa mia?».
   *
   * Si legge tutta dai movimenti: nessuna dichiarazione, solo carichi e
   * scarichi che portano insieme articolo_id e lotto_id.
   */
  async discendenzaLotto(id: ID): Promise<{
    articoli: VoceGiacenzaLotto[]
    consegne: Array<{
      ddt_id: ID
      numero: string
      data: string
      cliente: string
      articolo: string
      quantita_milli: number
      unita_misura: UnitaMisura
    }>
  }> {
    const d = db()
    trova(d.lotti, id, 'Lotto')

    const consegne = []
    for (const doc of d.ddt) {
      if (doc.stato !== 'emesso' && doc.stato !== 'consegnato') continue
      for (const r of doc.righe) {
        if (r.lotto_id !== id) continue
        consegne.push({
          ddt_id: doc.id,
          numero: doc.numero,
          data: doc.data_trasporto,
          cliente: doc.cliente_nome,
          articolo: r.descrizione,
          quantita_milli: r.quantita_milli,
          unita_misura: r.unita_misura,
        })
      }
    }
    consegne.sort((a, b) => b.data.localeCompare(a.data))

    return fuori({ articoli: giacenzeDelLotto(id), consegne })
  },

  /**
   * Un lotto creato a mano è una partita censita: la merce si carica dopo, con
   * la ricezione dell'acquisto o con una rettifica di inventario. Per questo
   * qui non nasce nessun movimento — sarebbe un carico senza articolo, cioè
   * merce che nessuna giacenza racconta.
   */
  async creaLotto(input: LottoInput): Promise<Lotto> {
    const d = db()
    if (!input.descrizione?.trim()) throw new ErroreApi(400, 'La descrizione del lotto è obbligatoria.')
    if (!input.data_acquisto) throw new ErroreApi(400, 'La data di acquisto è obbligatoria.')
    const l: Lotto = {
      ...input,
      id: nuovoId(),
      id_esterno: null,
      codice: input.codice || prossimoNumero('LOT', d.lotti.map((x) => x.codice)),
      created_at: adesso(),
      updated_at: adesso(),
    }
    d.lotti.push(l)
    salva()
    return fuori(l)
  },

  async aggiornaLotto(id: ID, input: LottoInput): Promise<Lotto> {
    const l = trova(db().lotti, id, 'Lotto')
    Object.assign(l, input, { id: l.id, codice: l.codice, updated_at: adesso() })
    salva()
    return fuori(l)
  },

  async eliminaLotto(id: ID): Promise<void> {
    const d = db()
    const l = trova(d.lotti, id, 'Lotto')
    const rif: string[] = []
    const m = d.movimenti.filter((x) => x.lotto_id === id).length
    const r = d.acquisti.filter((a) => a.righe.some((x) => x.lotto_id === id)).length
    if (m) rif.push(`${plurale(m, 'movimento di magazzino', 'movimenti di magazzino')} su questa partita`)
    if (r) rif.push(plurale(r, 'ordine di acquisto collegato', 'ordini di acquisto collegati'))
    bloccaSeReferenziato(rif, 'Archivialo invece di eliminarlo.')
    d.lotti.splice(d.lotti.indexOf(l), 1)
    salva()
  },

  // --------------------------------------------------------------- movimenti
  async listaMovimenti(filtri?: FiltriBase & { tipo?: string; origine?: string; articolo_id?: ID; lotto_id?: ID }): Promise<MovimentoMagazzino[]> {
    const d = db()
    let out = d.movimenti
    if (filtri?.q) {
      const q = filtri.q.toLowerCase()
      out = out.filter((m) => testo(m.causale, m.documento_numero, m.note).includes(q))
    }
    if (filtri?.tipo) out = out.filter((m) => m.tipo === filtri.tipo)
    if (filtri?.origine) out = out.filter((m) => m.origine === filtri.origine)
    if (filtri?.articolo_id) out = out.filter((m) => m.articolo_id === filtri.articolo_id)
    if (filtri?.lotto_id) out = out.filter((m) => m.lotto_id === filtri.lotto_id)
    if (filtri?.dal) out = out.filter((m) => m.data >= filtri.dal!)
    if (filtri?.al) out = out.filter((m) => m.data <= filtri.al!)
    out = out.slice().sort(perDataDesc)
    if (filtri?.limite) out = out.slice(0, filtri.limite)
    return fuori(out)
  },

  /** Rettifica di inventario: l'unico modo lecito di correggere una giacenza. */
  async rettificaInventario(input: {
    articolo_id: ID
    quantita_milli: number // con segno
    causale: string
    data?: string
  }): Promise<MovimentoMagazzino> {
    const d = db()
    const a = trova(d.articoli, input.articolo_id, 'Articolo')
    if (!input.quantita_milli) throw new ErroreApi(400, 'La quantità della rettifica non può essere zero.')
    if (!input.causale?.trim()) throw new ErroreApi(400, 'La causale è obbligatoria: una rettifica senza motivo non si può controllare.')
    if (a.giacenza_milli + input.quantita_milli < 0) {
      throw new ErroreApi(400, 'La rettifica porterebbe la giacenza sotto zero.')
    }
    const m = creaMovimento({
      data: input.data ?? oggiISO(),
      tipo: 'rettifica',
      origine: 'inventario',
      articolo_id: a.id,
      lotto_id: null,
      quantita_milli: input.quantita_milli,
      unita_misura: a.unita_misura,
      valore_unitario_cents: a.costo_medio_cents,
      valore_totale_cents: Math.round((Math.abs(input.quantita_milli) * a.costo_medio_cents) / 1000),
      documento_tipo: 'rettifica',
      documento_id: null,
      documento_numero: null,
      causale: input.causale.trim(),
      note: null,
    })
    salva()
    return fuori(m)
  },

  // ---------------------------------------------------------- incassi
  async listaPagamenti(
    filtri?: FiltriBase & { cliente_id?: ID; ordine_id?: ID; tipo?: string; mezzo?: string },
  ): Promise<Pagamento[]> {
    const d = db()
    let out = d.pagamenti
    if (filtri?.q) {
      const q = filtri.q.toLowerCase()
      out = out.filter((p) => testo(p.cliente_nome, p.ordine_numero, p.riferimento, p.note).includes(q))
    }
    if (filtri?.cliente_id) out = out.filter((p) => p.cliente_id === filtri.cliente_id)
    if (filtri?.ordine_id) out = out.filter((p) => p.ordine_id === filtri.ordine_id)
    if (filtri?.tipo) out = out.filter((p) => p.tipo === filtri.tipo)
    if (filtri?.mezzo) out = out.filter((p) => p.mezzo === filtri.mezzo)
    if (filtri?.dal) out = out.filter((p) => p.data >= filtri.dal!)
    if (filtri?.al) out = out.filter((p) => p.data <= filtri.al!)
    out = out.slice().sort(perDataDesc)
    if (filtri?.limite) out = out.slice(0, filtri.limite)
    return fuori(out)
  },

  async pagamento(id: ID): Promise<Pagamento> {
    return fuori(trova(db().pagamenti, id, 'Pagamento'))
  },

  async creaPagamento(input: PagamentoInput): Promise<Pagamento> {
    const d = db()
    const { cliente, ordine } = validaPagamento(input)
    const p: Pagamento = {
      ...input,
      cliente_nome: cliente.ragione_sociale,
      ordine_numero: ordine?.numero ?? null,
      id: nuovoId(),
      id_esterno: null,
      created_at: adesso(),
      updated_at: adesso(),
    }
    d.pagamenti.push(p)
    salva()
    return fuori(p)
  },

  async aggiornaPagamento(id: ID, input: PagamentoInput): Promise<Pagamento> {
    const p = trova(db().pagamenti, id, 'Pagamento')
    const { cliente, ordine } = validaPagamento(input)
    Object.assign(p, input, {
      id: p.id,
      cliente_nome: cliente.ragione_sociale,
      ordine_numero: ordine?.numero ?? null,
      updated_at: adesso(),
    })
    salva()
    return fuori(p)
  },

  /**
   * Spunta come saldata una scadenza di prima nota importata.
   *
   * ⚠️ **Non è un `Pagamento`, ed è il punto.** Registrare un pagamento contro
   * una scadenza storica creerebbe una seconda scrittura sulla stessa somma —
   * la scadenza resterebbe aperta e l'incasso comparirebbe due volte, una per
   * registro. Qui si chiude la scadenza dov'è nata.
   *
   * `mezzo` resta quello dichiarato dal documento se non se ne indica un altro:
   * 191 scadenze reali non lo dichiarano affatto, e inventarne uno sarebbe
   * scrivere in prima nota un fatto che nessuno ha osservato.
   */
  async saldaScadenza(
    id: ID,
    input?: { data_pagamento?: string; mezzo?: MezzoPagamento | null },
  ): Promise<Scadenza> {
    const s = trova(db().scadenze, id, 'Scadenza')
    if (s.saldato) throw new ErroreApi(409, 'Questa scadenza risulta già saldata.')
    s.saldato = true
    s.data_pagamento = input?.data_pagamento ?? oggiISO()
    if (input?.mezzo !== undefined) s.mezzo = input.mezzo
    s.updated_at = adesso()
    salva()
    return fuori(s)
  },

  async eliminaPagamento(id: ID): Promise<void> {
    const d = db()
    const p = trova(d.pagamenti, id, 'Pagamento')
    d.pagamenti.splice(d.pagamenti.indexOf(p), 1)
    salva()
  },

  /**
   * Quello che c'è ancora da incassare, i più urgenti in cima. È la lista con
   * cui si fanno i solleciti la mattina.
   *
   * ⚠️ **Due sorgenti, e la seconda non è un di più.** I documenti nati qui
   * portano il residuo sull'ordine; l'archivio importato lo porta sulle scadenze
   * di prima nota, perché alcune sorgenti incassano contro la fattura.
   * Contare anche gli ordini importati sovrastimerebbe l'esposizione; il pannello
   * deve usare le scadenze non saldate come fonte autorevole.
   */
  async scadenzario(): Promise<VoceScadenzario[]> {
    const d = db()
    const oggi = oggiISO()
    const voci: VoceScadenzario[] = d.ordini
      .filter((o) => !eStorico(o) && o.stato !== 'annullato' && o.totale_cents - o.incassato_cents > 0)
      .map((o) => {
        const ritardo = giorniDiRitardo(o.data_scadenza_saldo, oggi)
        return {
          chiave: o.id,
          ordine_id: o.id,
          numero: o.numero,
          cliente_id: o.cliente_id,
          cliente_nome: o.cliente_nome,
          data_scadenza_saldo: o.data_scadenza_saldo,
          totale_cents: o.totale_cents,
          incassato_cents: o.incassato_cents,
          residuo_cents: o.totale_cents - o.incassato_cents,
          giorni_ritardo: ritardo,
          scaduto: ritardo > 0,
          origine: 'ordine' as const,
        }
      })

    for (const s of d.scadenze) {
      if (s.saldato || s.verso !== 'incasso') continue
      const ritardo = giorniDiRitardo(s.data_scadenza, oggi)
      voci.push({
        chiave: s.id,
        ordine_id: null,
        numero: s.documento_numero,
        cliente_id: s.cliente_id ?? '',
        cliente_nome: s.controparte_nome,
        data_scadenza_saldo: s.data_scadenza,
        // Una scadenza è già il residuo: non c'è un totale da cui sottrarre.
        totale_cents: s.importo_cents,
        incassato_cents: 0,
        residuo_cents: s.importo_cents,
        giorni_ritardo: ritardo,
        scaduto: ritardo > 0,
        origine: 'scadenza' as const,
      })
    }
    voci.sort((a, b) => {
      if (a.scaduto !== b.scaduto) return a.scaduto ? -1 : 1
      if (a.scaduto) return b.giorni_ritardo - a.giorni_ritardo
      // senza scadenza si va in fondo: non è in ritardo, semplicemente non si sa
      return (a.data_scadenza_saldo ?? '9999').localeCompare(b.data_scadenza_saldo ?? '9999')
    })
    return fuori(voci)
  },

  // -------------------------------------------------------------- preventivi
  async listaPreventivi(filtri?: FiltriBase & { cliente_id?: ID }): Promise<Preventivo[]> {
    const d = db()
    let out = applicaFiltri(d.preventivi, filtri, (p) => testo(p.numero, p.cliente_nome, p.oggetto))
    if (filtri?.cliente_id) out = out.filter((p) => p.cliente_id === filtri.cliente_id)
    return fuori(out.slice().sort(perDataDesc))
  },

  async preventivo(id: ID): Promise<Preventivo> {
    return fuori(trova(db().preventivi, id, 'Preventivo'))
  },

  async creaPreventivo(input: IngressoPreventivo): Promise<Preventivo> {
    return fuori(nascePreventivo(input))
  },

  async aggiornaPreventivo(id: ID, input: Partial<Preventivo>): Promise<Preventivo> {
    const d = db()
    const p = trova(d.preventivi, id, 'Preventivo')
    if (p.stato === 'convertito') {
      throw new ErroreApi(409, `Non modificabile: già convertito nell’ordine ${numeroOrdine(p.ordine_id)}.`)
    }
    Object.assign(p, input, { id: p.id, numero: p.numero, updated_at: adesso() })
    if (input.cliente_id) p.cliente_nome = trova(d.clienti, input.cliente_id, 'Cliente').ragione_sociale
    p.data_scadenza = aggiungiGiorni(p.data, p.validita_giorni)
    ricalcolaTotaliVendita(p)
    salva()
    return fuori(p)
  },

  async cambiaStatoPreventivo(id: ID, stato: StatoPreventivo): Promise<Preventivo> {
    const p = trova(db().preventivi, id, 'Preventivo')
    if (!transizioneAmmessa(TRANSIZIONI_PREVENTIVO, p.stato, stato)) {
      throw new ErroreApi(400, `Un preventivo ${p.stato} non può passare a ${stato}.`)
    }
    p.stato = stato
    p.updated_at = adesso()
    salva()
    return fuori(p)
  },

  /** Converte un preventivo accettato in ordine, copiando le righe. */
  async convertiPreventivo(id: ID): Promise<Ordine> {
    const d = db()
    const p = trova(d.preventivi, id, 'Preventivo')
    if (p.stato === 'convertito') throw new ErroreApi(409, 'Preventivo già convertito.')
    if (p.stato !== 'accettato') {
      throw new ErroreApi(400, 'Solo un preventivo accettato si può convertire in ordine.')
    }
    const cliente = trova(d.clienti, p.cliente_id, 'Cliente')
    const o: Ordine = {
      id: nuovoId(),
      id_esterno: null,
      numero: prossimoNumero('ORD', d.ordini.map((x) => x.numero)),
      data: oggiISO(),
      cliente_id: p.cliente_id,
      cliente_nome: p.cliente_nome,
      // L'intestazione si eredita dal preventivo, non si rilegge dall'anagrafica:
      // l'ordine conferma ciò che il cliente ha visto e accettato.
      intestazione: p.intestazione,
      preventivo_id: p.id,
      preventivo_numero: p.numero,
      agente_nome: p.agente_nome,
      provvigione_cents: p.provvigione_cents,
      righe: p.righe.map((r) => ({ ...r, id: nuovoId(), quantita_evasa_milli: 0 })),
      sconto_generale_percentuale: p.sconto_generale_percentuale,
      imponibile_cents: p.imponibile_cents,
      iva_cents: p.iva_cents,
      totale_cents: p.totale_cents,
      acconto_cents: 0,
      data_scadenza_saldo: null,
      incassato_cents: 0,
      residuo_cents: p.totale_cents,
      data_consegna_prevista: null,
      indirizzo_consegna:
        [cliente.consegna_indirizzo ?? cliente.indirizzo, cliente.consegna_citta ?? cliente.citta]
          .filter(Boolean)
          .join(', ') || null,
      condizioni_pagamento: p.condizioni_pagamento,
      note: null,
      stato: 'confermato',
      created_at: adesso(),
      updated_at: adesso(),
    }
    d.ordini.push(o)
    p.stato = 'convertito'
    p.ordine_id = o.id
    p.updated_at = adesso()
    salva()
    return fuori(o)
  },

  /**
   * Duplica un preventivo: la copia nasce in BOZZA, con un numero nuovo e la
   * data di oggi. È l'azione più usata del pannello — si rifà lo stesso lavoro
   * per un altro cantiere cambiando due quantità — ed è il motivo per cui vive
   * qui e non nel front-end: cosa si eredita e cosa no è una regola, non una
   * comodità dell'interfaccia.
   *
   * Non eredita: numero, stato, data, scadenza, collegamento all'ordine e gli
   * id delle righe. Eredita: cliente, oggetto, righe, sconto, condizioni.
   */
  async duplicaPreventivo(id: ID): Promise<Preventivo> {
    const p = trova(db().preventivi, id, 'Preventivo')
    return fuori(
      nascePreventivo({
        data: oggiISO(),
        cliente_id: p.cliente_id,
        cliente_nome: p.cliente_nome,
        oggetto: p.oggetto,
        righe: p.righe.map((r) => ({ ...r })),
        sconto_generale_percentuale: p.sconto_generale_percentuale,
        validita_giorni: p.validita_giorni,
        condizioni_pagamento: p.condizioni_pagamento,
        tempi_consegna: p.tempi_consegna,
        note: p.note,
        stato: 'bozza',
        ordine_id: null,
      }),
    )
  },

  /**
   * Rifà un ordine come nuovo PREVENTIVO. **Mai come ordine**: in Wood Revive
   * ogni ordine nasce da un preventivo che il cliente accetta, e un ordine
   * copiato sarebbe un ordine che nessuno ha mai confermato.
   *
   * Le righe ripartono dalle quantità richieste, non da quelle già evase:
   * quello che è uscito è storia dell'ordine vecchio. Non eredita nemmeno
   * acconto, incassi, scadenze e DDT.
   *
   * Oggetto, validità e tempi di consegna non esistono sull'ordine: si
   * ripescano dal preventivo che l'ha generato, e in mancanza li passa il
   * chiamante (che conosce i testi predefiniti dell'azienda).
   */
  async preventivoDaOrdine(
    id: ID,
    predefiniti?: { oggetto?: string; validita_giorni?: number; tempi_consegna?: string | null },
  ): Promise<Preventivo> {
    const d = db()
    const o = trova(d.ordini, id, 'Ordine')
    const origine = o.preventivo_id ? d.preventivi.find((x) => x.id === o.preventivo_id) : undefined
    return fuori(
      nascePreventivo({
        data: oggiISO(),
        cliente_id: o.cliente_id,
        cliente_nome: o.cliente_nome,
        oggetto: predefiniti?.oggetto ?? origine?.oggetto ?? '',
        // `quantita_evasa_milli` resta fuori: un preventivo non sa cosa è già
        // uscito, e portarselo dietro falserebbe l'evasione del prossimo ordine.
        righe: o.righe.map(({ quantita_evasa_milli, ...riga }) => ({ ...riga })),
        sconto_generale_percentuale: o.sconto_generale_percentuale,
        validita_giorni: predefiniti?.validita_giorni ?? origine?.validita_giorni ?? 30,
        condizioni_pagamento: o.condizioni_pagamento,
        tempi_consegna: predefiniti?.tempi_consegna ?? origine?.tempi_consegna ?? null,
        note: null,
        stato: 'bozza',
        ordine_id: null,
      }),
    )
  },

  async eliminaPreventivo(id: ID): Promise<void> {
    const d = db()
    const p = trova(d.preventivi, id, 'Preventivo')
    if (p.stato === 'convertito') {
      bloccaSeReferenziato([`convertito nell’ordine ${numeroOrdine(p.ordine_id)}`])
    }
    d.preventivi.splice(d.preventivi.indexOf(p), 1)
    salva()
  },

  // ------------------------------------------------------------------ ordini
  /*
   * ⚠️ NON ESISTE UN `creaOrdine`, E NON È UNA DIMENTICANZA.
   *
   * In Wood Revive **ogni ordine nasce da un preventivo accettato**: il
   * preventivo è il documento che il cliente accetta, e l'ordine è la sua
   * conseguenza. L'unico punto di questo file che aggiunge una riga a
   * `db().ordini` è `convertiPreventivo`, che pretende `stato === 'accettato'`
   * e scrive `preventivo_id` e `preventivo_numero` sull'ordine e `ordine_id`
   * sul preventivo: il legame nasce nei due sensi e non si può omettere.
   *
   * Di conseguenza `preventivo_id` è di fatto obbligatorio su un ordine, anche
   * se il tipo lo ammette nullo per i dati storici che un giorno verranno
   * importati. `seed.test.ts` lo verifica su tutti gli ordini dimostrativi.
   *
   * Chi scriverà il backend: nessun endpoint `POST /ordini`. Se serve un
   * ordine, si crea il preventivo e lo si converte — sono due chiamate, ed è
   * il modo in cui l'azienda lavora, non un vincolo dell'interfaccia.
   */
  async listaOrdini(filtri?: FiltriBase & { cliente_id?: ID }): Promise<Ordine[]> {
    const d = db()
    let out = applicaFiltri(d.ordini, filtri, (o) => testo(o.numero, o.cliente_nome, o.note))
    if (filtri?.cliente_id) out = out.filter((o) => o.cliente_id === filtri.cliente_id)
    return fuori(out.slice().sort(perDataDesc))
  },

  async ordine(id: ID): Promise<Ordine> {
    return fuori(trova(db().ordini, id, 'Ordine'))
  },

  async aggiornaOrdine(id: ID, input: Partial<Ordine>): Promise<Ordine> {
    const o = trova(db().ordini, id, 'Ordine')
    /*
     * Un ordine già consegnato non si riapre cambiando le quantità: lo stato
     * di evasione lo decidono i DDT, non questo form. Restano modificabili i
     * dati che non toccano la merce — acconto, indirizzo, note, date.
     */
    if ((o.stato === 'evaso' || o.stato === 'annullato') && input.righe) {
      throw new ErroreApi(
        409,
        // ⚠️ Il suggerimento non può essere «genera un nuovo ordine»: gli ordini
        // nascono solo dai preventivi. Si duplica il preventivo di origine e lo
        // si fa accettare, che è quello che succede davvero al telefono.
        `Le righe di un ordine ${o.stato === 'evaso' ? 'evaso' : 'annullato'} non si modificano. Per una consegna in più rifallo come preventivo e convertilo una volta accettato, per un rientro emetti un DDT di reso.`,
      )
    }
    Object.assign(o, input, { id: o.id, numero: o.numero, updated_at: adesso() })
    ricalcolaTotaliVendita(o)
    salva()
    return fuori(o)
  },

  async cambiaStatoOrdine(id: ID, stato: StatoOrdine): Promise<Ordine> {
    const o = trova(db().ordini, id, 'Ordine')
    if (!transizioneAmmessa(TRANSIZIONI_ORDINE, o.stato, stato)) {
      throw new ErroreApi(400, `Un ordine ${o.stato} non può passare a ${stato}.`)
    }
    o.stato = stato
    o.updated_at = adesso()
    salva()
    return fuori(o)
  },

  async eliminaOrdine(id: ID): Promise<void> {
    const d = db()
    const o = trova(d.ordini, id, 'Ordine')
    const emessi = d.ddt.filter((x) => x.ordine_id === id && x.stato !== 'bozza').length
    const incassi = d.pagamenti.filter((x) => x.ordine_id === id).length
    if (emessi) {
      bloccaSeReferenziato(
        [plurale(emessi, 'DDT già emesso', 'DDT già emessi')],
        'Annulla prima le consegne.',
      )
    }
    if (incassi) {
      bloccaSeReferenziato(
        [plurale(incassi, 'incasso registrato', 'incassi registrati')],
        'Storna prima i pagamenti o annulla l’ordine.',
      )
    }
    d.ddt = d.ddt.filter((x) => x.ordine_id !== id)
    if (o.preventivo_id) {
      const p = d.preventivi.find((x) => x.id === o.preventivo_id)
      if (p) {
        p.stato = 'accettato'
        p.ordine_id = null
      }
    }
    // Le schede di lavorazione si SCOLLEGANO, non bloccano: l'ordine è la
    // provenienza della precompilazione, non un'appartenenza — i valori sono
    // già copiati sulla scheda, e `ordine_numero` (snapshot) resta scritto.
    // Non «uniformare» a guardia: bloccherebbe eliminazioni legittime.
    for (const s of d.schede_lavorazione) {
      if (s.ordine_id === id) s.ordine_id = null
    }
    d.ordini.splice(d.ordini.indexOf(o), 1)
    salva()
  },

  // --------------------------------------------------------------------- DDT
  async listaDdt(filtri?: FiltriBase & { cliente_id?: ID }): Promise<DDT[]> {
    const d = db()
    let out = applicaFiltri(d.ddt, filtri, (x) => testo(x.numero, x.cliente_nome, x.destinazione_citta))
    if (filtri?.cliente_id) out = out.filter((x) => x.cliente_id === filtri.cliente_id)
    return fuori(out.slice().sort(perDataDesc))
  },

  async ddt(id: ID): Promise<DDT> {
    return fuori(trova(db().ddt, id, 'DDT'))
  },

  /** Prepara un DDT in bozza dalle righe residue di un ordine. */
  async creaDdtDaOrdine(ordineId: ID, lottiPerRiga?: Record<ID, ID | null>): Promise<DDT> {
    const d = db()
    const o = trova(d.ordini, ordineId, 'Ordine')
    const cliente = trova(d.clienti, o.cliente_id, 'Cliente')

    const righe = o.righe
      .filter((r) => {
        if (!r.articolo_id) return false
        return r.quantita_milli - r.quantita_evasa_milli > 0
      })
      .map((r) => {
        const lottoId = lottiPerRiga?.[r.id] ?? r.lotto_id ?? null
        return {
          id: nuovoId(),
          // Solo righe di merce: il filtro sopra ha già scartato quelle senza
          // articolo, e una riga di testo non si consegna.
          tipo: 'merce' as const,
          articolo_id: r.articolo_id!,
          lotto_id: lottoId,
          lotto_codice: lottoId ? (d.lotti.find((l) => l.id === lottoId)?.codice ?? null) : null,
          codice_articolo: r.codice_articolo,
          descrizione: r.descrizione,
          quantita_milli: r.quantita_milli - r.quantita_evasa_milli,
          unita_misura: r.unita_misura,
          prezzo_unitario_cents: r.prezzo_unitario_cents,
          sconto_percentuale: r.sconto_percentuale,
          aliquota_iva: r.aliquota_iva,
          imponibile_cents: 0,
          colli: 0,
          peso_kg_milli: 0,
          riga_ordine_id: r.id,
          note: null,
        }
      })

    if (!righe.length) throw new ErroreApi(400, 'Non ci sono righe da consegnare: l’ordine è già evaso.')

    const documento: DDT = {
      id: nuovoId(),
      id_esterno: null,
      numero: prossimoNumero('DDT', d.ddt.map((x) => x.numero)),
      data: oggiISO(),
      data_trasporto: oggiISO(),
      ora_trasporto: null,
      cliente_id: o.cliente_id,
      cliente_nome: o.cliente_nome,
      // Ereditata dall'ordine: il DDT consegna quello che l'ordine ha pattuito.
      intestazione: o.intestazione,
      ordine_id: o.id,
      ordine_numero: o.numero,
      agente_nome: o.agente_nome,
      provvigione_cents: 0,
      destinazione_indirizzo: cliente.consegna_indirizzo ?? cliente.indirizzo,
      destinazione_cap: cliente.consegna_cap ?? cliente.cap,
      destinazione_citta: cliente.consegna_citta ?? cliente.citta,
      destinazione_provincia: cliente.consegna_provincia ?? cliente.provincia,
      destinatario: null,
      causale: 'vendita',
      causale_dichiarata: null,
      trasporto_a_cura_di: 'mittente',
      porto: null,
      vettore: null,
      aspetto_beni: 'Bancali',
      colli_totali: 0,
      peso_totale_kg_milli: 0,
      colli_dichiarati: null,
      peso_dichiarato: null,
      valorizzato: false,
      sconto_generale_percentuale: o.sconto_generale_percentuale,
      righe,
      imponibile_cents: 0,
      iva_cents: 0,
      totale_cents: 0,
      stato: 'bozza',
      note: null,
      created_at: adesso(),
      updated_at: adesso(),
    }
    ricalcolaTotaliDdt(documento)
    d.ddt.push(documento)
    salva()
    return fuori(documento)
  },

  async aggiornaDdt(id: ID, input: Partial<DDT>): Promise<DDT> {
    const doc = trova(db().ddt, id, 'DDT')
    if (doc.stato !== 'bozza') throw new ErroreApi(409, 'Un DDT emesso non si modifica.')
    Object.assign(doc, input, { id: doc.id, numero: doc.numero, updated_at: adesso() })
    ricalcolaTotaliDdt(doc)
    salva()
    return fuori(doc)
  },

  /**
   * ⚠️ PUNTO CHE MUOVE IL MAGAZZINO (2 di 2), e non torna indietro.
   * Scarica la merce, aggiorna l'evasione dell'ordine e lo stato conseguente.
   */
  async emettiDdt(id: ID): Promise<DDT> {
    const d = db()
    const doc = trova(d.ddt, id, 'DDT')
    if (doc.stato !== 'bozza') throw new ErroreApi(409, 'Il DDT è già stato emesso.')
    if (!doc.righe.length) throw new ErroreApi(400, 'Un DDT senza righe non si emette.')

    // La causale decide il verso del movimento. Un DDT di reso CARICA il
    // magazzino: trattarlo come una consegna scaricherebbe una seconda volta
    // merce che sta rientrando, sbagliando di due volte la quantità.
    const inRientro = doc.causale === 'reso'

    // La disponibilità si controlla solo per ciò che esce: un reso entra.
    if (!inRientro) {
      // Due controlli, non uno. Quello globale dice se la merce c'è; quello
      // sul lotto dice se c'è **quella** merce. Un DDT che dichiara il fienile
      // di Cordignano e preleva da una catasta che di quel fienile non ha più
      // niente passa il primo controllo e mente al cliente: è esattamente la
      // promessa che questo gestionale esiste per mantenere.
      for (const r of doc.righe) {
        // Una riga senza articolo non ha giacenza da controllare: è testo, o
        // merce descritta a mano che a catalogo non esiste.
        if (!r.articolo_id) continue
        const a = trova(d.articoli, r.articolo_id, 'Articolo')
        if (r.quantita_milli > a.giacenza_milli) {
          throw new ErroreApi(
            400,
            `Giacenza insufficiente per ${a.codice} ${a.nome}: servono ${r.quantita_milli / 1000} ${a.unita_misura}, ce ne sono ${a.giacenza_milli / 1000}.`,
          )
        }
        if (!r.lotto_id) continue
        const l = trova(d.lotti, r.lotto_id, 'Lotto')
        const residuo = residuoCoppia(r.articolo_id, r.lotto_id)
        if (r.quantita_milli > residuo) {
          throw new ErroreApi(
            400,
            `Del lotto ${l.codice} (${l.descrizione}) restano ${residuo / 1000} ${a.unita_misura} di ${a.codice} ${a.nome}: non bastano per ${r.quantita_milli / 1000}. Scegli un'altra partita o dividi la riga.`,
          )
        }
      }
    }

    for (const r of doc.righe) {
      // Solo la merce a catalogo muove il magazzino. Le righe di testo e quelle
      // descritte a mano viaggiano sul documento senza toccare le giacenze:
      // generare un movimento senza articolo lascerebbe un carico orfano che
      // nessun invariante saprebbe più spiegare.
      if (!r.articolo_id) continue
      const a = trova(d.articoli, r.articolo_id, 'Articolo')
      creaMovimento({
        data: doc.data_trasporto,
        tipo: inRientro ? 'carico' : 'scarico',
        origine: inRientro ? 'reso' : 'ddt',
        articolo_id: r.articolo_id,
        lotto_id: r.lotto_id,
        quantita_milli: r.quantita_milli,
        unita_misura: r.unita_misura,
        valore_unitario_cents: a.costo_medio_cents,
        valore_totale_cents: Math.round((r.quantita_milli * a.costo_medio_cents) / 1000),
        documento_tipo: 'ddt',
        documento_id: doc.id,
        documento_numero: doc.numero,
        causale: `${inRientro ? 'Reso' : 'Consegna'} ${doc.numero} — ${doc.cliente_nome}`,
        note: null,
      })
    }

    doc.stato = 'emesso'
    doc.updated_at = adesso()
    salva() // ricalcola quantita_evasa_milli delle righe d'ordine

    // Un reso non evade nulla: aggiornare l'ordine lo farebbe regredire.
    if (doc.ordine_id && !inRientro) {
      const o = d.ordini.find((x) => x.id === doc.ordine_id)
      if (o && o.stato !== 'annullato') {
        // Ogni riga d'ordine è merce che viaggia: nessuna eccezione da saltare.
        const tutteEvase = o.righe.every((r) => r.quantita_evasa_milli >= r.quantita_milli)
        o.stato = tutteEvase ? 'evaso' : 'evaso_parziale'
        o.updated_at = adesso()
        salva()
      }
    }

    return fuori(doc)
  },

  async cambiaStatoDdt(id: ID, stato: StatoDDT): Promise<DDT> {
    const doc = trova(db().ddt, id, 'DDT')
    if (!transizioneAmmessa(TRANSIZIONI_DDT, doc.stato, stato)) {
      throw new ErroreApi(400, `Un DDT ${doc.stato} non può passare a ${stato}.`)
    }
    if (stato === 'emesso') return mockApi.emettiDdt(id)
    doc.stato = stato
    doc.updated_at = adesso()
    salva()
    return fuori(doc)
  },

  async eliminaDdt(id: ID): Promise<void> {
    const d = db()
    const doc = trova(d.ddt, id, 'DDT')
    if (doc.stato !== 'bozza') {
      throw new ErroreApi(409, 'Un DDT emesso non si elimina: emetti un DDT di reso.')
    }
    d.ddt.splice(d.ddt.indexOf(doc), 1)
    salva()
  },

  // ---------------------------------------------------------------- acquisti
  async listaAcquisti(filtri?: FiltriBase & { fornitore_id?: ID }): Promise<OrdineAcquisto[]> {
    const d = db()
    let out = applicaFiltri(d.acquisti, filtri, (a) => testo(a.numero, a.fornitore_nome, a.note))
    if (filtri?.fornitore_id) out = out.filter((a) => a.fornitore_id === filtri.fornitore_id)
    return fuori(out.slice().sort(perDataDesc))
  },

  async acquisto(id: ID): Promise<OrdineAcquisto> {
    return fuori(trova(db().acquisti, id, 'Ordine di acquisto'))
  },

  async creaAcquisto(input: Omit<OrdineAcquisto, 'id' | 'id_esterno' | 'numero' | 'created_at' | 'updated_at' | 'imponibile_cents' | 'iva_cents' | 'totale_cents'>): Promise<OrdineAcquisto> {
    const d = db()
    const fornitore = trova(d.fornitori, input.fornitore_id, 'Fornitore')
    const a: OrdineAcquisto = {
      ...input,
      id: nuovoId(),
      id_esterno: null,
      numero: prossimoNumero('ACQ', d.acquisti.map((x) => x.numero)),
      fornitore_nome: fornitore.ragione_sociale,
      imponibile_cents: 0,
      iva_cents: 0,
      totale_cents: 0,
      created_at: adesso(),
      updated_at: adesso(),
    }
    ricalcolaTotaliAcquisto(a)
    d.acquisti.push(a)
    salva()
    return fuori(a)
  },

  async aggiornaAcquisto(id: ID, input: Partial<OrdineAcquisto>): Promise<OrdineAcquisto> {
    const a = trova(db().acquisti, id, 'Ordine di acquisto')
    if (a.stato === 'ricevuto') throw new ErroreApi(409, 'Un acquisto ricevuto non si modifica: ha già generato i lotti.')
    Object.assign(a, input, { id: a.id, numero: a.numero, updated_at: adesso() })
    ricalcolaTotaliAcquisto(a)
    salva()
    return fuori(a)
  },

  /**
   * ⚠️ PUNTO CHE MUOVE IL MAGAZZINO (1 di 2).
   *
   * Registra l'arrivo della fornitura. Fa due cose insieme, e devono essere
   * atomiche:
   *
   *  1. crea **un solo lotto** per tutto l'ordine di acquisto. La provenienza
   *     è una proprietà della fornitura, non della riga: le tavole, il
   *     perlinato e le travi che arrivano dallo stesso fienile sono la stessa
   *     partita, e un lotto per riga la spezzerebbe in tre storie identiche
   *     che poi nessuno tiene allineate;
   *  2. genera **un carico di ARTICOLO per ogni riga**, con `lotto_id`
   *     valorizzato. È questo che rende la provenienza verificabile: la merce
   *     entra a magazzino sapendo da dove viene.
   *
   * Il trasporto si ripartisce sulle righe in proporzione al valore e finisce
   * nel costo unitario di carico — quindi nel costo medio, quindi nel margine.
   * Se restasse fuori, ogni articolo sembrerebbe più redditizio di quanto è.
   */
  async ricevalAcquisto(
    id: ID,
    dati: { data_ricezione?: string; lotto?: Partial<LottoInput> },
  ): Promise<{ acquisto: OrdineAcquisto; lotto: Lotto }> {
    const d = db()
    const a = trova(d.acquisti, id, 'Ordine di acquisto')
    if (a.stato === 'ricevuto') throw new ErroreApi(409, 'Acquisto già ricevuto.')
    if (a.stato === 'annullato') throw new ErroreApi(409, 'Acquisto annullato.')

    const daRicevere = a.righe.filter((r) => !r.lotto_id)
    if (!daRicevere.length) throw new ErroreApi(400, 'Non c’è nessuna riga da ricevere.')
    for (const r of daRicevere) {
      if (!r.articolo_id) {
        throw new ErroreApi(400, `La riga «${r.descrizione}» non ha un articolo: senza, la merce non entra a magazzino.`)
      }
      const articolo = trova(d.articoli, r.articolo_id, 'Articolo')
      // Solo la merce entra in magazzino. La posa e il trasporto Wood Revive li
      // subappalta: si fatturano, ma non hanno una giacenza da caricare né una
      // partita di provenienza da dichiarare. Vedi `NaturaArticolo` in
      // domain/magazzino.ts e CLAUDE.md §Cosa NON fare.
      if (articolo.natura !== 'merce') {
        throw new ErroreApi(
          400,
          `«${articolo.nome}» è ${
            articolo.natura === 'servizio_terzi' ? 'un servizio di terzi' : 'una spesa'
          }, non merce: si fattura, ma non entra a magazzino. Togli la riga dalla ricezione.`,
        )
      }
      if (r.quantita_milli <= 0) {
        throw new ErroreApi(400, `La riga «${r.descrizione}» ha quantità zero.`)
      }
    }

    const dataRicezione = dati.data_ricezione ?? oggiISO()
    const extra = dati.lotto ?? {}
    const quote = ripartisci(a.spese_trasporto_cents, daRicevere.map((r) => r.imponibile_cents))
    const costoPartita = daRicevere.reduce((t, r, i) => t + r.imponibile_cents + quote[i], 0)
    const primoArticolo = d.articoli.find((x) => x.id === daRicevere[0].articolo_id)

    const l: Lotto = {
      id: nuovoId(),
      id_esterno: null,
      codice: prossimoNumero('LOT', d.lotti.map((x) => x.codice)),
      descrizione: extra.descrizione ?? `Fornitura ${a.numero} — ${a.fornitore_nome}`,
      fornitore_id: a.fornitore_id,
      ordine_acquisto_id: a.id,
      provenienza_edificio: extra.provenienza_edificio ?? null,
      provenienza_localita: extra.provenienza_localita ?? null,
      provenienza_provincia: extra.provenienza_provincia ?? null,
      anno_costruzione_stimato: extra.anno_costruzione_stimato ?? null,
      data_acquisto: dataRicezione,
      essenza: extra.essenza ?? primoArticolo?.essenza ?? 'abete',
      patina: extra.patina ?? primoArticolo?.patina ?? 'naturale',
      qualita: extra.qualita ?? 'B',
      costo_acquisto_cents: costoPartita,
      ubicazione: extra.ubicazione ?? null,
      stato: 'disponibile',
      note_storiche: extra.note_storiche ?? null,
      note: extra.note ?? null,
      foto: [],
      created_at: adesso(),
      updated_at: adesso(),
    }
    d.lotti.push(l)

    daRicevere.forEach((r, idx) => {
      const articolo = trova(d.articoli, r.articolo_id, 'Articolo')
      const costo = r.imponibile_cents + quote[idx]
      r.lotto_id = l.id

      creaMovimento({
        data: dataRicezione,
        tipo: 'carico',
        origine: 'acquisto',
        articolo_id: articolo.id,
        lotto_id: l.id,
        quantita_milli: r.quantita_milli,
        unita_misura: r.unita_misura,
        valore_unitario_cents: Math.round((costo * 1000) / r.quantita_milli),
        valore_totale_cents: costo,
        documento_tipo: 'ordine_acquisto',
        documento_id: a.id,
        documento_numero: a.numero,
        causale: `Ricezione ${a.numero} — ${l.codice} ${l.descrizione}`,
        note: null,
      })

      // L'ultimo prezzo pagato diventa il prezzo di acquisto di riferimento:
      // è il numero su cui si ricalcola il listino quando il fornitore aumenta.
      articolo.prezzo_acquisto_cents = r.prezzo_unitario_cents
      articolo.updated_at = adesso()
    })

    a.stato = a.righe.every((r) => r.lotto_id) ? 'ricevuto' : 'ricevuto_parziale'
    a.data_ricezione = dataRicezione
    a.updated_at = adesso()
    salva()
    return fuori({ acquisto: a, lotto: l })
  },

  async eliminaAcquisto(id: ID): Promise<void> {
    const d = db()
    const a = trova(d.acquisti, id, 'Ordine di acquisto')
    const lotti = new Set(a.righe.map((r) => r.lotto_id).filter(Boolean)).size
    if (lotti) {
      bloccaSeReferenziato(
        [plurale(lotti, 'partita già caricata', 'partite già caricate')],
        'La merce è entrata a magazzino: annullalo invece di eliminarlo.',
      )
    }
    d.acquisti.splice(d.acquisti.indexOf(a), 1)
    salva()
  },

  // ------------------------------------------------- schede di lavorazione
  /**
   * La specifica d'acquisto verso il fornitore. Vedi il tipo in
   * domain/documenti.ts per l'inquadramento: nonostante il nome, NESSUN metodo
   * di questo blocco muove il magazzino — la scheda è carta che viaggia, e i
   * punti che muovono la giacenza restano due. Un test lo verifica contando i
   * movimenti lungo tutto il ciclo di vita.
   */
  async listaSchede(
    filtri?: FiltriBase & { fornitore_id?: ID; ordine_id?: ID; articolo_id?: ID },
  ): Promise<SchedaLavorazione[]> {
    const d = db()
    let out = applicaFiltri(d.schede_lavorazione, filtri, (s) =>
      testo(s.numero, s.committente, s.fornitore_nome, s.annotazioni),
    )
    if (filtri?.fornitore_id) out = out.filter((s) => s.fornitore_id === filtri.fornitore_id)
    if (filtri?.ordine_id) out = out.filter((s) => s.ordine_id === filtri.ordine_id)
    if (filtri?.articolo_id) out = out.filter((s) => s.articolo_id === filtri.articolo_id)
    return fuori(out.slice().sort(perDataDesc))
  },

  async scheda(id: ID): Promise<SchedaLavorazione> {
    return fuori(trova(db().schede_lavorazione, id, 'Scheda di lavorazione'))
  },

  async creaScheda(input: SchedaLavorazioneInput): Promise<SchedaLavorazione> {
    const d = db()
    validaScheda(input)
    const s: SchedaLavorazione = {
      ...input,
      id: nuovoId(),
      id_esterno: null,
      // Il numero si assegna QUI, al salvataggio: una scheda aperta e
      // abbandonata non deve bruciare un numero.
      numero: prossimoNumero('SCH', d.schede_lavorazione.map((x) => x.numero)),
      // Si nasce in bozza e basta: lo stato cambia solo da `cambiaStatoScheda`,
      // che conosce le transizioni. Una scheda nata «chiusa» salterebbe
      // bozza→inviata e resterebbe immodificabile e ineliminabile dal primo
      // istante.
      stato: 'bozza',
      ...snapshotRiferimentiScheda(d, input),
      created_at: adesso(),
      updated_at: adesso(),
    }
    d.schede_lavorazione.push(s)
    salva()
    return fuori(s)
  },

  async aggiornaScheda(id: ID, input: Partial<SchedaLavorazione>): Promise<SchedaLavorazione> {
    const d = db()
    const s = trova(d.schede_lavorazione, id, 'Scheda di lavorazione')
    // `inviata` resta modificabile: col fornitore si aggiusta al telefono, e i
    // campi sono tutti della scheda, senza join che driftano.
    if (s.stato === 'chiusa' || s.stato === 'annullata') {
      throw new ErroreApi(409, `Una scheda ${s.stato} non si modifica: fanne una nuova.`)
    }
    const dopo = { ...s, ...input }
    validaScheda(dopo)
    /*
     * Gli snapshot si ricalcolano SOLO se il chiamante tocca il collegamento:
     * chi scollega a mano vuole anche togliere il nome, ma un salvataggio che
     * non parla di `ordine_id` non deve cancellare l'`ordine_numero`
     * sopravvissuto a un `eliminaOrdine`. Partono dai valori CORRENTI, mai
     * dall'input: «si copiano dal record vivo» vale anche qui — senza questa
     * base, `aggiornaScheda(id, { fornitore_nome: 'X' })` stamperebbe sul PDF
     * un destinatario che il collegamento smentisce.
     */
    const snapshot: Partial<SchedaLavorazione> = {
      fornitore_nome: s.fornitore_nome,
      ordine_numero: s.ordine_numero,
    }
    if ('fornitore_id' in input) {
      snapshot.fornitore_nome = input.fornitore_id
        ? trova(d.fornitori, input.fornitore_id, 'Fornitore').ragione_sociale
        : null
    }
    if ('ordine_id' in input) {
      snapshot.ordine_numero = input.ordine_id
        ? trova(d.ordini, input.ordine_id, 'Ordine').numero
        : null
    }
    if ('articolo_id' in input && input.articolo_id) {
      trova(d.articoli, input.articolo_id, 'Articolo')
    }
    Object.assign(s, input, {
      id: s.id,
      numero: s.numero,
      // Lo stato cambia solo da `cambiaStatoScheda`, che conosce le transizioni.
      stato: s.stato,
      // I campi tecnici non sono del form: nascono col record e restano suoi.
      created_at: s.created_at,
      id_esterno: s.id_esterno,
      ...snapshot,
      updated_at: adesso(),
    })
    salva()
    return fuori(s)
  },

  async cambiaStatoScheda(id: ID, stato: StatoScheda): Promise<SchedaLavorazione> {
    const s = trova(db().schede_lavorazione, id, 'Scheda di lavorazione')
    if (!transizioneAmmessa(TRANSIZIONI_SCHEDA, s.stato, stato)) {
      throw new ErroreApi(400, `Una scheda ${s.stato} non può passare a ${stato}.`)
    }
    s.stato = stato
    s.updated_at = adesso()
    salva()
    return fuori(s)
  },

  async eliminaScheda(id: ID): Promise<void> {
    const d = db()
    const s = trova(d.schede_lavorazione, id, 'Scheda di lavorazione')
    // Guardia a un passo, non una cassaforte: un'annullata resta eliminabile,
    // anche se prima era stata inviata. Obbliga all'annullamento esplicito —
    // niente eliminazioni accidentali — senza promettere una traccia che lo
    // stato, che non distingue da dove si arriva, non può garantire.
    if (s.stato === 'inviata' || s.stato === 'chiusa') {
      throw new ErroreApi(
        409,
        'La scheda è stata consegnata al fornitore: annullala invece di eliminarla.',
      )
    }
    d.schede_lavorazione.splice(d.schede_lavorazione.indexOf(s), 1)
    salva()
  },

  // ----------------------------------------------------------------- ricerca
  /**
   * Ricerca trasversale: un testo solo, sette collezioni.
   *
   * Sta qui e non nel componente della palette perché **è una query**, e le
   * query stanno nel server: comporre sei `lista*` nel front-end significa
   * scrivere due volte la stessa cosa, e riscriverla il giorno del backend.
   * I filtri testuali sono gli stessi delle liste — chi cerca «rovere» in
   * `Cmd+K` e chi lo cerca nel campo dei filtri deve trovare le stesse righe.
   *
   * Restituisce dati, non testo già composto: importi in centesimi e quantità
   * in millesimi, come ovunque. La formattazione è del front-end, che è l'unico
   * che sa in che lingua e con quanti decimali si sta scrivendo.
   *
   * `perGenere` limita ogni gruppo, non il totale: una palette che mostra otto
   * clienti e nessun documento non è una ricerca globale.
   */
  async ricercaGlobale(q: string, perGenere = 4): Promise<RisultatoRicerca[]> {
    const testoCercato = q.trim().toLowerCase()
    if (!testoCercato) return []
    const d = db()
    const primi = <T,>(righe: T[]): T[] => righe.slice(0, Math.max(0, perGenere))
    const contiene = (...valori: Array<string | null | undefined>) =>
      testo(...valori).includes(testoCercato)

    const out: RisultatoRicerca[] = []

    for (const c of primi(
      d.clienti
        .filter((x) =>
          contiene(x.ragione_sociale, x.codice, x.citta, x.email, x.piva, x.codice_fiscale, x.referente),
        )
        .slice()
        .sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale)),
    )) {
      out.push({
        genere: 'cliente',
        id: c.id,
        titolo: c.ragione_sociale,
        codice: c.codice,
        luogo: [c.citta, c.provincia ? `(${c.provincia})` : null].filter(Boolean).join(' ') || null,
      })
    }

    for (const a of primi(
      d.articoli
        .filter((x) => contiene(x.nome, x.codice, x.descrizione, x.ubicazione))
        .slice()
        .sort((x, y) => x.codice.localeCompare(y.codice)),
    )) {
      out.push({
        genere: 'articolo',
        id: a.id,
        titolo: `${a.codice} — ${a.nome}`,
        prezzo_listino_cents: a.prezzo_listino_cents,
        // La stessa disponibilità del selettore articolo: giacenza meno impegnato.
        disponibile_milli: Math.max(0, a.giacenza_milli - a.impegnato_milli),
        unita_misura: a.unita_misura,
      })
    }

    for (const l of primi(
      d.lotti
        .filter((x) =>
          contiene(x.codice, x.descrizione, x.provenienza_edificio, x.provenienza_localita, x.ubicazione),
        )
        .slice()
        .sort((x, y) => y.data_acquisto.localeCompare(x.data_acquisto)),
    )) {
      out.push({
        genere: 'lotto',
        id: l.id,
        titolo: `${l.codice} — ${l.descrizione}`,
        provenienza: descriviProvenienza(l),
      })
    }

    for (const p of primi(
      d.preventivi
        .filter((x) => contiene(x.numero, x.cliente_nome, x.oggetto))
        .slice()
        .sort(perDataDesc),
    )) {
      out.push({
        genere: 'preventivo',
        id: p.id,
        titolo: p.numero,
        cliente_nome: p.cliente_nome,
        totale_cents: p.totale_cents,
      })
    }

    for (const o of primi(
      d.ordini
        .filter((x) => contiene(x.numero, x.cliente_nome, x.note))
        .slice()
        .sort(perDataDesc),
    )) {
      out.push({
        genere: 'ordine',
        id: o.id,
        titolo: o.numero,
        cliente_nome: o.cliente_nome,
        totale_cents: o.totale_cents,
      })
    }

    for (const x of primi(
      d.ddt
        .filter((v) => contiene(v.numero, v.cliente_nome, v.destinazione_citta))
        .slice()
        .sort(perDataDesc),
    )) {
      out.push({
        genere: 'ddt',
        id: x.id,
        titolo: x.numero,
        cliente_nome: x.cliente_nome,
        totale_cents: x.totale_cents,
      })
    }

    for (const s of primi(
      d.schede_lavorazione
        .filter((v) => contiene(v.numero, v.committente, v.fornitore_nome, v.annotazioni))
        .slice()
        .sort(perDataDesc),
    )) {
      out.push({
        genere: 'scheda',
        id: s.id,
        titolo: s.numero,
        committente: s.committente,
        fornitore_nome: s.fornitore_nome,
      })
    }

    return fuori(out)
  },

  // --------------------------------------------------------------- riepilogo
  async riepilogo(): Promise<Riepilogo> {
    return fuori(calcolaRiepilogo())
  },
}

// ---------------------------------------------------------------------------
// Ricerca trasversale
// ---------------------------------------------------------------------------

/**
 * Una voce della ricerca globale. Unione discriminata e non un oggetto con
 * dieci campi opzionali: chi disegna la riga di un articolo ha bisogno del
 * prezzo, chi disegna quella di un DDT ha bisogno del cliente, e nessuno dei
 * due deve chiedersi se il campo che sta leggendo esiste.
 */
export type RisultatoRicerca =
  | { genere: 'cliente'; id: ID; titolo: string; codice: string; luogo: string | null }
  | {
      genere: 'articolo'
      id: ID
      titolo: string
      prezzo_listino_cents: number
      disponibile_milli: number
      unita_misura: UnitaMisura
    }
  | { genere: 'lotto'; id: ID; titolo: string; provenienza: string | null }
  | {
      genere: 'preventivo' | 'ordine' | 'ddt'
      id: ID
      titolo: string
      cliente_nome: string
      totale_cents: number
    }
  // La scheda non ha un totale: si riconosce da chi l'ha chiesta e a chi è andata.
  | {
      genere: 'scheda'
      id: ID
      titolo: string
      committente: string
      fornitore_nome: string | null
    }

// ---------------------------------------------------------------------------
// Riepilogo per la panoramica
// ---------------------------------------------------------------------------

export interface Riepilogo {
  /** Valore della merce a costo medio. Non ci sono due magazzini da sommare. */
  valore_magazzino_cents: number
  valore_articoli_cents: number
  /**
   * Da quanti giorni, in media pesata sul valore, la merce è ferma. Si conta
   * dalla data d'acquisto della partita da cui proviene.
   */
  giacenza_media_giorni: number | null
  /** Quanto di quel capitale viene da partite comprate da più di un anno. */
  valore_fermo_oltre_anno_cents: number
  /** Partite con ancora del materiale disponibile. */
  lotti_attivi: number
  articoli_sotto_scorta: number
  preventivi_aperti: number
  valore_preventivi_aperti_cents: number
  ordini_aperti: number
  valore_ordini_aperti_cents: number

  venduto_anno_cents: number
  /** Costo del venduto: quanto è costata la merce uscita con i DDT. */
  costo_venduto_anno_cents: number
  /** Venduto meno costo del venduto: il margine in euro, non in percentuale. */
  marginalita_venduto_cents: number
  /** Margine medio pesato sul venduto. Null se non si è ancora venduto niente. */
  margine_medio_percentuale: number | null

  /** Residuo da incassare su tutti gli ordini aperti e chiusi. */
  da_incassare_cents: number
  /** Quanto di quel residuo ha già superato la data di saldo. */
  scaduto_cents: number
  incassato_anno_cents: number

  mesi: Array<{ mese: string; venduto_cents: number; acquistato_cents: number }>
  /** Valore di magazzino per essenza: dove sono fermi i soldi. */
  mix_essenze: Array<{ essenza: string; valore_cents: number }>
  consegne_previste: Array<{ id: ID; numero: string; cliente: string; data: string | null; stato: string }>
}

function calcolaRiepilogo(): Riepilogo {
  const d = db()
  const oggi = oggiISO()
  const inizioAnno = `${oggi.slice(0, 4)}-01-01`

  const valoreArticoli = d.articoli.reduce(
    (t, a) => t + Math.round((a.giacenza_milli * a.costo_medio_cents) / 1000),
    0,
  )

  /*
   * Il capitale fermo si legge dalla coppia (articolo, lotto): il residuo di
   * ogni partita, valorizzato al costo medio dell'articolo, con l'anzianità
   * della partita da cui proviene.
   *
   * ⚠️ Non si somma niente a `valore_articoli_cents`: nel modello vecchio il
   * legno in catasta era un secondo magazzino da aggiungere, qui è lo STESSO
   * magazzino guardato per provenienza. Sommarlo lo conterebbe due volte.
   */
  const perLotto = new Map(d.lotti.map((l) => [l.id, l]))
  const costoMedio = new Map(d.articoli.map((a) => [a.id, a.costo_medio_cents]))
  let valoreConData = 0
  let pesoGiorni = 0
  let valoreOltreAnno = 0
  for (const voce of giacenzePerCoppia(d).values()) {
    if (!voce.lotto_id || voce.residuo_milli <= 0) continue
    const l = perLotto.get(voce.lotto_id)
    if (!l) continue
    const valore = Math.round((voce.residuo_milli * (costoMedio.get(voce.articolo_id) ?? 0)) / 1000)
    const giorni = giorniTra(l.data_acquisto, oggi)
    valoreConData += valore
    pesoGiorni += valore * giorni
    if (giorni > 365) valoreOltreAnno += valore
  }
  const giacenzaMedia = valoreConData ? Math.round(pesoGiorni / valoreConData) : null

  const preventiviAperti = d.preventivi.filter((p) => p.stato === 'inviato' || p.stato === 'bozza')
  const ordiniAperti = d.ordini.filter(
    (o) => o.stato === 'confermato' || o.stato === 'in_preparazione' || o.stato === 'evaso_parziale',
  )

  /*
   * Solo i DDT di VENDITA fanno fatturato. Una campionatura spedita a uno
   * studio, un conto visione o un reso muovono merce ma non sono ricavi:
   * contarli gonfiava il venduto di roba che nessuno ha pagato.
   */
  const vendite = d.ddt.filter(
    (x) => (x.stato === 'emesso' || x.stato === 'consegnato') && x.causale === 'vendita',
  )

  // serie mensile degli ultimi 12 mesi
  const mesi: Riepilogo['mesi'] = []
  const oggiData = new Date()
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(oggiData.getFullYear(), oggiData.getMonth() - i, 1)
    const chiave = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    const venduto = vendite
      .filter((x) => x.data.startsWith(chiave))
      .reduce((t, x) => t + x.imponibile_cents, 0)
    const acquistato = d.acquisti
      .filter((x) => x.data_ricezione?.startsWith(chiave))
      .reduce((t, x) => t + x.imponibile_cents, 0)
    mesi.push({ mese: `${chiave}-01`, venduto_cents: venduto, acquistato_cents: acquistato })
  }

  /*
   * Mix per essenza a VALORE, non a volume. Un commerciante ha in magazzino
   * metri quadri, metri lineari, metri cubi e pezzi: sommarli darebbe un
   * numero senza unità. In euro invece il confronto ha un senso — dice dove
   * sono fermi i soldi, che è la domanda.
   */
  const essenzaDi = new Map(d.articoli.map((a) => [a.id, a.essenza]))
  const perEssenza = new Map<string, number>()
  for (const a of d.articoli) {
    if (a.giacenza_milli <= 0) continue
    const essenza = essenzaDi.get(a.id) ?? 'altro'
    const valore = Math.round((a.giacenza_milli * a.costo_medio_cents) / 1000)
    perEssenza.set(essenza, (perEssenza.get(essenza) ?? 0) + valore)
  }

  /*
   * Costo del venduto dai movimenti: gli scarichi con origine `ddt` portano
   * già il valore a costo medio del giorno in cui la merce è uscita. È il modo
   * onesto di calcolarlo — ricalcolarlo oggi userebbe un costo medio che nel
   * frattempo è cambiato.
   */
  let costoVendutoAnno = 0
  for (const m of d.movimenti) {
    if (m.data < inizioAnno) continue
    if (m.origine === 'ddt' && m.tipo === 'scarico') costoVendutoAnno += m.valore_totale_cents
    if (m.origine === 'reso' && m.tipo === 'carico') costoVendutoAnno -= m.valore_totale_cents
  }
  const vendutoAnno = vendite
    .filter((x) => x.data >= inizioAnno)
    .reduce((t, x) => t + x.imponibile_cents, 0)
  const marginalita = vendutoAnno - costoVendutoAnno

  /*
   * ⚠️ Due sorgenti, come nello scadenzario — e qui la differenza si vede in
   * copertina. Contando anche i 253 ordini importati la panoramica annunciava
   * **911.210 € da incassare**: ordini vecchi di anni, quasi tutti già fatturati
   * e pagati, scoperti solo perché 57 su 253 non hanno un legame ricostruibile
   * con la loro fattura. L'esposizione vera dell'archivio sono le scadenze di
   * prima nota non saldate.
   */
  const residuoOrdiniPropri = d.ordini
    .filter((o) => !eStorico(o) && o.stato !== 'annullato')
    .reduce((t, o) => t + Math.max(0, o.totale_cents - o.incassato_cents), 0)
  const scadenzeAperte = d.scadenze.filter((s) => !s.saldato && s.verso === 'incasso')
  const daIncassare =
    residuoOrdiniPropri + scadenzeAperte.reduce((t, s) => t + s.importo_cents, 0)

  const scaduto =
    d.ordini
      .filter(
        (o) =>
          !eStorico(o) &&
          o.stato !== 'annullato' &&
          o.totale_cents - o.incassato_cents > 0 &&
          o.data_scadenza_saldo &&
          o.data_scadenza_saldo < oggi,
      )
      .reduce((t, o) => t + (o.totale_cents - o.incassato_cents), 0) +
    scadenzeAperte.filter((s) => s.data_scadenza < oggi).reduce((t, s) => t + s.importo_cents, 0)

  // Anche gli incassi hanno due registri: i pagamenti del pannello e le scadenze
  // saldate dello storico. Sommare solo i primi mostrerebbe zero su sei anni.
  const incassatoAnno =
    d.pagamenti.filter((p) => p.data >= inizioAnno).reduce((t, p) => t + p.importo_cents, 0) +
    d.scadenze
      .filter((s) => s.verso === 'incasso' && s.saldato && (s.data_pagamento ?? '') >= inizioAnno)
      .reduce((t, s) => t + s.importo_cents, 0)

  return {
    valore_magazzino_cents: valoreArticoli,
    valore_articoli_cents: valoreArticoli,
    giacenza_media_giorni: giacenzaMedia,
    valore_fermo_oltre_anno_cents: valoreOltreAnno,
    lotti_attivi: d.lotti.filter((l) => l.stato === 'disponibile').length,
    articoli_sotto_scorta: d.articoli.filter(
      (a) => a.scorta_minima_milli > 0 && a.giacenza_milli - a.impegnato_milli < a.scorta_minima_milli,
    ).length,
    preventivi_aperti: preventiviAperti.length,
    valore_preventivi_aperti_cents: preventiviAperti.reduce((t, p) => t + p.totale_cents, 0),
    ordini_aperti: ordiniAperti.length,
    valore_ordini_aperti_cents: ordiniAperti.reduce((t, o) => t + o.totale_cents, 0),
    venduto_anno_cents: vendutoAnno,
    costo_venduto_anno_cents: costoVendutoAnno,
    marginalita_venduto_cents: marginalita,
    margine_medio_percentuale: vendutoAnno ? (marginalita / vendutoAnno) * 100 : null,
    da_incassare_cents: daIncassare,
    scaduto_cents: scaduto,
    incassato_anno_cents: incassatoAnno,
    mesi,
    mix_essenze: [...perEssenza.entries()]
      .map(([essenza, valore_cents]) => ({ essenza, valore_cents }))
      .sort((a, b) => b.valore_cents - a.valore_cents),
    consegne_previste: d.ordini
      .filter((o) => o.stato === 'confermato' || o.stato === 'in_preparazione')
      .sort((a, b) => (a.data_consegna_prevista ?? '9999').localeCompare(b.data_consegna_prevista ?? '9999'))
      .slice(0, 6)
      .map((o) => ({
        id: o.id,
        numero: o.numero,
        cliente: o.cliente_nome,
        data: o.data_consegna_prevista,
        stato: o.stato,
      })),
  }
}

// ---------------------------------------------------------------------------
// Funzioni di supporto
// ---------------------------------------------------------------------------

/**
 * Quello che serve per far nascere un preventivo: il resto è derivato.
 *
 * `intestazione` non è fra questi: la copia `nascePreventivo` dall'anagrafica del
 * cliente, che è il momento giusto per farlo — il documento sta nascendo adesso.
 * Lasciarla passare da fuori vorrebbe dire permettere a una pagina di scrivere
 * sul documento un'anagrafica diversa da quella del cliente indicato.
 *
 * Nemmeno l'agente: nel pannello non c'è modo di indicarne uno, e fingere il
 * contrario nel tipo darebbe un campo che nessuno riempie mai.
 */
type IngressoPreventivo = Omit<
  Preventivo,
  | 'id'
  | 'id_esterno'
  | 'numero'
  | 'created_at'
  | 'updated_at'
  | 'imponibile_cents'
  | 'iva_cents'
  | 'totale_cents'
  | 'data_scadenza'
  | 'intestazione'
  | 'agente_nome'
  | 'provvigione_cents'
>

/**
 * Nascita di un preventivo, in un posto solo.
 *
 * La usano in tre — creazione, duplicazione e «rifai come preventivo» — perché
 * la regola su ciò che un documento nuovo NON eredita deve essere una sola:
 * numero, date, stato e collegamenti sono storia del documento vecchio.
 *
 * Gli id delle righe si rigenerano SEMPRE. Le righe arrivano da fuori — una
 * copia, un ordine, un form — e due documenti che condividono l'id di una riga
 * sono una bomba a orologeria: modificarne una toccherebbe l'altra il giorno in
 * cui il backend le indicizzerà davvero. Gli identificativi li assegna chi
 * scrive, cioè questo file; domani sarà il database.
 */
function nascePreventivo(input: IngressoPreventivo): Preventivo {
  const d = db()
  const cliente = trova(d.clienti, input.cliente_id, 'Cliente')
  const p: Preventivo = {
    ...input,
    righe: input.righe.map((r) => ({ ...r, id: nuovoId() })),
    id: nuovoId(),
    id_esterno: null,
    numero: prossimoNumero('PRV', d.preventivi.map((x) => x.numero)),
    cliente_nome: cliente.ragione_sociale,
    intestazione: intestazioneDa(cliente),
    agente_nome: null,
    provvigione_cents: 0,
    imponibile_cents: 0,
    iva_cents: 0,
    totale_cents: 0,
    data_scadenza: aggiungiGiorni(input.data, input.validita_giorni),
    created_at: adesso(),
    updated_at: adesso(),
  }
  ricalcolaTotaliVendita(p)
  d.preventivi.push(p)
  salva()
  return p
}

function validaCliente(input: ClienteInput): void {
  if (!input.ragione_sociale?.trim()) {
    throw new ErroreApi(400, 'La ragione sociale è obbligatoria.')
  }
  if (input.tipo === 'azienda' && !input.piva?.trim()) {
    throw new ErroreApi(400, 'Per un cliente azienda la partita IVA è obbligatoria.')
  }
  if (input.tipo === 'privato' && !input.codice_fiscale?.trim()) {
    throw new ErroreApi(400, 'Per un cliente privato il codice fiscale è obbligatorio.')
  }
}

function validaPagamento(input: PagamentoInput): { cliente: Cliente; ordine: Ordine | null } {
  const d = db()
  const cliente = trova(d.clienti, input.cliente_id, 'Cliente')
  if (!input.importo_cents) throw new ErroreApi(400, 'L’importo del pagamento non può essere zero.')
  if (!input.data) throw new ErroreApi(400, 'La data del pagamento è obbligatoria.')
  if (input.tipo === 'nota_credito' && input.importo_cents > 0) {
    throw new ErroreApi(400, 'Una nota di credito ha importo negativo: è uno storno, non un incasso.')
  }
  if (input.tipo !== 'nota_credito' && input.importo_cents < 0) {
    throw new ErroreApi(400, 'Un incasso ha importo positivo. Per uno storno usa la nota di credito.')
  }
  let ordine: Ordine | null = null
  if (input.ordine_id) {
    ordine = trova(d.ordini, input.ordine_id, 'Ordine')
    if (ordine.cliente_id !== cliente.id) {
      throw new ErroreApi(400, `L’ordine ${ordine.numero} è intestato a un altro cliente.`)
    }
  }
  return { cliente, ordine }
}

/** Provenienza in una riga sola, per i selettori e le liste. */
function descriviProvenienza(l: Lotto): string | null {
  const luogo = [l.provenienza_localita, l.provenienza_provincia ? `(${l.provenienza_provincia})` : null]
    .filter(Boolean)
    .join(' ')
  const parti = [l.provenienza_edificio, luogo || null].filter(Boolean)
  return parti.length ? parti.join(' — ') : null
}

export interface VoceGiacenzaLotto {
  articolo_id: ID
  codice: string
  nome: string
  unita_misura: UnitaMisura
  caricato_milli: number
  residuo_milli: number
  valore_residuo_cents: number
}

function giacenzeDelLotto(lottoId: ID): VoceGiacenzaLotto[] {
  const d = db()
  const out: VoceGiacenzaLotto[] = []
  for (const voce of giacenzePerCoppia(d).values()) {
    if (voce.lotto_id !== lottoId) continue
    const a = d.articoli.find((x) => x.id === voce.articolo_id)
    if (!a) continue
    out.push({
      articolo_id: a.id,
      codice: a.codice,
      nome: a.nome,
      unita_misura: a.unita_misura,
      caricato_milli: voce.caricato_milli,
      residuo_milli: voce.residuo_milli,
      valore_residuo_cents: Math.round((Math.max(0, voce.residuo_milli) * a.costo_medio_cents) / 1000),
    })
  }
  return out.sort((x, y) => x.codice.localeCompare(y.codice))
}

/**
 * ⚠️ **I documenti importati non si ricalcolano.**
 *
 * Il totale di un documento storico è quello che il cliente ha firmato e che è
 * finito in contabilità, non quello che rifaremmo noi da quantità × prezzo. Sui
 * dati importati le due cose possono non coincidere: imponibile esplicito,
 * quantità senza prezzo o sconti scritti in negativo.
 *
 * Senza questa guardia bastava **aprire e salvare** un ordine del 2022 perché ne
 * cambiasse il totale — in silenzio, senza che nessuna schermata lo dicesse. È
 * il modo più economico che conosca per corrompere un archivio.
 *
 * Vale per tutt'e tre le funzioni qui sotto, e un test lo dimostra.
 */
function ricalcolaTotaliVendita(doc: Preventivo | Ordine): void {
  if (eStorico(doc)) return
  for (const r of doc.righe) {
    r.imponibile_cents = imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, r.sconto_percentuale)
  }
  const t = totaliDocumento(doc.righe, doc.sconto_generale_percentuale)
  doc.imponibile_cents = t.imponibile_cents
  doc.iva_cents = t.iva_cents
  doc.totale_cents = t.totale_cents
}

function ricalcolaTotaliDdt(doc: DDT): void {
  if (eStorico(doc)) return
  for (const r of doc.righe) {
    r.imponibile_cents = imponibileRiga(
      r.quantita_milli,
      r.prezzo_unitario_cents,
      r.sconto_percentuale,
    )
  }
  const t = totaliDocumento(doc.righe, doc.sconto_generale_percentuale)
  doc.imponibile_cents = t.imponibile_cents
  doc.iva_cents = t.iva_cents
  doc.totale_cents = t.totale_cents
  doc.colli_totali = doc.righe.reduce((s, r) => s + r.colli, 0) || doc.colli_totali
  doc.peso_totale_kg_milli = doc.righe.reduce((s, r) => s + r.peso_kg_milli, 0) || doc.peso_totale_kg_milli
}

function ricalcolaTotaliAcquisto(a: OrdineAcquisto): void {
  if (eStorico(a)) return
  for (const r of a.righe) {
    r.imponibile_cents = imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, 0)
  }
  const t = totaliDocumento(a.righe, 0)
  const aliquota = a.righe[0]?.aliquota_iva ?? 22
  a.imponibile_cents = t.imponibile_cents + a.spese_trasporto_cents
  a.iva_cents = t.iva_cents + Math.round((a.spese_trasporto_cents * aliquota) / 100)
  a.totale_cents = a.imponibile_cents + a.iva_cents
}

function numeroOrdine(ordineId: ID | null): string {
  if (!ordineId) return 'collegato'
  return db().ordini.find((o) => o.id === ordineId)?.numero ?? 'collegato'
}

/** Le regole che una scheda deve rispettare per essere salvata, nuova o no. */
function validaScheda(s: {
  committente: string
  larghezza_da_mm: number | null
  larghezza_a_mm: number | null
  lunghezza_da_mm: number | null
  lunghezza_a_mm: number | null
  quantita_milli: number | null
  unita_misura: UnitaMisura | null
}): void {
  if (!s.committente?.trim()) {
    throw new ErroreApi(400, 'Il committente è obbligatorio: è la prima riga del modulo.')
  }
  if (s.larghezza_da_mm !== null && s.larghezza_a_mm !== null && s.larghezza_da_mm > s.larghezza_a_mm) {
    throw new ErroreApi(400, 'La larghezza minima è maggiore della massima.')
  }
  if (s.lunghezza_da_mm !== null && s.lunghezza_a_mm !== null && s.lunghezza_da_mm > s.lunghezza_a_mm) {
    throw new ErroreApi(400, 'La lunghezza minima è maggiore della massima.')
  }
  if (s.quantita_milli !== null && s.quantita_milli <= 0) {
    throw new ErroreApi(400, 'La quantità, se c’è, dev’essere maggiore di zero.')
  }
  // La coppia non si spezza: il PDF stampa la voce QUANTITÀ solo completa, e
  // «100» senza unità sparirebbe in silenzio dal modulo consegnato al
  // fornitore. Il check falsy copre anche la '' che una select può scrivere.
  if (s.quantita_milli !== null && !s.unita_misura) {
    throw new ErroreApi(400, 'La quantità ha bisogno della sua unità di misura.')
  }
}

/**
 * Alla NASCITA della scheda: verifica i riferimenti e congela gli snapshot.
 *
 * `fornitore_nome` e `ordine_numero` si copiano dal record vivo — mai dal
 * client. L'articolo si verifica soltanto: sulla scheda non ne resta il nome,
 * le specifiche sono già state copiate nei campi. Per gli aggiornamenti vale
 * una regola diversa (vedi `aggiornaScheda`): lo snapshot si ricalcola solo se
 * il chiamante tocca il collegamento.
 */
function snapshotRiferimentiScheda(
  d: ReturnType<typeof db>,
  s: { fornitore_id: ID | null; ordine_id: ID | null; articolo_id: ID | null },
): { fornitore_nome: string | null; ordine_numero: string | null } {
  if (s.articolo_id) trova(d.articoli, s.articolo_id, 'Articolo')
  return {
    fornitore_nome: s.fornitore_id
      ? trova(d.fornitori, s.fornitore_id, 'Fornitore').ragione_sociale
      : null,
    ordine_numero: s.ordine_id ? trova(d.ordini, s.ordine_id, 'Ordine').numero : null,
  }
}

function arricchisciCliente(c: Cliente): ClienteConTotali {
  const d = db()
  const ordini = d.ordini.filter((o) => o.cliente_id === c.id)
  return {
    ...c,
    preventivi_aperti: d.preventivi.filter(
      (p) => p.cliente_id === c.id && (p.stato === 'inviato' || p.stato === 'bozza'),
    ).length,
    ordini_aperti: ordini.filter(
      (o) => o.stato === 'confermato' || o.stato === 'in_preparazione' || o.stato === 'evaso_parziale',
    ).length,
    // Solo le vendite: campionature e conti visione non sono fatturato.
    fatturato_cents: d.ddt
      .filter(
        (x) =>
          x.cliente_id === c.id &&
          x.causale === 'vendita' &&
          (x.stato === 'emesso' || x.stato === 'consegnato'),
      )
      .reduce((t, x) => t + x.imponibile_cents, 0),
    ultimo_ordine: ordini.map((o) => o.data).sort().pop() ?? null,
  }
}

function arricchisciFornitore(f: Fornitore): FornitoreConTotali {
  const d = db()
  const lotti = d.lotti.filter((l) => l.fornitore_id === f.id)
  return {
    ...f,
    lotti_conferiti: lotti.length,
    speso_cents: lotti.reduce((t, l) => t + l.costo_acquisto_cents, 0),
    ultimo_acquisto: lotti.map((l) => l.data_acquisto).sort().pop() ?? null,
  }
}
