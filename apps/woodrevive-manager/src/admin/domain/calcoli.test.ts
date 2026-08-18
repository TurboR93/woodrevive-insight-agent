/**
 * Test dei calcoli di dominio.
 *
 * Coprono le cose che si rompono in silenzio: arrotondamenti, ripartizioni,
 * conversioni tra unità di misura. Un errore da un centesimo qui diventa un
 * totale che non torna su un PDF firmato dal cliente.
 */

import { describe, expect, it } from 'vitest'

import { imponibileRiga, nuovoCostoMedio, ripartisci, totaliDocumento } from '../lib/money'
import { inputAMilli, mcAMq, moltiplica, mqAMc, volumeMilli } from '../lib/qty'
import { euroACents, formatQuantita } from '../lib/format'
import { prossimoCodice, prossimoNumero } from '../lib/id'
import {
  CODICI_IVA,
  codiciSconosciuti,
  concorreAllIva,
  etichettaVoceRiepilogo,
} from './fiscale'
import { TRANSIZIONI_DDT, TRANSIZIONI_PREVENTIVO, transizioneAmmessa } from './stati'
import { proponiLottoFifo } from './magazzino'

describe('quantità in millesimi', () => {
  it('legge il formato italiano e quello inglese', () => {
    expect(inputAMilli('12,5')).toBe(12500)
    expect(inputAMilli('12.5')).toBe(12500)
    expect(inputAMilli('1.234,56')).toBe(1234560)
    expect(inputAMilli('1,234.56')).toBe(1234560)
    expect(inputAMilli('')).toBe(0)
    expect(inputAMilli('340 m²')).toBe(340000)
  })

  it('moltiplica quantità per prezzo arrotondando una volta sola', () => {
    // 3,5 m² a 89,00 €/m² = 311,50 €
    expect(moltiplica(3500, 8900)).toBe(31150)
    // caso che con i float darebbe 0.30000000000000004
    expect(moltiplica(1, 30000)).toBe(30)
  })

  it('formatta i pezzi senza decimali e i metri quadri con', () => {
    expect(formatQuantita(12500, 'mq')).toBe('12,5 m²')
    expect(formatQuantita(8000, 'pz')).toBe('8 pz')
    expect(formatQuantita(3457, 'mc')).toBe('3,457 m³')
  })
})

describe('volumi e conversioni', () => {
  it('calcola il volume di una tavola dalle misure in mm', () => {
    // 30 × 200 × 2000 mm = 0,012 m³
    expect(volumeMilli(30, 200, 2000)).toBe(12)
    // dieci pezzi uguali
    expect(volumeMilli(30, 200, 2000, 10)).toBe(120)
  })

  it('ritorna null se manca una misura, invece di fingere zero', () => {
    expect(volumeMilli(null, 200, 2000)).toBeNull()
    expect(volumeMilli(30, 200, undefined)).toBeNull()
    expect(mqAMc(340000, null)).toBeNull()
  })

  it('converte metri quadri in metri cubi e viceversa', () => {
    // 340 m² di tavola da 30 mm = 10,2 m³
    expect(mqAMc(340000, 30)).toBe(10200)
    expect(mcAMq(10200, 30)).toBe(340000)
  })
})

describe('imponibile di riga', () => {
  it('applica lo sconto di riga', () => {
    expect(imponibileRiga(10000, 8900, 0)).toBe(89000)
    expect(imponibileRiga(10000, 8900, 10)).toBe(80100)
  })
})

