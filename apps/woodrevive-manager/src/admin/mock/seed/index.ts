/**
 * Costruzione del seed.
 *
 * Due principi:
 *
 * 1. **I numeri non si scrivono a mano.** Gli imponibili di riga, i totali dei
 *    documenti, il costo delle partite e gli importi dei saldi si ricalcolano
 *    con le stesse funzioni dell'applicazione. Un seed con i totali digitati
 *    diverge dal codice al primo cambio di formula, e poi si passa un
 *    pomeriggio a capire perché la demo non torna.
 *
 * 2. **I movimenti si derivano dai fatti.** Nessun movimento è scritto nel seed:
 *    li genera `generaMovimenti()` da inventario iniziale, acquisti ricevuti e
 *    DDT emessi, in ordine cronologico, come farebbe l'applicazione. Così
 *    l'invariante `giacenza = Σ movimenti` vale per costruzione e non per
 *    fortuna, e lo stesso vale per la giacenza per coppia (articolo, lotto).
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
} from '../../domain'
import { intestazioneDa, naturaFiscaleDa } from '../../domain'
import { imponibileRiga, ripartisci, totaliDocumento } from '../../lib/money'
import { aggiungiGiorni } from '../../lib/format'

import { clienti, fornitori } from './anagrafiche'
import { articoli } from './catalogo'
import type { Seme, SemeDocumento } from './comuni'
import { ms } from './comuni'
import { costruisciPagamenti } from './incassi'
import { dataInventarioIniziale, inventarioIniziale, lotti } from './magazzino'
import { schede } from './schede'
import { acquisti, ddt, ordini, preventivi } from './vendite'

// ---------------------------------------------------------------------------
// Ricalcolo degli importi dei documenti
// ---------------------------------------------------------------------------

function ricalcolaVendita(doc: Preventivo | Ordine): void {
  for (const r of doc.righe) {
    r.imponibile_cents = imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, r.sconto_percentuale)
  }
  const t = totaliDocumento(doc.righe, doc.sconto_generale_percentuale)
  doc.imponibile_cents = t.imponibile_cents
  doc.iva_cents = t.iva_cents
  doc.totale_cents = t.totale_cents
}

function ricalcolaDdt(d: DDT): void {
  for (const r of d.righe) {
    r.imponibile_cents = imponibileRiga(
      r.quantita_milli,
      r.prezzo_unitario_cents,
      r.sconto_percentuale,
    )
  }
  const t = totaliDocumento(d.righe, d.sconto_generale_percentuale)
  d.imponibile_cents = t.imponibile_cents
  d.iva_cents = t.iva_cents
  d.totale_cents = t.totale_cents
}

function ricalcolaAcquisto(a: OrdineAcquisto): void {
  for (const r of a.righe) {
    r.imponibile_cents = imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, 0)
  }
  const t = totaliDocumento(a.righe, 0)
  // il trasporto è imponibile a sua volta, con l'aliquota della prima riga
  const aliquotaTrasporto = a.righe[0]?.aliquota_iva ?? 22
  a.imponibile_cents = t.imponibile_cents + a.spese_trasporto_cents
  a.iva_cents = t.iva_cents + Math.round((a.spese_trasporto_cents * aliquotaTrasporto) / 100)
  a.totale_cents = a.imponibile_cents + a.iva_cents
}

/**
 * Costo della partita: quanto è costata la fornitura da cui è nata, trasporto
 * compreso. Non è un numero indipendente — è l'imponibile dell'ordine di
 * acquisto — e scriverlo a mano nel seed vorrebbe dire poterlo sbagliare.
 */
function assegnaCostiLotti(lottiSeed: Lotto[], acquistiSeed: OrdineAcquisto[]): void {
  const perId = new Map(acquistiSeed.map((a) => [a.id, a]))
  for (const l of lottiSeed) {
    const a = l.ordine_acquisto_id ? perId.get(l.ordine_acquisto_id) : undefined
    if (!a) continue
    l.costo_acquisto_cents = a.imponibile_cents // righe + trasporto
  }
}

// ---------------------------------------------------------------------------
// Generazione dei movimenti di magazzino
// ---------------------------------------------------------------------------

/** Un movimento come lo dichiara il seed: id, tracce e origine li mette `aggiungi`. */
type SemeMovimento = Omit<
  MovimentoMagazzino,
  'id' | 'created_at' | 'updated_at' | 'id_esterno'
>

interface EventoMagazzino {
  data: string
  ordinamento: number
  crea: (mov: (m: SemeMovimento) => void) => void
}

