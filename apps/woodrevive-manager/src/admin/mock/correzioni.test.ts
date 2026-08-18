/**
 * Test delle correzioni emerse dagli audit di dominio.
 *
 * Ognuno di questi copre un errore che il gestionale ha davvero commesso e che
 * nessun test prendeva. Stanno insieme, e non sparsi, perché raccontano una
 * cosa sola: dove il modello aveva sbagliato a contare.
 *
 * I primi due gruppi vengono dalla correzione di rotta del luglio 2026, quando
 * si è scoperto che Wood Revive non lavora il legno ma lo compra e lo rivende:
 * il magazzino ha smesso di avere due verità sovrapposte (gli articoli e le
 * cataste) e la provenienza è diventata un fatto verificabile.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { mockApi as api } from './mockApi'
import {
  SEED_VERSION,
  esportaDb,
  giacenzePerCoppia,
  verificaInvarianteGiacenze,
  verificaInvarianteLotti,
} from './db'

beforeEach(async () => {
  await api.ripristina()
})

describe('il magazzino ha una verità sola', () => {
  it('non conta due volte la merce: il valore è quello degli articoli', async () => {
    const r = await api.riepilogo()
    expect(r.valore_magazzino_cents).toBe(r.valore_articoli_cents)
    expect(r.valore_magazzino_cents).toBeGreaterThan(0)
  })

  it('ogni movimento ha un articolo: niente carichi che nessuna giacenza racconta', async () => {
    // Nel modello vecchio il carico del lotto aveva `articolo_id: null` e
    // `verificaInvarianteGiacenze` lo saltava: era valore in magazzino che
    // nessun controllo sorvegliava.
    const db = esportaDb()
    const orfani = db.movimenti.filter((m) => !m.articolo_id)
    expect(orfani.map((m) => m.causale)).toEqual([])
  })

  it('misura da quanto tempo la merce è ferma, partendo dalla data d acquisto', async () => {
    const r = await api.riepilogo()
    expect(r.giacenza_media_giorni).not.toBeNull()
    expect(r.giacenza_media_giorni!).toBeGreaterThan(0)
  })
})

describe('la provenienza è un fatto, non una dichiarazione', () => {
  it('ogni riga di DDT con un lotto ha alle spalle un carico di quel lotto', async () => {
    const db = esportaDb()
    const coppie = giacenzePerCoppia(db)
    let controllate = 0
    for (const d of db.ddt) {
      if (d.stato !== 'emesso' && d.stato !== 'consegnato') continue
      for (const r of d.righe) {
        if (!r.lotto_id) continue
        const voce = coppie.get(`${r.articolo_id}|${r.lotto_id}`)
        expect(voce, `${d.numero}: ${r.descrizione}`).toBeDefined()
        expect(voce!.caricato_milli).toBeGreaterThanOrEqual(r.quantita_milli)
        controllate++
      }
    }
    expect(controllate).toBeGreaterThan(0)
  })

  it('nessuna partita risulta svuotata oltre quello che conteneva', () => {
    expect(verificaInvarianteLotti(esportaDb())).toEqual([])
  })

  it('lo stato del lotto segue il residuo invece di restare fermo per sempre', async () => {
    // Nel modello vecchio lo stato scendeva a `esaurito` sommando i consumi di
    // lavorazione: tolte quelle, senza una derivazione nuova ogni partita
    // sarebbe rimasta `disponibile` per sempre e lo stato avrebbe mentito.

    // 1. una partita nuova, appena arrivata, è disponibile
    const acquisto = (await api.listaAcquisti()).find((a) => a.stato === 'confermato')!
    const riga = acquisto.righe[0]
    const { lotto } = await api.ricevalAcquisto(acquisto.id, {})
    expect(lotto.stato).toBe('disponibile')

    // 2. la si svuota con una consegna che dichiara proprio quella partita
    const bozza = (await api.listaDdt()).find((d) => d.stato === 'bozza')!
    await api.aggiornaDdt(bozza.id, {
      righe: [
        {
          ...bozza.righe[0],
          articolo_id: riga.articolo_id,
          lotto_id: lotto.id,
          lotto_codice: lotto.codice,
          quantita_milli: riga.quantita_milli,
          unita_misura: riga.unita_misura,
        },
      ],
    })
    await api.emettiDdt(bozza.id)

    // 3. nessuno ha scritto lo stato: lo dice il residuo
    expect((await api.lotto(lotto.id)).stato).toBe('esaurito')
    expect((await api.giacenzePerLotto(lotto.id))[0].residuo_milli).toBe(0)
    expect(verificaInvarianteLotti(esportaDb())).toEqual([])
  })
})

describe('la causale del DDT decide il verso del movimento', () => {
  it('un DDT di reso carica il magazzino invece di scaricarlo', async () => {
    const articoli = await api.listaArticoli()
    const articolo = articoli.find((a) => a.stadio === 'finito' && a.giacenza_milli > 0)!
    const prima = articolo.giacenza_milli

    const bozza = (await api.listaDdt()).find((d) => d.stato === 'bozza')!
    await api.aggiornaDdt(bozza.id, {
      causale: 'reso',
      righe: [
        {
          ...bozza.righe[0],
          articolo_id: articolo.id,
          quantita_milli: 5000,
          unita_misura: articolo.unita_misura,
        },
      ],
    })
    await api.emettiDdt(bozza.id)

    const dopo = await api.articolo(articolo.id)
    expect(dopo.giacenza_milli).toBe(prima + 5000)
    expect(verificaInvarianteGiacenze(esportaDb())).toEqual([])
  })

  it('un reso non pretende la giacenza: la merce sta rientrando', async () => {
    const articoli = await api.listaArticoli()
    const vuoto = articoli.find((a) => a.giacenza_milli === 0)!
    const bozza = (await api.listaDdt()).find((d) => d.stato === 'bozza')!

    await api.aggiornaDdt(bozza.id, {
      causale: 'reso',
      righe: [{ ...bozza.righe[0], articolo_id: vuoto.id, quantita_milli: 3000, unita_misura: vuoto.unita_misura }],
    })
    await expect(api.emettiDdt(bozza.id)).resolves.toBeDefined()
  })

  it('un reso non fa avanzare l’evasione dell’ordine', async () => {
    const bozza = (await api.listaDdt()).find((d) => d.stato === 'bozza')!
    const ordineId = bozza.ordine_id!
    const statoPrima = (await api.ordine(ordineId)).stato

    await api.aggiornaDdt(bozza.id, { causale: 'reso' })
    await api.emettiDdt(bozza.id)

    expect((await api.ordine(ordineId)).stato).toBe(statoPrima)
  })
})

describe('solo le vendite fanno fatturato', () => {
  it('non conta campionature e conti visione nel venduto', async () => {
    const prima = await api.riepilogo()

    const bozza = (await api.listaDdt()).find((d) => d.stato === 'bozza')!
    await api.aggiornaDdt(bozza.id, { causale: 'campionatura' })
    await api.emettiDdt(bozza.id)

    const dopo = await api.riepilogo()
    expect(dopo.venduto_anno_cents).toBe(prima.venduto_anno_cents)
  })
})

describe('il DDT vale quanto è stato pattuito', () => {
  it('eredita lo sconto generale dell’ordine', async () => {
    const ordini = await api.listaOrdini()
    const scontato = ordini.find((o) => o.sconto_generale_percentuale > 0 && o.stato !== 'evaso')

    if (!scontato) {
      // se nel seed non ci sono ordini scontati aperti, il caso lo copre il DDT del seed
      const ddt = (await api.listaDdt()).find((d) => d.sconto_generale_percentuale > 0)!
      expect(ddt.imponibile_cents).toBeLessThan(
        ddt.righe.reduce((s, r) => s + r.quantita_milli * (r.prezzo_unitario_cents / 1000), 0),
      )
      return
    }

    const ddt = await api.creaDdtDaOrdine(scontato.id)
    expect(ddt.sconto_generale_percentuale).toBe(scontato.sconto_generale_percentuale)
  })
})

describe('un ordine evaso non si riapre dal form', () => {
  it('rifiuta la modifica delle righe di un ordine evaso', async () => {
    const evaso = (await api.listaOrdini()).find((o) => o.stato === 'evaso')!
    await expect(api.aggiornaOrdine(evaso.id, { righe: evaso.righe })).rejects.toThrow(
      /non si modificano/,
    )
  })

  it('lascia però modificare acconto, scadenza del saldo e note', async () => {
    const evaso = (await api.listaOrdini()).find((o) => o.stato === 'evaso')!
    const dopo = await api.aggiornaOrdine(evaso.id, {
      acconto_cents: 12345,
      data_scadenza_saldo: '2026-12-31',
      note: 'Saldo rinegoziato',
    })
    expect(dopo.acconto_cents).toBe(12345)
    expect(dopo.data_scadenza_saldo).toBe('2026-12-31')
  })
})

describe('la posa si vende ma non entra in magazzino', () => {
  // Wood Revive subappalta la posa e il trasporto: sono righe da fatturare, e
  // il divieto non è «non esistono» ma «non sono merce». Questo è il test che
  // rende quel confine verificabile invece che dichiarato.
  it('rifiuta la ricezione di una riga d’acquisto che non è merce', async () => {
    const fornitore = (await api.listaFornitori())[0]
    const servizio = await api.creaArticolo({
      nome: 'Posa pavimenti su massetto esistente',
      descrizione: 'Subappaltata a un posatore terzo, rifatturata al cliente.',
      natura: 'servizio_terzi',
      gestione_magazzino: false,
      stadio: 'finito',
      categoria: 'pavimento',
      essenza: null,
      patina: null,
      spessore_mm: null,
      larghezza_min_mm: null,
      larghezza_max_mm: null,
      lunghezza_min_mm: null,
      lunghezza_max_mm: null,
      unita_misura: 'mq',
      mc_per_unita_milli: null,
      prezzo_acquisto_cents: 2000,
      prezzo_listino_cents: 2800,
      aliquota_iva: 22,
      scorta_minima_milli: 0,
      ubicazione: null,
      attivo: true,
      note: null,
    })

    const acquisto = await api.creaAcquisto({
      data: '2026-07-01',
      fornitore_id: fornitore.id,
      fornitore_nome: fornitore.ragione_sociale,
      righe: [
        {
          id: 'riga-posa',
          articolo_id: servizio.id,
          codice_articolo: servizio.codice,
          descrizione: servizio.nome,
          quantita_milli: 50000,
          unita_misura: 'mq',
          prezzo_unitario_cents: 2000,
          aliquota_iva: 22,
          imponibile_cents: 0,
          lotto_id: null,
          note: null,
        },
      ],
      spese_trasporto_cents: 0,
      data_consegna_prevista: null,
      data_ricezione: null,
      stato: 'confermato',
      note: null,
    })

    await expect(api.ricevalAcquisto(acquisto.id, {})).rejects.toThrow(
      /non merce: si fattura, ma non entra a magazzino/,
    )

    // E il magazzino è rimasto fermo: nessun movimento, nessuna giacenza.
    const movimenti = await api.listaMovimenti({ articolo_id: servizio.id })
    expect(movimenti).toEqual([])
    expect((await api.articolo(servizio.id)).giacenza_milli).toBe(0)
  })
})

/**
 * I documenti importati dal vecchio gestionale portano i totali che sono stati
 * firmati e registrati in contabilità. Il pannello non li ricalcola.
 *
 * Una sorgente può contenere imponibili non ricostruibili da quantità e prezzo,
 * quantità senza prezzo o sconti come importi negativi. Ricalcolarli
 * riscriverebbe il documento.
 */
