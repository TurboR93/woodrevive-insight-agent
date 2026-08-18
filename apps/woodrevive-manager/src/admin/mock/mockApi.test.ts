/**
 * Il percorso di dominio completo, provato end-to-end sul layer dati:
 * preventivo → accettato → ordine → DDT → emesso → incassato, con il magazzino
 * che si muove nei due punti previsti e in nessun altro.
 *
 * È il collaudo che conta: se questo passa, il modello regge.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  ErroreApi,
  disponibile,
  type ArticoloInput,
  type RigaPreventivo,
  type SchedaLavorazioneInput,
} from '../domain'
import { aggiungiGiorni, oggiISO } from '../lib/format'
import { mockApi as api } from './mockApi'
import { verificaInvarianteGiacenze, verificaInvarianteLotti, esportaDb } from './db'

beforeEach(async () => {
  await api.ripristina()
})

/** Riga minima, per i test che devono solo far esistere un documento. */
function rigaDiProva(): RigaPreventivo {
  return {
    id: 'r-prova',
    tipo: 'merce',
    articolo_id: null,
    codice_articolo: null,
    descrizione: 'Tavolame di recupero',
    lotto_id: null,
    lotto_codice: null,
    quantita_milli: 1000,
    unita_misura: 'mq',
    prezzo_unitario_cents: 10000,
    sconto_percentuale: 0,
    aliquota_iva: 22,
    imponibile_cents: 0,
    essenza: null,
    patina: null,
    spessore_mm: null,
    note: null,
  }
}

/** Articolo minimo senza movimenti: per i test che devono poterlo eliminare. */
function articoloDiProva(): ArticoloInput {
  return {
    nome: 'Tavola di prova 20 mm',
    descrizione: null,
    natura: 'merce',
    gestione_magazzino: true,
    stadio: 'semilavorato',
    categoria: 'tavola',
    essenza: 'abete',
    patina: 'prima_patina',
    spessore_mm: 20,
    larghezza_min_mm: 120,
    larghezza_max_mm: 300,
    lunghezza_min_mm: 1000,
    lunghezza_max_mm: 4000,
    unita_misura: 'mq',
    mc_per_unita_milli: 20,
    prezzo_acquisto_cents: 4000,
    prezzo_listino_cents: 7000,
    aliquota_iva: 22,
    scorta_minima_milli: 0,
    ubicazione: null,
    attivo: true,
    note: null,
  }
}

describe('anagrafiche', () => {
  it('rifiuta un cliente azienda senza partita IVA', async () => {
    await expect(
      api.creaCliente({
        tipo: 'azienda',
        ragione_sociale: 'Prova S.r.l.',
        referente: null,
        piva: null,
        codice_fiscale: null,
        codice_sdi: null,
        pec: null,
        email: null,
        telefono: null,
        indirizzo: null,
        cap: null,
        citta: null,
        provincia: null,
        nazione: 'IT',
        consegna_indirizzo: null,
        consegna_cap: null,
        consegna_citta: null,
        consegna_provincia: null,
        canale: 'diretto',
        sconto_default_percentuale: 0,
        aliquota_iva_default: 22,
        note: null,
        attivo: true,
      }),
    ).rejects.toThrow(/partita IVA/i)
  })

  it('non elimina un cliente con documenti collegati e dice quanti sono', async () => {
    const clienti = await api.listaClienti()
    const conOrdini = clienti.find((c) => c.ordini_aperti > 0 || c.fatturato_cents > 0)!
    await expect(api.eliminaCliente(conOrdini.id)).rejects.toThrow(/Non eliminabile/)
    await expect(api.eliminaCliente(conOrdini.id)).rejects.toThrow(/Disattivalo/)
  })

  it('non elimina un cliente che ha versato dei soldi', async () => {
    const pagamenti = await api.listaPagamenti()
    // un cliente con una caparra ma senza ordini: solo il pagamento lo protegge
    const senzaOrdine = pagamenti.find((p) => !p.ordine_id)!
    await expect(api.eliminaCliente(senzaOrdine.cliente_id)).rejects.toThrow(/pagament/i)
  })

  it('assegna un codice progressivo ai nuovi clienti', async () => {
    const nuovo = await api.creaCliente({
      tipo: 'privato',
      ragione_sociale: 'Maria Rossi',
      referente: null,
      piva: null,
      codice_fiscale: 'RSSMRA80A41L736T',
      codice_sdi: null,
      pec: null,
      email: null,
      telefono: null,
      indirizzo: null,
      cap: null,
      citta: null,
      provincia: null,
      nazione: 'IT',
      consegna_indirizzo: null,
      consegna_cap: null,
      consegna_citta: null,
      consegna_provincia: null,
      canale: 'diretto',
      sconto_default_percentuale: 0,
      aliquota_iva_default: 10,
      note: null,
      attivo: true,
    })
    expect(nuovo.codice).toMatch(/^CLI-\d{4}$/)
  })
})