/**
 * Costruisce il libro giornale ripercorrendo la storia in ordine di data.
 * Tiene traccia del costo medio corrente per articolo, così gli scarichi
 * escono valorizzati come li valorizzerebbe l'applicazione.
 */
function generaMovimenti(articoliDb: Articolo[], acquistiDb: OrdineAcquisto[]): MovimentoMagazzino[] {
  const movimenti: MovimentoMagazzino[] = []
  const perId = new Map<ID, Articolo>(articoliDb.map((a) => [a.id, a]))
  const perLotto = new Map<ID, Seme<Lotto>>(lotti.map((l) => [l.id, l]))
  const stato = new Map<ID, { qta: number; costo: number }>()

  let seq = 0
  const aggiungi = (m: SemeMovimento) => {
    seq += 1
    movimenti.push({
      ...m,
      id: `mov-${String(seq).padStart(4, '0')}`,
      id_esterno: null,
      ...{ created_at: ms(m.data), updated_at: ms(m.data) },
    })
    if (!m.articolo_id) return
    const corrente = stato.get(m.articolo_id) ?? { qta: 0, costo: 0 }
    const delta = m.tipo === 'scarico' ? -m.quantita_milli : m.quantita_milli
    if (delta > 0) {
      const nuova = corrente.qta + delta
      corrente.costo =
        nuova > 0
          ? Math.round((corrente.qta * corrente.costo + delta * m.valore_unitario_cents) / nuova)
          : m.valore_unitario_cents
    }
    corrente.qta += delta
    stato.set(m.articolo_id, corrente)
  }

  const costoMedioDi = (articoloId: ID): number => stato.get(articoloId)?.costo ?? 0

  const eventi: EventoMagazzino[] = []

  // 1) inventario iniziale: quello che c'era il giorno dell'avvio.
  //    Nessun lotto: è merce di cui non si sa più la provenienza, e dichiararne
  //    una a caso sarebbe peggio che ammetterlo.
  eventi.push({
    data: dataInventarioIniziale,
    ordinamento: 0,
    crea: (mov) => {
      for (const [articoloId, quantita, valore] of inventarioIniziale) {
        mov({
          data: dataInventarioIniziale,
          tipo: 'rettifica',
          origine: 'inventario',
          articolo_id: articoloId,
          lotto_id: null,
          quantita_milli: quantita,
          unita_misura: perId.get(articoloId)?.unita_misura ?? 'mq',
          valore_unitario_cents: valore,
          valore_totale_cents: Math.round((quantita * valore) / 1000),
          documento_tipo: 'rettifica',
          documento_id: null,
          documento_numero: null,
          causale: 'Inventario iniziale all’avvio del gestionale',
          note: null,
        })
      }
    },
  })

  // 2) ricezione degli acquisti: un carico di ARTICOLO per riga, con il lotto
  //    addosso e la quota di trasporto già dentro il costo unitario.
  for (const a of acquistiDb) {
    if (!a.data_ricezione) continue
    const righeRicevute = a.righe.filter((r) => r.lotto_id)
    if (!righeRicevute.length) continue

    eventi.push({
      data: a.data_ricezione,
      ordinamento: 1,
      crea: (mov) => {
        const quote = ripartisci(a.spese_trasporto_cents, righeRicevute.map((r) => r.imponibile_cents))
        righeRicevute.forEach((r, idx) => {
          const costo = r.imponibile_cents + quote[idx]
          const l = r.lotto_id ? perLotto.get(r.lotto_id) : undefined
          mov({
            data: a.data_ricezione!,
            tipo: 'carico',
            origine: 'acquisto',
            articolo_id: r.articolo_id,
            lotto_id: r.lotto_id,
            quantita_milli: r.quantita_milli,
            unita_misura: r.unita_misura,
            valore_unitario_cents: Math.round((costo * 1000) / r.quantita_milli),
            valore_totale_cents: costo,
            documento_tipo: 'ordine_acquisto',
            documento_id: a.id,
            documento_numero: a.numero,
            causale: `Ricezione ${a.numero} — ${l ? `${l.codice} ${l.descrizione}` : r.descrizione}`,
            note: null,
          })
        })
      },
    })
  }

  // 3) DDT emessi
  for (const d of ddt) {
    if (d.stato !== 'emesso' && d.stato !== 'consegnato') continue
    eventi.push({
      data: d.data_trasporto,
      ordinamento: 2,
      crea: (mov) => {
        for (const r of d.righe) {
          // Solo la merce a catalogo muove il magazzino, come in `emettiDdt`.
          if (!r.articolo_id) continue
          const unitario = costoMedioDi(r.articolo_id)
          mov({
            data: d.data_trasporto,
            tipo: 'scarico',
            origine: 'ddt',
            articolo_id: r.articolo_id,
            lotto_id: r.lotto_id,
            quantita_milli: r.quantita_milli,
            unita_misura: r.unita_misura,
            valore_unitario_cents: unitario,
            valore_totale_cents: Math.round((r.quantita_milli * unitario) / 1000),
            documento_tipo: 'ddt',
            documento_id: d.id,
            documento_numero: d.numero,
            causale: `Consegna ${d.numero} — ${d.cliente_nome}`,
            note: null,
          })
        }
      },
    })
  }

  eventi
    .sort((a, b) => (a.data === b.data ? a.ordinamento - b.ordinamento : a.data.localeCompare(b.data)))
    .forEach((e) => e.crea(aggiungi))

  return movimenti
}