describe('totali di documento', () => {
  const righe = [
    { imponibile_cents: 89000, aliquota_iva: 22 },
    { imponibile_cents: 45000, aliquota_iva: 22 },
    { imponibile_cents: 30000, aliquota_iva: 10 },
  ]

  it('somma per aliquota e produce il riepilogo IVA', () => {
    const t = totaliDocumento(righe)
    expect(t.imponibile_cents).toBe(164000)
    expect(t.riepilogo_iva).toHaveLength(2)
    // senza `codice_iva` la chiave del gruppo è l'aliquota, come è sempre stato
    expect(t.riepilogo_iva[0]).toEqual({
      codice: '10',
      aliquota: 10,
      natura: null,
      imponibile_cents: 30000,
      iva_cents: 3000,
    })
    expect(t.riepilogo_iva[1]).toEqual({
      codice: '22',
      aliquota: 22,
      natura: null,
      imponibile_cents: 134000,
      iva_cents: 29480,
    })
    expect(t.iva_cents).toBe(32480)
    expect(t.totale_cents).toBe(196480)
  })

  it('tiene separati due codici con la stessa aliquota', () => {
    // `22` è imponibile, `22r` è reverse charge d'acquisto: stessa aliquota, ma
    // l'IVA la versa un altro soggetto. Fonderli falserebbe la liquidazione.
    const t = totaliDocumento([
      { imponibile_cents: 100000, aliquota_iva: 22, codice_iva: '22', natura_iva: 'imponibile' },
      {
        imponibile_cents: 50000,
        aliquota_iva: 22,
        codice_iva: '22r',
        natura_iva: 'reverse_charge_acquisto',
      },
    ])
    expect(t.riepilogo_iva).toHaveLength(2)
    expect(t.riepilogo_iva.map((v) => v.codice)).toEqual(['22', '22r'])
    expect(t.riepilogo_iva[0].natura).toBe('imponibile')
    expect(t.riepilogo_iva[1].natura).toBe('reverse_charge_acquisto')
  })

  it('tiene separati i codici a zero invece di fonderli in una voce «0%»', () => {
    // È il caso che rendeva il riepilogo per aliquota inservibile per una fattura
    // elettronica: un'esportazione, una dichiarazione d'intento e un bollo
    // escluso art. 15 sono tre nature diverse, e collassate in una sola voce la
    // fattura viene scartata dallo SDI.
    const t = totaliDocumento([
      { imponibile_cents: 200000, aliquota_iva: 0, codice_iva: 'N8a', natura_iva: 'non_imponibile' },
      { imponibile_cents: 300000, aliquota_iva: 0, codice_iva: 'N8c', natura_iva: 'non_imponibile' },
      { imponibile_cents: 200, aliquota_iva: 0, codice_iva: 'X15', natura_iva: 'escluso_art15' },
    ])
    expect(t.riepilogo_iva).toHaveLength(3)
    expect(t.riepilogo_iva.map((v) => v.codice)).toEqual(['N8a', 'N8c', 'X15'])
    expect(t.iva_cents).toBe(0)
    expect(t.totale_cents).toBe(500200)
  })

  it('somma nel riepilogo esattamente l imponibile, anche con lo sconto e più codici', () => {
    const t = totaliDocumento(
      [
        { imponibile_cents: 89000, aliquota_iva: 22, codice_iva: '22' },
        { imponibile_cents: 45000, aliquota_iva: 22, codice_iva: '22r' },
        { imponibile_cents: 30000, aliquota_iva: 10, codice_iva: '10' },
        { imponibile_cents: 12345, aliquota_iva: 0, codice_iva: 'N8a' },
      ],
      7,
    )
    const somma = t.riepilogo_iva.reduce((s, v) => s + v.imponibile_cents, 0)
    expect(somma).toBe(t.imponibile_cents)
    expect(t.totale_cents).toBe(t.imponibile_cents + t.iva_cents)
  })

  it('ripartisce lo sconto generale sulle righe prima di calcolare l IVA', () => {
    const t = totaliDocumento(righe, 10)
    expect(t.sconto_generale_cents).toBe(16400)
    expect(t.imponibile_cents).toBe(147600)
    // la somma degli imponibili per aliquota deve fare esattamente l'imponibile
    const somma = t.riepilogo_iva.reduce((s, v) => s + v.imponibile_cents, 0)
    expect(somma).toBe(t.imponibile_cents)
  })

  it('non perde centesimi con importi che non si dividono', () => {
    const dispari = [
      { imponibile_cents: 3333, aliquota_iva: 22 },
      { imponibile_cents: 3333, aliquota_iva: 22 },
      { imponibile_cents: 3334, aliquota_iva: 10 },
    ]
    const t = totaliDocumento(dispari, 7)
    const somma = t.riepilogo_iva.reduce((s, v) => s + v.imponibile_cents, 0)
    expect(somma).toBe(t.imponibile_cents)
    expect(t.imponibile_cents).toBe(10000 - t.sconto_generale_cents)
  })

  it('gestisce il documento vuoto', () => {
    const t = totaliDocumento([], 10)
    expect(t.totale_cents).toBe(0)
    expect(t.riepilogo_iva).toEqual([])
  })
})