describe('magazzino', () => {
  it('la rettifica di inventario pretende una causale', async () => {
    const articoli = await api.listaArticoli()
    await expect(
      api.rettificaInventario({ articolo_id: articoli[0].id, quantita_milli: 1000, causale: '  ' }),
    ).rejects.toThrow(/causale/i)
  })

  it('la rettifica muove la giacenza e resta nel libro giornale', async () => {
    const articoli = await api.listaArticoli()
    const a = articoli.find((x) => x.giacenza_milli > 0)!
    await api.rettificaInventario({
      articolo_id: a.id,
      quantita_milli: -2000,
      causale: 'Conta fisica di magazzino',
    })
    const dopo = await api.articolo(a.id)
    expect(dopo.giacenza_milli).toBe(a.giacenza_milli - 2000)

    const movimenti = await api.listaMovimenti({ articolo_id: a.id })
    expect(movimenti[0].causale).toBe('Conta fisica di magazzino')
    expect(movimenti[0].origine).toBe('inventario')
  })

  it('non permette una rettifica che porta la giacenza sotto zero', async () => {
    const articoli = await api.listaArticoli()
    const a = articoli.find((x) => x.giacenza_milli > 0)!
    await expect(
      api.rettificaInventario({
        articolo_id: a.id,
        quantita_milli: -(a.giacenza_milli + 1),
        causale: 'Prova',
      }),
    ).rejects.toThrow(/sotto zero/)
  })
})