describe('i documenti storici non si ricalcolano', () => {
  /** Un DB con dentro un ordine storico il cui totale NON torna dalle righe. */
  async function conOrdineStorico() {
    const db = esportaDb()
    const modello = db.ordini[0]
    // 100,00 € scritti sul documento contro 1,00 € che il ricalcolo otterrebbe:
    // una differenza che nessun arrotondamento può spiegare.
    const storico = {
      ...modello,
      id: 'ord-storico',
      id_esterno: '9001',
      numero: '2022/14',
      righe: modello.righe.map((r, i) => ({
        ...r,
        id: `ord-storico-r${i}`,
        quantita_milli: 1000,
        prezzo_unitario_cents: 100,
        sconto_percentuale: 0,
        imponibile_cents: 10000,
      })),
      sconto_generale_percentuale: 0,
      imponibile_cents: 10000,
      iva_cents: 2200,
      totale_cents: 12200,
    }
    await api.importa({
      versione: SEED_VERSION,
      origine: 'import',
      generato_il: 0,
      sorgente: 'test',
      db: { ...db, ordini: [...db.ordini, storico] },
    })
    return storico
  }

  it('aprire e salvare un ordine importato non ne cambia il totale', async () => {
    const storico = await conOrdineStorico()

    // Il salvataggio più innocuo che esista: si tocca una nota, nient'altro.
    const dopo = await api.aggiornaOrdine(storico.id, { note: 'riletto oggi' })

    expect(dopo.totale_cents).toBe(storico.totale_cents)
    expect(dopo.imponibile_cents).toBe(storico.imponibile_cents)
    expect(dopo.righe[0].imponibile_cents).toBe(10000)
    expect(dopo.note).toBe('riletto oggi')
  })

  it('un documento nato qui invece si ricalcola, come sempre', async () => {
    // La guardia distingue per `id_esterno`, non spegne il ricalcolo per tutti:
    // senza questo test, «non ricalcolare mai» passerebbe il test qui sopra.
    const db = esportaDb()
    const cliente = db.clienti[0]
    const p = await api.creaPreventivo({
      data: '2026-07-30',
      cliente_id: cliente.id,
      cliente_nome: cliente.ragione_sociale,
      oggetto: 'Prova di ricalcolo',
      righe: [
        {
          id: 'r1',
          tipo: 'merce',
          articolo_id: null,
          codice_articolo: null,
          descrizione: 'Tavolame',
          lotto_id: null,
          lotto_codice: null,
          quantita_milli: 2000,
          unita_misura: 'mq',
          prezzo_unitario_cents: 5000,
          sconto_percentuale: 0,
          aliquota_iva: 22,
          // Zero scritto a mano: se il ricalcolo non gira, resta zero.
          imponibile_cents: 0,
          essenza: null,
          patina: null,
          spessore_mm: null,
          note: null,
        },
      ],
      sconto_generale_percentuale: 0,
      validita_giorni: 30,
      condizioni_pagamento: null,
      tempi_consegna: null,
      note: null,
      stato: 'bozza',
      ordine_id: null,
    })

    expect(p.righe[0].imponibile_cents).toBe(10000) // 2 m² × 50,00 €
    expect(p.totale_cents).toBe(12200)
  })
})

