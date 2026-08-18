/**
 * Arrotondamenti e conversioni, spinti fin dove fanno male.
 *
 * `calcoli.test.ts` prova che le formule fanno quello che dicono. Qui si prova
 * che continuano a farlo con i numeri che nella realtà si incontrano davvero:
 * importi che non si dividono per tre, sconti con i decimali, spessori dispari.
 * È lì che un centesimo sparisce e il PDF non torna con il commercialista.
 */

import { describe, expect, it } from 'vitest'

import { imponibileRiga, ripartisci, totaliDocumento, type RigaCalcolabile } from '../lib/money'
import { mcAMq, mqAMc, volumeMilli } from '../lib/qty'

// ===========================================================================
// Sconto generale + IVA multi-aliquota
// ===========================================================================

interface CasoTotali {
  nome: string
  righe: RigaCalcolabile[]
  sconto: number
}

const casi: CasoTotali[] = [
  {
    nome: 'due aliquote su importi che non si dividono',
    righe: [
      { imponibile_cents: 3333, aliquota_iva: 22 },
      { imponibile_cents: 3333, aliquota_iva: 10 },
    ],
    sconto: 7,
  },
  {
    nome: 'tre righe e uno sconto con i decimali',
    righe: [
      { imponibile_cents: 3333, aliquota_iva: 22 },
      { imponibile_cents: 3333, aliquota_iva: 22 },
      { imponibile_cents: 3334, aliquota_iva: 10 },
    ],
    sconto: 13.5,
  },
  {
    nome: 'una riga da un centesimo accanto a una grossa',
    righe: [
      { imponibile_cents: 1, aliquota_iva: 22 },
      { imponibile_cents: 999_999, aliquota_iva: 10 },
    ],
    sconto: 33,
  },
  {
    nome: 'tre aliquote e importi minuscoli',
    righe: [
      { imponibile_cents: 7, aliquota_iva: 22 },
      { imponibile_cents: 11, aliquota_iva: 10 },
      { imponibile_cents: 13, aliquota_iva: 4 },
    ],
    sconto: 3,
  },
  {
    nome: 'importi grandi e primi',
    righe: [
      { imponibile_cents: 123_457, aliquota_iva: 22 },
      { imponibile_cents: 654_321, aliquota_iva: 10 },
      { imponibile_cents: 999_983, aliquota_iva: 22 },
    ],
    sconto: 12.75,
  },
  {
    nome: 'sconto totale: resta zero, non un centesimo',
    righe: [
      { imponibile_cents: 50_000, aliquota_iva: 22 },
      { imponibile_cents: 33_333, aliquota_iva: 10 },
    ],
    sconto: 100,
  },
  {
    nome: 'una riga a zero in mezzo alle altre',
    righe: [
      { imponibile_cents: 0, aliquota_iva: 22 },
      { imponibile_cents: 3333, aliquota_iva: 10 },
    ],
    sconto: 5,
  },
]