describe('ripartizione spese', () => {
  it('distribuisce in proporzione senza perdere centesimi', () => {
    const quote = ripartisci(10000, [3333, 3333, 3334])
    expect(quote.reduce((s, q) => s + q, 0)).toBe(10000)
  })

  it('ritorna zeri se i pesi sono nulli', () => {
    expect(ripartisci(10000, [0, 0])).toEqual([0, 0])
  })
})

describe('costo medio ponderato', () => {
  it('media il costo del carico con quello della giacenza', () => {
    // 100 m² a 50,00 € + 100 m² a 70,00 € → 60,00 €
    expect(nuovoCostoMedio(100000, 5000, 100000, 7000)).toBe(6000)
  })

  it('su magazzino vuoto assume il costo del carico', () => {
    expect(nuovoCostoMedio(0, 0, 50000, 7200)).toBe(7200)
  })
})

describe('importi da tastiera', () => {
  it('legge gli euro digitati in italiano', () => {
    expect(euroACents('1.234,56')).toBe(123456)
    expect(euroACents('89')).toBe(8900)
    expect(euroACents('89,5 €')).toBe(8950)
  })
})

describe('numerazione documenti', () => {
  it('prende il massimo dell anno e incrementa', () => {
    const esistenti = ['PRV-2026-0001', 'PRV-2026-0007', 'PRV-2025-0099', 'ORD-2026-0042']
    expect(prossimoNumero('PRV', esistenti, 2026)).toBe('PRV-2026-0008')
  })

  it('parte da 1 se l anno è nuovo', () => {
    expect(prossimoNumero('DDT', ['DDT-2025-0100'], 2026)).toBe('DDT-2026-0001')
  })

  it('numera le anagrafiche senza anno', () => {
    expect(prossimoCodice('CLI', ['CLI-0001', 'CLI-0012'])).toBe('CLI-0013')
  })
})

describe('macchine a stati', () => {
  it('ammette solo le transizioni dichiarate', () => {
    expect(transizioneAmmessa(TRANSIZIONI_PREVENTIVO, 'bozza', 'inviato')).toBe(true)
    expect(transizioneAmmessa(TRANSIZIONI_PREVENTIVO, 'bozza', 'accettato')).toBe(false)
    expect(transizioneAmmessa(TRANSIZIONI_PREVENTIVO, 'convertito', 'bozza')).toBe(false)
  })

  it('non fa tornare indietro un DDT emesso', () => {
    expect(transizioneAmmessa(TRANSIZIONI_DDT, 'bozza', 'emesso')).toBe(true)
    expect(transizioneAmmessa(TRANSIZIONI_DDT, 'emesso', 'bozza')).toBe(false)
    expect(transizioneAmmessa(TRANSIZIONI_DDT, 'emesso', 'annullato')).toBe(false)
  })
})