/**
 * Lo scadenzario ha due sorgenti, e sbagliarle costa in entrambi i versi.
 *
 * Nel pannello si incassa contro l'**ordine**; una sorgente esterna può incassare
 * contro la **fattura** e registrarlo in una `Scadenza`. Contare anche gli ordini
 * importati sovrastimerebbe l'esposizione.
 */
describe('lo scadenzario dice quello che c’è davvero da incassare', () => {
  it('non sollecita un ordine importato: la sua cassa vive nelle scadenze', async () => {
    const db = esportaDb()
    const modello = db.ordini[0]
    const storico = {
      ...modello,
      id: 'ord-storico-inc',
      id_esterno: '9002',
      numero: '2022/91',
      stato: 'chiuso_forzato' as const,
      incassato_cents: 0,
      residuo_cents: modello.totale_cents,
    }
    await api.importa({
      versione: SEED_VERSION,
      origine: 'import',
      generato_il: 0,
      sorgente: 'test',
      db: { ...db, ordini: [...db.ordini, storico] },
    })

    const voci = await api.scadenzario()
    expect(voci.some((v) => v.ordine_id === storico.id)).toBe(false)
  })

  it('elenca invece la scadenza di prima nota non saldata', async () => {
    const db = esportaDb()
    const cliente = db.clienti[0]
    await api.importa({
      versione: SEED_VERSION,
      origine: 'import',
      generato_il: 0,
      sorgente: 'test',
      db: {
        ...db,
        scadenze: [
          {
            id: 'sca-1',
            id_esterno: 'PN:1',
            documento_tipo: 'fattura',
            documento_id: 'fat-1',
            documento_numero: '2024/17',
            verso: 'incasso',
            cliente_id: cliente.id,
            fornitore_id: null,
            controparte_nome: cliente.ragione_sociale,
            data_scadenza: '2024-09-30',
            data_pagamento: null,
            importo_cents: 250000,
            saldato: false,
            mezzo: null,
            note: null,
            created_at: 0,
            updated_at: 0,
          },
          {
            // Saldata: non deve comparire.
            id: 'sca-2',
            id_esterno: 'PN:2',
            documento_tipo: 'fattura',
            documento_id: 'fat-2',
            documento_numero: '2024/18',
            verso: 'incasso',
            cliente_id: cliente.id,
            fornitore_id: null,
            controparte_nome: cliente.ragione_sociale,
            data_scadenza: '2024-10-31',
            data_pagamento: '2024-10-30',
            importo_cents: 100000,
            saldato: true,
            mezzo: null,
            note: null,
            created_at: 0,
            updated_at: 0,
          },
        ],
      },
    })

    const voci = await api.scadenzario()
    const daScadenza = voci.filter((v) => v.origine === 'scadenza')
    expect(daScadenza).toHaveLength(1)
    expect(daScadenza[0].numero).toBe('2024/17')
    expect(daScadenza[0].residuo_cents).toBe(250000)
    expect(daScadenza[0].ordine_id).toBeNull()
    expect(daScadenza[0].scaduto).toBe(true)

    // E si chiude dov'è nata: spuntarla la toglie dalla lista e dal riepilogo.
    // Registrarci sopra un `Pagamento` la lascerebbe aperta, contando l'incasso
    // due volte — una per registro.
    const prima = (await api.riepilogo()).da_incassare_cents
    await api.saldaScadenza(daScadenza[0].chiave)
    const dopo = await api.scadenzario()
    expect(dopo.filter((v) => v.origine === 'scadenza')).toHaveLength(0)
    expect((await api.riepilogo()).da_incassare_cents).toBe(prima - 250000)
    await expect(api.saldaScadenza(daScadenza[0].chiave)).rejects.toThrow(/gi\u00e0 saldata/)
  })
})