describe('giacenza per coppia articolo-lotto', () => {
  it('dice cosa è entrato con una partita e cosa ne resta', async () => {
    const lotti = await api.listaLotti()
    const lotto = lotti.find((l) => l.stato === 'disponibile')!
    const voci = await api.giacenzePerLotto(lotto.id)

    expect(voci.length).toBeGreaterThan(0)
    for (const v of voci) {
      expect(v.caricato_milli).toBeGreaterThan(0)
      expect(v.residuo_milli).toBeGreaterThanOrEqual(0)
      expect(v.residuo_milli).toBeLessThanOrEqual(v.caricato_milli)
    }
  })

  it('la somma dei residui per lotto non supera la giacenza dell articolo', async () => {
    const articoli = await api.listaArticoli()
    for (const a of articoli) {
      const lotti = await api.lottiDisponibiliPerArticolo(a.id)
      const daiLotti = lotti.reduce((t, l) => t + l.residuo_milli, 0)
      expect(daiLotti, a.codice).toBeLessThanOrEqual(a.giacenza_milli)
    }
  })

  it('un lotto esaurito non compare più fra quelli disponibili', async () => {
    const esaurito = (await api.listaLotti()).find((l) => l.stato === 'esaurito')!
    const voci = await api.giacenzePerLotto(esaurito.id)
    expect(voci.length).toBeGreaterThan(0) // è passata merce di qui
    for (const v of voci) {
      expect(v.residuo_milli).toBe(0)
      const disponibili = await api.lottiDisponibiliPerArticolo(v.articolo_id)
      expect(disponibili.map((d) => d.lotto_id)).not.toContain(esaurito.id)
    }
  })

  it('ricostruisce la discendenza di una partita: cosa è entrato e a chi è andato', async () => {
    const esaurito = (await api.listaLotti()).find((l) => l.stato === 'esaurito')!
    const d = await api.discendenzaLotto(esaurito.id)
    expect(d.articoli.length).toBeGreaterThan(0)
    expect(d.consegne.length).toBeGreaterThan(0)
    expect(d.consegne[0].cliente).toBeTruthy()
    expect(d.consegne[0].data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('non elimina una partita da cui è già passata della merce', async () => {
    const lotto = (await api.listaLotti())[0]
    await expect(api.eliminaLotto(lotto.id)).rejects.toThrow(/Non eliminabile/)
  })
})

describe('margine e ricarico', () => {
  it('calcola margine e ricarico di un articolo caricato', async () => {
    const { margineCents, marginePercentualeArticolo, ricaricoPercentuale } = await import('../domain')
    const a = (await api.listaArticoli()).find((x) => x.costo_medio_cents > 0)!

    expect(margineCents(a)).toBe(a.prezzo_listino_cents - a.costo_medio_cents)
    const margine = marginePercentualeArticolo(a)!
    const ricarico = ricaricoPercentuale(a)!
    expect(margine).toBeGreaterThan(0)
    // il ricarico è sempre maggiore del margine: la base è più piccola
    expect(ricarico).toBeGreaterThan(margine)
  })

  it('ritorna null, non zero, quando il costo non è noto', async () => {
    const { margineCents, marginePercentualeArticolo, ricaricoPercentuale } = await import('../domain')
    const senzaCosto = {
      ...(await api.listaArticoli())[0],
      costo_medio_cents: 0,
      prezzo_acquisto_cents: 0,
    }
    expect(margineCents(senzaCosto)).toBeNull()
    expect(marginePercentualeArticolo(senzaCosto)).toBeNull()
    expect(ricaricoPercentuale(senzaCosto)).toBeNull()
  })

  it('ripiega sul prezzo di acquisto per un articolo mai caricato', async () => {
    const { marginePercentualeArticolo } = await import('../domain')
    const maiCaricato = (await api.listaArticoli()).find(
      (a) => a.giacenza_milli === 0 && a.prezzo_acquisto_cents > 0,
    )!
    expect(maiCaricato.costo_medio_cents).toBe(0)
    expect(marginePercentualeArticolo(maiCaricato)).toBeGreaterThan(0)
  })

  it('misura la marginalità del venduto dai movimenti di scarico', async () => {
    const r = await api.riepilogo()
    expect(r.venduto_anno_cents).toBeGreaterThan(0)
    expect(r.costo_venduto_anno_cents).toBeGreaterThan(0)
    expect(r.marginalita_venduto_cents).toBe(r.venduto_anno_cents - r.costo_venduto_anno_cents)
    expect(r.margine_medio_percentuale).not.toBeNull()
    expect(r.margine_medio_percentuale!).toBeGreaterThan(0)
  })
})

describe('percorso completo preventivo → ordine → DDT → incasso', () => {
  it('muove il magazzino solo all emissione del DDT', async () => {
    const clienti = await api.listaClienti()
    const cliente = clienti[0]
    const articoli = await api.listaArticoli()
    const articolo = articoli.find((a) => a.stadio === 'finito' && a.giacenza_milli >= 20000)!
    const giacenzaIniziale = articolo.giacenza_milli

    // 1. preventivo
    const p = await api.creaPreventivo({
      data: '2026-06-01',
      cliente_id: cliente.id,
      cliente_nome: '',
      oggetto: 'Prova di collaudo',
      righe: [
        {
          id: 'r1',
          tipo: 'merce',
          articolo_id: articolo.id,
          codice_articolo: articolo.codice,
          descrizione: articolo.nome,
          lotto_id: null,
          lotto_codice: null,
          quantita_milli: 20000,
          unita_misura: articolo.unita_misura,
          prezzo_unitario_cents: articolo.prezzo_listino_cents,
          sconto_percentuale: 0,
          aliquota_iva: 10,
          imponibile_cents: 0,
          essenza: articolo.essenza,
          patina: articolo.patina,
          spessore_mm: articolo.spessore_mm,
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
    expect(p.numero).toMatch(/^PRV-\d{4}-\d{4}$/)
    expect(p.imponibile_cents).toBe(Math.round((20000 * articolo.prezzo_listino_cents) / 1000))
    expect(p.totale_cents).toBe(p.imponibile_cents + p.iva_cents)

    // 2. non si converte un preventivo non accettato
    await expect(api.convertiPreventivo(p.id)).rejects.toThrow(/accettato/)

    await api.cambiaStatoPreventivo(p.id, 'inviato')
    await api.cambiaStatoPreventivo(p.id, 'accettato')

    // 3. conversione in ordine: la giacenza non si muove, l'impegnato sì
    const ordine = await api.convertiPreventivo(p.id)
    const dopoOrdine = await api.articolo(articolo.id)
    expect(dopoOrdine.giacenza_milli).toBe(giacenzaIniziale)
    expect(dopoOrdine.impegnato_milli).toBeGreaterThanOrEqual(20000)
    expect(disponibile(dopoOrdine)).toBe(giacenzaIniziale - dopoOrdine.impegnato_milli)
    expect(ordine.incassato_cents).toBe(0)
    expect(ordine.residuo_cents).toBe(ordine.totale_cents)

    const preventivoDopo = await api.preventivo(p.id)
    expect(preventivoDopo.stato).toBe('convertito')
    await expect(api.eliminaPreventivo(p.id)).rejects.toThrow(/convertito/)

    // 4. DDT in bozza: ancora niente movimenti
    const ddt = await api.creaDdtDaOrdine(ordine.id)
    expect(ddt.stato).toBe('bozza')
    expect(ddt.righe).toHaveLength(1)
    const dopoBozza = await api.articolo(articolo.id)
    expect(dopoBozza.giacenza_milli).toBe(giacenzaIniziale)

    // 5. emissione: qui il magazzino si muove
    await api.emettiDdt(ddt.id)
    const dopoEmissione = await api.articolo(articolo.id)
    expect(dopoEmissione.giacenza_milli).toBe(giacenzaIniziale - 20000)
    expect(dopoEmissione.impegnato_milli).toBe(0)

    const ordineDopo = await api.ordine(ordine.id)
    expect(ordineDopo.stato).toBe('evaso')
    expect(ordineDopo.righe[0].quantita_evasa_milli).toBe(20000)

    // 6. il DDT emesso non si elimina né si riemette
    await expect(api.eliminaDdt(ddt.id)).rejects.toThrow(/reso/)
    await expect(api.emettiDdt(ddt.id)).rejects.toThrow(/già stato emesso/)

    // 7. l'incasso: prima l'acconto, poi il saldo
    await api.creaPagamento({
      cliente_id: cliente.id,
      ordine_id: ordine.id,
      tipo: 'acconto',
      data: '2026-06-02',
      importo_cents: 50000,
      mezzo: 'bonifico',
      riferimento: 'CRO 1',
      note: null,
    })
    const conAcconto = await api.ordine(ordine.id)
    expect(conAcconto.incassato_cents).toBe(50000)
    expect(conAcconto.residuo_cents).toBe(conAcconto.totale_cents - 50000)

    await api.creaPagamento({
      cliente_id: cliente.id,
      ordine_id: ordine.id,
      tipo: 'saldo',
      data: '2026-06-20',
      importo_cents: conAcconto.residuo_cents,
      mezzo: 'bonifico',
      riferimento: 'CRO 2',
      note: null,
    })
    const saldato = await api.ordine(ordine.id)
    expect(saldato.residuo_cents).toBe(0)
    expect((await api.scadenzario()).map((v) => v.ordine_id)).not.toContain(ordine.id)

    // 8. gli invarianti reggono dopo tutto il giro
    expect(verificaInvarianteGiacenze(esportaDb())).toEqual([])
    expect(verificaInvarianteLotti(esportaDb())).toEqual([])
  })

  it('rifiuta un DDT che scaricherebbe più di quanto c è', async () => {
    const ddt = (await api.listaDdt()).find((d) => d.stato === 'bozza')!
    await api.aggiornaDdt(ddt.id, {
      righe: ddt.righe.map((r) => ({ ...r, quantita_milli: 9_999_000 })),
    })
    await expect(api.emettiDdt(ddt.id)).rejects.toThrow(/Giacenza insufficiente/)
  })

  it('rifiuta un DDT che pretende da una partita più di quanto quella partita ha', async () => {
    /*
     * Il caso che il solo controllo globale lascerebbe passare: in magazzino
     * la merce c'è, ma non c'è tutta in QUELLA partita. Serve quindi un
     * articolo il cui residuo su un lotto sia strettamente minore della
     * giacenza complessiva — così la quantità richiesta supera il lotto senza
     * superare il magazzino.
     */
    let caso: { articolo: Awaited<ReturnType<typeof api.articolo>>; lotto: { lotto_id: string; codice: string; residuo_milli: number } } | null = null
    for (const a of await api.listaArticoli()) {
      const lotti = await api.lottiDisponibiliPerArticolo(a.id)
      const lotto = lotti.find((l) => l.residuo_milli + 1000 <= a.giacenza_milli)
      if (lotto) {
        caso = { articolo: a, lotto }
        break
      }
    }
    expect(caso, 'il seed non ha nessun articolo tracciato su più partite').not.toBeNull()

    const { articolo, lotto } = caso!
    const troppo = lotto.residuo_milli + 1000
    expect(troppo).toBeLessThanOrEqual(articolo.giacenza_milli) // il globale passa

    const bozza = (await api.listaDdt()).find((d) => d.stato === 'bozza')!
    await api.aggiornaDdt(bozza.id, {
      righe: [
        {
          ...bozza.righe[0],
          articolo_id: articolo.id,
          lotto_id: lotto.lotto_id,
          lotto_codice: lotto.codice,
          quantita_milli: troppo,
          unita_misura: articolo.unita_misura,
        },
      ],
    })
    await expect(api.emettiDdt(bozza.id)).rejects.toThrow(new RegExp(`Del lotto ${lotto.codice}`))
    // e il magazzino non si è mosso: la guardia scatta prima dei movimenti
    expect((await api.articolo(articolo.id)).giacenza_milli).toBe(articolo.giacenza_milli)
  })
})

describe('acquisti', () => {
  it('la ricezione crea la partita, carica gli articoli e ripartisce il trasporto', async () => {
    const acquisto = (await api.listaAcquisti()).find((a) => a.stato === 'confermato')!
    const riga = acquisto.righe[0]
    const prima = await api.articolo(riga.articolo_id)

    const { lotto } = await api.ricevalAcquisto(acquisto.id, {
      lotto: {
        descrizione: 'Copertura di Maniago',
        provenienza_edificio: 'Casa rurale',
        provenienza_localita: 'Maniago',
        provenienza_provincia: 'PN',
        anno_costruzione_stimato: 1930,
      },
    })

    // 1. la partita nasce con la provenienza e con il costo pieno
    expect(lotto.codice).toMatch(/^LOT-\d{4}-\d{4}$/)
    expect(lotto.provenienza_localita).toBe('Maniago')
    expect(lotto.costo_acquisto_cents).toBeGreaterThan(riga.imponibile_cents)
    expect(lotto.costo_acquisto_cents).toBe(riga.imponibile_cents + acquisto.spese_trasporto_cents)

    // 2. l'articolo si carica, e si carica DA QUELLA PARTITA
    const dopo = await api.articolo(riga.articolo_id)
    expect(dopo.giacenza_milli).toBe(prima.giacenza_milli + riga.quantita_milli)
    const voci = await api.giacenzePerLotto(lotto.id)
    expect(voci).toHaveLength(1)
    expect(voci[0].articolo_id).toBe(riga.articolo_id)
    expect(voci[0].residuo_milli).toBe(riga.quantita_milli)

    // 3. il trasporto è dentro il costo unitario, non fuori
    const movimenti = await api.listaMovimenti({ lotto_id: lotto.id })
    expect(movimenti).toHaveLength(1)
    expect(movimenti[0].valore_unitario_cents).toBeGreaterThan(riga.prezzo_unitario_cents)
    expect(movimenti[0].valore_totale_cents).toBe(lotto.costo_acquisto_cents)

    // 4. l'ultimo prezzo pagato diventa il riferimento d'acquisto
    expect(dopo.prezzo_acquisto_cents).toBe(riga.prezzo_unitario_cents)

    const acquistoDopo = await api.acquisto(acquisto.id)
    expect(acquistoDopo.stato).toBe('ricevuto')
    expect(acquistoDopo.righe[0].lotto_id).toBe(lotto.id)
    await expect(api.ricevalAcquisto(acquisto.id, {})).rejects.toThrow(/già ricevuto/)
    expect(verificaInvarianteGiacenze(esportaDb())).toEqual([])
  })

  it('non elimina un acquisto la cui merce è già entrata', async () => {
    const ricevuto = (await api.listaAcquisti()).find((a) => a.stato === 'ricevuto')!
    await expect(api.eliminaAcquisto(ricevuto.id)).rejects.toThrow(/Non eliminabile/)
  })
})

describe('schede di lavorazione', () => {
  /** Una scheda minima e valida: i test ne cambiano solo il pezzo in esame. */
  function schedaDiProva(): SchedaLavorazioneInput {
    return {
      data: oggiISO(),
      committente: 'Impresa di Prova S.r.l.',
      telefono: '0438 000000',
      data_consegna: aggiungiGiorni(oggiISO(), 30),
      ordine_id: null,
      ordine_numero: null,
      articolo_id: null,
      fornitore_id: null,
      fornitore_nome: null,
      tipologie: ['pavimenti'],
      essenza: 'abete',
      larghezza_da_mm: 140,
      larghezza_a_mm: 300,
      lunghezza_da_mm: 1500,
      lunghezza_a_mm: 4000,
      spessore_mm: 20,
      spazzolatura: 'Leggera',
      stucco_colore: null,
      bordo_frontale: null,
      finitura: 'Per saponato',
      quantita_milli: 100000,
      unita_misura: 'mq',
      annotazioni: null,
      stato: 'bozza',
    }
  }

  it('non muove MAI il magazzino, lungo tutto il ciclo di vita', async () => {
    const movimentiPrima = (await api.listaMovimenti()).length
    const s = await api.creaScheda(schedaDiProva())
    await api.aggiornaScheda(s.id, { finitura: 'Olio naturale' })
    await api.cambiaStatoScheda(s.id, 'inviata')
    await api.cambiaStatoScheda(s.id, 'chiusa')
    expect((await api.listaMovimenti()).length).toBe(movimentiPrima)
  })

  it('assegna il numero al salvataggio, progressivo dopo il seed', async () => {
    const anno = new Date().getFullYear()
    const s = await api.creaScheda(schedaDiProva())
    // il seed ne dichiara tre: la prima nata nel pannello è la quarta
    expect(s.numero).toBe(`SCH-${anno}-0004`)
    expect((await api.creaScheda(schedaDiProva())).numero).toBe(`SCH-${anno}-0005`)
  })

  it('congela gli snapshot di fornitore e ordine alla nascita, dal record vivo', async () => {
    const fornitore = (await api.listaFornitori())[0]
    const ordine = (await api.listaOrdini())[0]
    const s = await api.creaScheda({
      ...schedaDiProva(),
      fornitore_id: fornitore.id,
      ordine_id: ordine.id,
      // il client può mentire: gli snapshot si copiano dal record, non da qui
      fornitore_nome: 'Nome sbagliato',
      ordine_numero: 'ORD-0000-0000',
    })
    expect(s.fornitore_nome).toBe(fornitore.ragione_sociale)
    expect(s.ordine_numero).toBe(ordine.numero)
  })

  it('nasce in bozza anche se il client dichiara un altro stato', async () => {
    // La porta di crea non aggira le transizioni: nata «chiusa» sarebbe
    // immodificabile e ineliminabile dal primo istante.
    const s = await api.creaScheda({ ...schedaDiProva(), stato: 'chiusa' })
    expect(s.stato).toBe('bozza')
  })

  it('non lascia riscrivere snapshot e campi tecnici dal form', async () => {
    const fornitore = (await api.listaFornitori())[0]
    const s = await api.creaScheda({ ...schedaDiProva(), fornitore_id: fornitore.id })
    const dopo = await api.aggiornaScheda(s.id, {
      fornitore_nome: 'Nome falso',
      created_at: 1,
      id_esterno: 'finto',
    } as never)
    expect(dopo.fornitore_nome).toBe(fornitore.ragione_sociale)
    expect(dopo.created_at).toBe(s.created_at)
    expect(dopo.id_esterno).toBeNull()
  })

  it('rifiuta la quantità senza la sua unità di misura', async () => {
    // Il PDF stampa la voce QUANTITÀ solo completa: «100» senza unità
    // sparirebbe in silenzio dal modulo consegnato al fornitore.
    await expect(
      api.creaScheda({ ...schedaDiProva(), quantita_milli: 100000, unita_misura: null }),
    ).rejects.toThrow(/unità di misura/)
  })

  it('rifiuta committente vuoto e forbici di misura incrociate', async () => {
    await expect(api.creaScheda({ ...schedaDiProva(), committente: '  ' })).rejects.toThrow(
      /committente/,
    )
    await expect(
      api.creaScheda({ ...schedaDiProva(), larghezza_da_mm: 400, larghezza_a_mm: 140 }),
    ).rejects.toThrow(/larghezza/i)
    await expect(
      api.creaScheda({ ...schedaDiProva(), lunghezza_da_mm: 5000, lunghezza_a_mm: 1000 }),
    ).rejects.toThrow(/lunghezza/i)
    await expect(api.creaScheda({ ...schedaDiProva(), quantita_milli: 0 })).rejects.toThrow(
      /quantità/,
    )
  })

  it('rispetta le transizioni: mai da bozza a chiusa, mai fuori dagli stati finali', async () => {
    const s = await api.creaScheda(schedaDiProva())
    await expect(api.cambiaStatoScheda(s.id, 'chiusa')).rejects.toThrow(/non può passare/)
    await api.cambiaStatoScheda(s.id, 'inviata')
    await api.cambiaStatoScheda(s.id, 'chiusa')
    await expect(api.cambiaStatoScheda(s.id, 'inviata')).rejects.toThrow(/non può passare/)
  })

  it('si modifica da inviata, non da chiusa; e lo stato non passa dal form', async () => {
    const s = await api.creaScheda(schedaDiProva())
    await api.cambiaStatoScheda(s.id, 'inviata')
    // col fornitore si aggiusta al telefono: inviata resta modificabile
    const dopo = await api.aggiornaScheda(s.id, { spessore_mm: 25 })
    expect(dopo.spessore_mm).toBe(25)
    // il form non è una scorciatoia per saltare le transizioni
    const furbo = await api.aggiornaScheda(s.id, { stato: 'chiusa' } as never)
    expect(furbo.stato).toBe('inviata')
    await api.cambiaStatoScheda(s.id, 'chiusa')
    await expect(api.aggiornaScheda(s.id, { spessore_mm: 30 })).rejects.toThrow(/non si modifica/)
  })

  it('non elimina una scheda consegnata al fornitore: si annulla', async () => {
    const s = await api.creaScheda(schedaDiProva())
    await api.cambiaStatoScheda(s.id, 'inviata')
    await expect(api.eliminaScheda(s.id)).rejects.toThrow(/annullala/)
    await api.cambiaStatoScheda(s.id, 'annullata')
    await api.eliminaScheda(s.id)
    await expect(api.scheda(s.id)).rejects.toThrow(/non trovat/)
  })

  it('blocca l eliminazione del fornitore referenziato', async () => {
    const fornitore = (await api.listaFornitori())[0]
    await api.creaScheda({ ...schedaDiProva(), fornitore_id: fornitore.id })
    await expect(api.eliminaFornitore(fornitore.id)).rejects.toThrow(/scheda di lavorazione/)
  })

  it('scollega ordine e articolo eliminati, ma lo snapshot del numero resta', async () => {
    // Un ordine fresco, senza DDT né incassi: nasce da un preventivo come tutti
    const cliente = (await api.listaClienti())[0]
    const p = await api.creaPreventivo({
      data: oggiISO(),
      cliente_id: cliente.id,
      cliente_nome: '',
      oggetto: 'Prova scollegamento scheda',
      righe: [rigaDiProva()],
      sconto_generale_percentuale: 0,
      validita_giorni: 30,
      condizioni_pagamento: null,
      tempi_consegna: null,
      note: null,
      stato: 'bozza',
      ordine_id: null,
    })
    await api.cambiaStatoPreventivo(p.id, 'inviato')
    await api.cambiaStatoPreventivo(p.id, 'accettato')
    const ordine = await api.convertiPreventivo(p.id)

    const articolo = await api.creaArticolo(articoloDiProva())
    const s = await api.creaScheda({
      ...schedaDiProva(),
      ordine_id: ordine.id,
      articolo_id: articolo.id,
    })
    expect(s.ordine_numero).toBe(ordine.numero)

    await api.eliminaOrdine(ordine.id)
    await api.eliminaArticolo(articolo.id)
    const dopo = await api.scheda(s.id)
    expect(dopo.ordine_id).toBeNull()
    expect(dopo.articolo_id).toBeNull()
    // il numero sopravvive: è quello che la scheda stampata dichiarava
    expect(dopo.ordine_numero).toBe(ordine.numero)

    // e un salvataggio che NON tocca il collegamento non lo cancella
    const salvata = await api.aggiornaScheda(s.id, { annotazioni: 'aggiornata' })
    expect(salvata.ordine_numero).toBe(ordine.numero)
    // chi invece scollega a mano vuole togliere anche il nome
    const scollegata = await api.aggiornaScheda(s.id, { ordine_id: null })
    expect(scollegata.ordine_numero).toBeNull()
  })
})

describe('incassi e scadenzario', () => {
  it('elenca gli ordini con residuo, i più in ritardo per primi', async () => {
    const voci = await api.scadenzario()
    expect(voci.length).toBeGreaterThan(1)
    for (const v of voci) expect(v.residuo_cents).toBeGreaterThan(0)

    const scaduti = voci.filter((v) => v.scaduto)
    expect(scaduti.length).toBeGreaterThan(0)
    // i ritardatari stanno in cima, in ordine di ritardo decrescente
    expect(voci.slice(0, scaduti.length).every((v) => v.scaduto)).toBe(true)
    for (let i = 1; i < scaduti.length; i++) {
      expect(scaduti[i - 1].giorni_ritardo).toBeGreaterThanOrEqual(scaduti[i].giorni_ritardo)
    }
  })

  it('somma nel riepilogo il da incassare e lo scaduto', async () => {
    const r = await api.riepilogo()
    const voci = await api.scadenzario()
    expect(r.da_incassare_cents).toBe(voci.reduce((t, v) => t + v.residuo_cents, 0))
    expect(r.scaduto_cents).toBe(
      voci.filter((v) => v.scaduto).reduce((t, v) => t + v.residuo_cents, 0),
    )
    expect(r.scaduto_cents).toBeGreaterThan(0)
    expect(r.scaduto_cents).toBeLessThan(r.da_incassare_cents)
  })

  it('una nota di credito riduce il residuo invece di aumentarlo', async () => {
    const ordine = (await api.listaOrdini()).find((o) => o.residuo_cents > 0)!
    const prima = ordine.residuo_cents

    await api.creaPagamento({
      cliente_id: ordine.cliente_id,
      ordine_id: ordine.id,
      tipo: 'nota_credito',
      data: '2026-07-01',
      importo_cents: -30000,
      mezzo: 'bonifico',
      riferimento: 'NC 9',
      note: 'Storno di prova',
    })

    const dopo = await api.ordine(ordine.id)
    expect(dopo.residuo_cents).toBe(prima + 30000)
    expect(dopo.incassato_cents).toBeLessThan(ordine.incassato_cents)
  })

  it('rifiuta una nota di credito con importo positivo', async () => {
    const ordine = (await api.listaOrdini())[0]
    await expect(
      api.creaPagamento({
        cliente_id: ordine.cliente_id,
        ordine_id: ordine.id,
        tipo: 'nota_credito',
        data: '2026-07-01',
        importo_cents: 10000,
        mezzo: 'bonifico',
        riferimento: null,
        note: null,
      }),
    ).rejects.toThrow(/negativo/)
  })

  it('rifiuta un pagamento su un ordine di un altro cliente', async () => {
    const ordini = await api.listaOrdini()
    const a = ordini[0]
    const b = ordini.find((o) => o.cliente_id !== a.cliente_id)!
    await expect(
      api.creaPagamento({
        cliente_id: b.cliente_id,
        ordine_id: a.id,
        tipo: 'acconto',
        data: '2026-07-01',
        importo_cents: 10000,
        mezzo: 'contanti',
        riferimento: null,
        note: null,
      }),
    ).rejects.toThrow(/altro cliente/)
  })

  it('eliminando un pagamento il residuo torna quello di prima', async () => {
    const pagamento = (await api.listaPagamenti()).find((p) => p.ordine_id)!
    const prima = (await api.ordine(pagamento.ordine_id!)).residuo_cents
    await api.eliminaPagamento(pagamento.id)
    const dopo = await api.ordine(pagamento.ordine_id!)
    expect(dopo.residuo_cents).toBe(prima + pagamento.importo_cents)
  })

  it('non elimina un ordine su cui sono stati registrati incassi', async () => {
    const conIncassi = (await api.listaPagamenti()).find((p) => p.ordine_id)!
    await expect(api.eliminaOrdine(conIncassi.ordine_id!)).rejects.toThrow(/incass/i)
  })
})

describe('duplicazione: si rifà il lavoro, non la storia', () => {
  it('duplica un preventivo in una bozza nuova, con data di oggi e numero nuovo', async () => {
    const originale = (await api.listaPreventivi()).find((p) => p.righe.length > 0)!
    const copia = await api.duplicaPreventivo(originale.id)

    expect(copia.id).not.toBe(originale.id)
    expect(copia.numero).not.toBe(originale.numero)
    expect(copia.stato).toBe('bozza')
    expect(copia.ordine_id).toBeNull()
    expect(copia.data).toBe(oggiISO())
    expect(copia.data_scadenza).toBe(aggiungiGiorni(oggiISO(), copia.validita_giorni))

    // quello che si rifà: cliente, righe, sconto, condizioni — e quindi i totali
    expect(copia.cliente_id).toBe(originale.cliente_id)
    expect(copia.oggetto).toBe(originale.oggetto)
    expect(copia.sconto_generale_percentuale).toBe(originale.sconto_generale_percentuale)
    expect(copia.condizioni_pagamento).toBe(originale.condizioni_pagamento)
    expect(copia.righe).toHaveLength(originale.righe.length)
    expect(copia.totale_cents).toBe(originale.totale_cents)

    // l'originale resta com'era
    const dopo = await api.preventivo(originale.id)
    expect(dopo.stato).toBe(originale.stato)
    expect(dopo.numero).toBe(originale.numero)
  })

  it('rigenera gli id delle righe: due documenti non li condividono mai', async () => {
    const originale = (await api.listaPreventivi()).find((p) => p.righe.length > 1)!
    const copia = await api.duplicaPreventivo(originale.id)
    const idOriginali = new Set(originale.righe.map((r) => r.id))
    for (const r of copia.righe) expect(idOriginali.has(r.id)).toBe(false)
    expect(new Set(copia.righe.map((r) => r.id)).size).toBe(copia.righe.length)
  })

  it('anche creando un preventivo gli id delle righe li assegna il server', async () => {
    const cliente = (await api.listaClienti())[0]
    const p = await api.creaPreventivo({
      data: oggiISO(),
      cliente_id: cliente.id,
      cliente_nome: '',
      oggetto: 'Righe con id dettati dal client',
      righe: [{ ...rigaDiProva(), id: 'id-inventato-dal-front-end' }],
      sconto_generale_percentuale: 0,
      validita_giorni: 30,
      condizioni_pagamento: null,
      tempi_consegna: null,
      note: null,
      stato: 'bozza',
      ordine_id: null,
    })
    expect(p.righe[0].id).not.toBe('id-inventato-dal-front-end')
  })

  it('duplicando un preventivo già convertito nasce una bozza staccata dall’ordine', async () => {
    // È la promessa che la scheda fa quando il documento è in sola lettura:
    // «per rifare lo stesso lavoro, duplicalo». La copia non deve portarsi
    // dietro l'ordine dell'originale, altrimenti nascerebbe già bloccata.
    const convertito = (await api.listaPreventivi()).find((p) => p.stato === 'convertito')!
    expect(convertito.ordine_id).not.toBeNull()

    const copia = await api.duplicaPreventivo(convertito.id)
    expect(copia.stato).toBe('bozza')
    expect(copia.ordine_id).toBeNull()

    // e si può davvero lavorarci: l'originale invece resta chiuso
    await expect(api.aggiornaPreventivo(convertito.id, { note: 'no' })).rejects.toThrow(/convertito/i)
    const modificata = await api.aggiornaPreventivo(copia.id, { note: 'Stesso lavoro, altro cantiere' })
    expect(modificata.note).toBe('Stesso lavoro, altro cantiere')
  })

  it('rifà un ordine come PREVENTIVO, mai come ordine, e senza le quantità evase', async () => {
    const ordine = (await api.listaOrdini()).find((o) => o.righe.length > 0)!
    const quantiOrdini = (await api.listaOrdini()).length

    const p = await api.preventivoDaOrdine(ordine.id, {
      validita_giorni: 45,
      tempi_consegna: 'Da concordare.',
    })

    expect(p.numero).toMatch(/^PRV-/)
    expect(p.stato).toBe('bozza')
    expect(p.ordine_id).toBeNull()
    expect(p.validita_giorni).toBe(45)
    expect(p.cliente_id).toBe(ordine.cliente_id)
    expect(p.righe.map((r) => r.quantita_milli)).toEqual(ordine.righe.map((r) => r.quantita_milli))
    // nessuna riga si porta dietro cosa è già uscito con i DDT
    for (const r of p.righe) expect(r).not.toHaveProperty('quantita_evasa_milli')
    // e soprattutto: non è nato nessun ordine
    expect((await api.listaOrdini()).length).toBe(quantiOrdini)
  })

  it('non duplica un documento che non esiste', async () => {
    await expect(api.duplicaPreventivo('non-esiste')).rejects.toThrow(/non trovato/i)
    await expect(api.preventivoDaOrdine('non-esiste')).rejects.toThrow(/non trovato/i)
  })
})

describe('ricerca globale', () => {
  it('trova un cliente per ragione sociale e ci porta con l’id giusto', async () => {
    const cliente = (await api.listaClienti())[0]
    const voci = await api.ricercaGlobale(cliente.ragione_sociale.slice(0, 4))
    const trovato = voci.find((v) => v.genere === 'cliente' && v.id === cliente.id)
    expect(trovato, `${cliente.ragione_sociale} non trovato`).toBeDefined()
  })

  it('cerca in tutte e sette le collezioni, non solo nelle anagrafiche', async () => {
    const generi = new Set<string>()
    for (const documento of [
      (await api.listaPreventivi())[0],
      (await api.listaOrdini())[0],
      (await api.listaDdt())[0],
      (await api.listaSchede())[0],
    ]) {
      for (const v of await api.ricercaGlobale(documento.numero)) generi.add(v.genere)
    }
    const articolo = (await api.listaArticoli())[0]
    for (const v of await api.ricercaGlobale(articolo.codice)) generi.add(v.genere)
    const lotto = (await api.listaLotti())[0]
    for (const v of await api.ricercaGlobale(lotto.codice)) generi.add(v.genere)

    expect(generi.has('preventivo')).toBe(true)
    expect(generi.has('ordine')).toBe(true)
    expect(generi.has('ddt')).toBe(true)
    expect(generi.has('articolo')).toBe(true)
    expect(generi.has('lotto')).toBe(true)
    expect(generi.has('scheda')).toBe(true)
  })

  it('trova una scheda anche per committente', async () => {
    const scheda = (await api.listaSchede())[0]
    const voci = await api.ricercaGlobale(scheda.committente.slice(0, 5))
    expect(voci.some((v) => v.genere === 'scheda' && v.id === scheda.id)).toBe(true)
  })

  it('restituisce dati e non testo già composto: centesimi e millesimi', async () => {
    const articolo = (await api.listaArticoli())[0]
    const voce = (await api.ricercaGlobale(articolo.codice)).find(
      (v) => v.genere === 'articolo' && v.id === articolo.id,
    )
    expect(voce).toBeDefined()
    if (voce?.genere !== 'articolo') return expect.unreachable('doveva essere un articolo')
    expect(voce.prezzo_listino_cents).toBe(articolo.prezzo_listino_cents)
    expect(voce.unita_misura).toBe(articolo.unita_misura)
    // La disponibilità non è mai negativa: «impegnato più della giacenza» è un
    // problema di magazzino, non un numero da stampare col meno davanti.
    expect(voce.disponibile_milli).toBeGreaterThanOrEqual(0)
  })

  it('limita ogni gruppo, non il totale: una ricerca globale mostra di tutto', async () => {
    const voci = await api.ricercaGlobale('a', 1)
    for (const genere of new Set(voci.map((v) => v.genere))) {
      expect(voci.filter((v) => v.genere === genere).length).toBe(1)
    }
  })

  it('non cerca niente con la stringa vuota', async () => {
    expect(await api.ricercaGlobale('')).toEqual([])
    expect(await api.ricercaGlobale('   ')).toEqual([])
  })
})

describe('errori', () => {
  it('usa i codici HTTP che userà il backend', async () => {
    try {
      await api.cliente('non-esiste')
      expect.unreachable('doveva lanciare')
    } catch (e) {
      expect(e).toBeInstanceOf(ErroreApi)
      expect((e as ErroreApi).status).toBe(404)
    }
  })
})