describe('sconto generale con IVA multi-aliquota', () => {
  for (const caso of casi) {
    it(`non perde centesimi — ${caso.nome}`, () => {
      const t = totaliDocumento(caso.righe, caso.sconto)
      const lordo = caso.righe.reduce((s, r) => s + r.imponibile_cents, 0)

      // 1. la somma degli imponibili per aliquota fa esattamente l'imponibile
      const sommaImponibili = t.riepilogo_iva.reduce((s, v) => s + v.imponibile_cents, 0)
      expect(sommaImponibili).toBe(t.imponibile_cents)

      // 2. l'imponibile è il lordo meno lo sconto, senza deriva
      expect(t.imponibile_lordo_cents).toBe(lordo)
      expect(t.imponibile_cents).toBe(lordo - t.sconto_generale_cents)

      // 3. IVA e totale sono la somma delle parti
      expect(t.iva_cents).toBe(t.riepilogo_iva.reduce((s, v) => s + v.iva_cents, 0))
      expect(t.totale_cents).toBe(t.imponibile_cents + t.iva_cents)

      // 4. il riepilogo copre tutte e sole le aliquote presenti, una volta ciascuna
      const aliquote = [...new Set(caso.righe.map((r) => r.aliquota_iva))].sort((a, b) => a - b)
      expect(t.riepilogo_iva.map((v) => v.aliquota)).toEqual(aliquote)
    })
  }

  it('azzera tutto con lo sconto al 100%, senza lasciare IVA appesa', () => {
    const t = totaliDocumento(
      [
        { imponibile_cents: 50_000, aliquota_iva: 22 },
        { imponibile_cents: 33_333, aliquota_iva: 10 },
      ],
      100,
    )
    expect(t.imponibile_cents).toBe(0)
    expect(t.iva_cents).toBe(0)
    expect(t.totale_cents).toBe(0)
    expect(t.riepilogo_iva.every((v) => v.imponibile_cents === 0)).toBe(true)
  })

  it('lo sconto di riga al 100% azzera la riga e non va sotto zero', () => {
    expect(imponibileRiga(33_333, 3333, 100)).toBe(0)
    expect(imponibileRiga(0, 8900, 0)).toBe(0)
    expect(imponibileRiga(10_000, 0, 50)).toBe(0)
  })

  it('ripartisce senza perdere centesimi anche con pesi sbilanciati', () => {
    for (const pesi of [[1, 999_999], [3333, 3333, 3334], [7, 11, 13], [1, 1, 1, 1, 1, 1, 1]]) {
      const quote = ripartisci(99_991, pesi)
      expect(quote.reduce((s, q) => s + q, 0)).toBe(99_991)
    }
  })
})

// ===========================================================================
// Conversioni m² ↔ m³
// ===========================================================================

describe('conversioni fra superficie e volume', () => {
  it('converte su spessori dispari, che sono la norma nel recupero', () => {
    // 100 m² di tavola da 27 mm = 2,7 m³
    expect(mqAMc(100_000, 27)).toBe(2700)
    expect(mcAMq(2700, 27)).toBe(100_000)
    // lamella da 6 mm: 250 m² = 1,5 m³
    expect(mqAMc(250_000, 6)).toBe(1500)
    expect(mcAMq(1500, 6)).toBe(250_000)
    // spessore primo: 13 mm
    expect(mqAMc(1000, 13)).toBe(13)
    expect(mcAMq(13, 13)).toBe(1000)
  })

  it('il giro di andata e ritorno resta dentro l errore di arrotondamento', () => {
    for (const spessore of [7, 13, 19, 23, 27, 33, 47, 63, 80]) {
      for (const mq of [1000, 33_333, 123_457, 999_999]) {
        const mc = mqAMc(mq, spessore)!
        const ritorno = mcAMq(mc, spessore)!
        // mqAMc arrotonda al millesimo di m³: al ritorno l'errore vale al più
        // mezzo millesimo di m³, cioè 500/spessore millesimi di m².
        const tolleranza = Math.ceil(500 / spessore) + 1
        expect(Math.abs(ritorno - mq)).toBeLessThanOrEqual(tolleranza)
      }
    }
  })

  it('calcola il volume di pezzi reali, arrotondando una volta sola alla fine', () => {
    // tavola 27 × 185 × 3200 mm = 0,015984 m³ → 16 millesimi
    expect(volumeMilli(27, 185, 3200)).toBe(16)
    // un bancale da 40 pezzi: 0,63936 m³ → 639, NON 40 × 16 = 640
    expect(volumeMilli(27, 185, 3200, 40)).toBe(639)
    // trave squadrata 200 × 200 × 4500 mm = 0,18 m³
    expect(volumeMilli(200, 200, 4500)).toBe(180)
    // lamella sottile: 6 × 120 × 1000 mm = 0,00072 m³ → sotto il millesimo
    expect(volumeMilli(6, 120, 1000)).toBe(1)
  })

  it('sotto il millesimo di m³ c è un truciolo, e vale zero', () => {
    // 3 × 50 × 1000 mm = 0,00015 m³: si arrotonda a zero, non a null
    expect(volumeMilli(3, 50, 1000)).toBe(0)
  })
})