// ---------------------------------------------------------------------------
// Assemblaggio
// ---------------------------------------------------------------------------

/**
 * Marca un record come nato in questo gestionale.
 *
 * `id_esterno: null` non è un riempitivo: è ciò che distingue un dato
 * dimostrativo da uno importato dal vecchio gestionale, e il codice ci conta
 * (vedi `eStorico` in domain/comuni.ts).
 */
const interno = <T,>(x: Seme<T>): T => ({ ...x, id_esterno: null }) as T

/**
 * Completa un documento dimostrativo con l'intestazione copiata dalla scheda del
 * cliente e senza agente. Vedi `SemeDocumento` per il perché si può fare **solo
 * nel seed**.
 */
function documentoInterno<T extends { cliente_id: ID }>(x: SemeDocumento<T>): T {
  const c = clienti.find((k) => k.id === x.cliente_id)
  if (!c) throw new Error(`Seed incoerente: il cliente ${x.cliente_id} non esiste`)
  return {
    ...x,
    id_esterno: null,
    agente_nome: null,
    provvigione_cents: 0,
    intestazione: intestazioneDa(c),
  } as unknown as T
}

export function costruisciSeed(): {
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
  fatture: Fattura[]
  fatture_acquisto: FatturaAcquisto[]
  scadenze: Scadenza[]
  schede_lavorazione: SchedaLavorazione[]
} {
  // copia profonda: il seed è un modulo condiviso, il DB deve poterlo mutare
  const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

  const seedArticoli: Articolo[] = copia(articoli).map(interno<Articolo>)
  const seedLotti: Lotto[] = copia(lotti).map(interno<Lotto>)
  const seedPreventivi: Preventivo[] = copia(preventivi).map(documentoInterno<Preventivo>)
  const seedOrdini: Ordine[] = copia(ordini).map(documentoInterno<Ordine>)
  const seedDdt: DDT[] = copia(ddt).map(documentoInterno<DDT>)
  const seedAcquisti: OrdineAcquisto[] = copia(acquisti).map(interno<OrdineAcquisto>)

  for (const p of seedPreventivi) {
    ricalcolaVendita(p)
    p.data_scadenza = aggiungiGiorni(p.data, p.validita_giorni)
  }
  seedOrdini.forEach(ricalcolaVendita)
  seedDdt.forEach(ricalcolaDdt)
  seedAcquisti.forEach(ricalcolaAcquisto)
  assegnaCostiLotti(seedLotti, seedAcquisti)

  return {
    // la natura fiscale si deriva con la stessa funzione che usa l'import:
    // un soggetto si classifica in un modo solo
    clienti: copia(clienti).map((c) => ({
      ...interno<Cliente>({ ...c, natura_fiscale: naturaFiscaleDa(c.piva, c.codice_fiscale) }),
    })),
    fornitori: copia(fornitori).map((f) => ({
      ...interno<Fornitore>({ ...f, natura_fiscale: naturaFiscaleDa(f.piva, f.codice_fiscale) }),
    })),
    articoli: seedArticoli,
    lotti: seedLotti,
    movimenti: generaMovimenti(seedArticoli, seedAcquisti),
    preventivi: seedPreventivi,
    ordini: seedOrdini,
    ddt: seedDdt,
    acquisti: seedAcquisti,
    // i saldi si calcolano sui totali appena ricalcolati, non su numeri fissi
    pagamenti: costruisciPagamenti(seedOrdini).map(interno<Pagamento>),
    // La demo si ferma al DDT: mostra il ciclo commerciale, non la contabilità.
    // Le fatture dimostrative arriveranno con le loro pagine; finché non ci sono,
    // dichiararle vuote è più onesto che inventarne tre per riempire una lista.
    fatture: [],
    fatture_acquisto: [],
    scadenze: [],
    // Le schede sono piatte e senza intestazione: basta `interno`.
    schede_lavorazione: copia(schede).map(interno<SchedaLavorazione>),
  }
}