describe('proposta FIFO della partita di prelievo', () => {
  /**
   * Le partite arrivano già ordinate dalla più vecchia, come le restituisce
   * `api.lottiDisponibiliPerArticolo`: qui si verifica la regola, non
   * l'ordinamento.
   */
  const partite = [
    { lotto_id: 'lot-vecchio', residuo_milli: 10000 },
    { lotto_id: 'lot-medio', residuo_milli: 50000 },
    { lotto_id: 'lot-recente', residuo_milli: 90000 },
  ]

  it('propone la partita più vecchia che basta a coprire la quantità', () => {
    // 8 unità stanno nella più vecchia: si smaltisce il legno fermo da più tempo.
    expect(proponiLottoFifo(partite, 8000)?.lotto_id).toBe('lot-vecchio')
  })

  it('salta le partite troppo scarse invece di proporne una che non basta', () => {
    // La più vecchia ha 10, ne servono 30: proporla farebbe scoprire l'errore
    // solo all'emissione del DDT.
    expect(proponiLottoFifo(partite, 30000)?.lotto_id).toBe('lot-medio')
    expect(proponiLottoFifo(partite, 60000)?.lotto_id).toBe('lot-recente')
  })

  it('restituisce null quando nessuna partita da sola copre la quantità', () => {
    // Non ripiega sulla più capiente: la riga va divisa o scelta a mano.
    expect(proponiLottoFifo(partite, 200000)).toBeNull()
    expect(proponiLottoFifo([], 1000)).toBeNull()
  })

  it('a parità di capienza tiene l ordine della sorgente, che è quello di acquisto', () => {
    const pari = [
      { lotto_id: 'lot-a', residuo_milli: 40000 },
      { lotto_id: 'lot-b', residuo_milli: 40000 },
    ]
    expect(proponiLottoFifo(pari, 40000)?.lotto_id).toBe('lot-a')
  })

  it('con quantità ancora da decidere propone comunque la più vecchia', () => {
    // Una riga a zero non ha niente da coprire, ma mostrare una provenienza
    // sensata è meglio che lasciarla senza.
    expect(proponiLottoFifo(partite, 0)?.lotto_id).toBe('lot-vecchio')
    expect(proponiLottoFifo([], 0)).toBeNull()
  })
})

describe('codici IVA', () => {
  it('copre tutti i codici che i dati storici usano', () => {
    // I 14 codici trovati nell'export del vecchio gestionale. Se un import futuro
    // ne porta uno nuovo, `codiciSconosciuti` lo segnala e questo test cade: è il
    // punto in cui qualcuno deve decidere che natura ha, invece di lasciarlo
    // diventare uno 0% indistinguibile.
    const usati = ['22', '10', '4', 'N8a', 'N8b', 'N8c', 'N41', 'N9', 'N71', 'E10', 'X15', 'FC', '22r', 'R17t']
    expect(codiciSconosciuti(usati)).toEqual([])
  })

  it('non fa concorrere all IVA da versare il reverse charge d acquisto', () => {
    // Ha aliquota 22 ma l'IVA si autoliquida: contarla come un acquisto
    // ordinario sarebbe un errore di liquidazione, non di arrotondamento.
    expect(concorreAllIva(CODICI_IVA['22'])).toBe(true)
    expect(CODICI_IVA['22r'].percentuale).toBe(22)
    expect(concorreAllIva(CODICI_IVA['22r'])).toBe(false)
  })

  it('stampa il riferimento normativo, non «IVA 0%», sulle operazioni non imponibili', () => {
    // Una fattura che dichiara «IVA 0%» su un'esportazione senza dire perché è
    // irregolare: il motivo della non imponibilità va indicato.
    expect(etichettaVoceRiepilogo({ codice: '22', aliquota: 22 })).toBe('IVA 22%')
    expect(etichettaVoceRiepilogo({ codice: 'N8c', aliquota: 0 })).toBe(
      'Non imp. art. 8 c. 1 lett. c DPR 633/72',
    )
    expect(etichettaVoceRiepilogo({ codice: 'X15', aliquota: 0 })).toBe('Escluso art. 15 DPR 633/72')
    // codice sconosciuto: si ripiega sull'aliquota invece di stampare vuoto
    expect(etichettaVoceRiepilogo({ codice: 'ZZZ', aliquota: 22 })).toBe('IVA 22%')
  })

  it('non dichiara una natura per la fattura elettronica dove non è difendibile', () => {
    // Un codice natura sbagliato non dà errore qui: dà una fattura scartata dallo
    // SDI giorni dopo. Dove la corrispondenza non è certa, il campo resta null.
    expect(CODICI_IVA['22'].natura_fe).toBeNull()
    expect(CODICI_IVA['22r'].natura_fe).toBeNull()
    expect(CODICI_IVA['N8c'].natura_fe).toBe('N3.5')
  })
})
