/**
 * Il seed è dati, ma è anche la prima prova che il modello regge: se una
 * giacenza va negativa o da una partita esce più di quanto ci è entrato, c'è un
 * errore di modello, non un refuso nei numeri.
 */

import { describe, expect, it } from 'vitest'

import { chiaveGiacenza, disponibile, eStorico, naturaFiscaleDa, quantitaConSegno } from '../domain'
import {
  giacenzePerCoppia,
  ricalcolaDerivati,
  verificaInvarianteGiacenze,
  verificaInvarianteLotti,
  type Db,
} from './db'
import { comprimi, decomprimi } from './compressione'
import { costruisciSeed } from './seed'

function dbSeminato(): Db {
  const db = { versione: 0, ...costruisciSeed() }
  ricalcolaDerivati(db)
  return db
}

describe('seed', () => {
  const db = dbSeminato()

  it('contiene tutte le collezioni popolate', () => {
    expect(db.clienti.length).toBeGreaterThan(5)
    expect(db.fornitori.length).toBeGreaterThan(2)
    expect(db.articoli.length).toBeGreaterThan(10)
    expect(db.lotti.length).toBeGreaterThan(5)
    expect(db.movimenti.length).toBeGreaterThan(20)
    expect(db.preventivi.length).toBeGreaterThan(5)
    expect(db.ordini.length).toBeGreaterThan(3)
    expect(db.ddt.length).toBeGreaterThan(2)
    expect(db.acquisti.length).toBeGreaterThan(3)
    expect(db.pagamenti.length).toBeGreaterThan(5)
    expect(db.schede_lavorazione.length).toBeGreaterThan(1)
  })

  it('ha schede di lavorazione coerenti: numeri, riferimenti, misure, date', () => {
    const anno = new Date().getFullYear()
    const numeri = db.schede_lavorazione.map((s) => s.numero)
    expect(new Set(numeri).size).toBe(numeri.length)
    for (const s of db.schede_lavorazione) {
      expect(s.numero).toMatch(new RegExp(`^SCH-${anno}-\\d{4}$`))
      expect(s.committente.trim()).not.toBe('')
      expect(s.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      if (s.data_consegna) expect(s.data_consegna).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // I riferimenti sono provenienza, ma nel seed devono puntare a record veri
      if (s.ordine_id) expect(db.ordini.some((o) => o.id === s.ordine_id)).toBe(true)
      if (s.articolo_id) expect(db.articoli.some((a) => a.id === s.articolo_id)).toBe(true)
      if (s.fornitore_id) expect(db.fornitori.some((f) => f.id === s.fornitore_id)).toBe(true)
      // Le forbici di misura non si incrociano
      if (s.larghezza_da_mm !== null && s.larghezza_a_mm !== null) {
        expect(s.larghezza_da_mm).toBeLessThanOrEqual(s.larghezza_a_mm)
      }
      if (s.lunghezza_da_mm !== null && s.lunghezza_a_mm !== null) {
        expect(s.lunghezza_da_mm).toBeLessThanOrEqual(s.lunghezza_a_mm)
      }
    }
  })

  it('non lascia che una scheda di lavorazione muova il magazzino', () => {
    // La scheda è una specifica verso il fornitore: nessun movimento la cita.
    const conScheda = db.movimenti.filter(
      (m) => m.documento_numero?.startsWith('SCH-') || /scheda/i.test(m.causale),
    )
    expect(conScheda).toEqual([])
  })

  it('non vende servizi come se fossero merce', () => {
    // `stadio` e `categoria` non hanno più i valori delle lavorazioni, quindi
    // il compilatore da solo garantisce metà del vincolo. L'altra metà è che
    // nessuna voce di natura `merce` si chiami come un servizio.
    //
    // Il filtro su `natura` non è un'attenuazione: i dati importati dal vecchio
    // gestionale contengono davvero righe di posa e di trasporto da fatturare,
    // e sono `servizio_terzi` e `spesa`. Il vincolo vero non è «la parola posa
    // non esiste», è «la posa non è merce» — e la riga sotto lo dice meglio.
    const sospetti = db.articoli.filter(
      (a) =>
        a.natura === 'merce' &&
        /posa|levigatur|sabbiatur|verniciatur|piallatur/i.test(`${a.nome} ${a.descrizione ?? ''}`),
    )
    expect(sospetti.map((a) => a.codice)).toEqual([])
  })

  it('non movimenta il magazzino con voci che non sono merce', () => {
    const perId = new Map(db.articoli.map((a) => [a.id, a]))
    const illeciti = db.movimenti.filter((m) => {
      if (!m.articolo_id) return false
      return perId.get(m.articolo_id)?.natura !== 'merce'
    })
    expect(illeciti.map((m) => m.causale)).toEqual([])
  })

  it('marca i dati dimostrativi come nati qui, non importati', () => {
    // `id_esterno` non è un riempitivo: distingue il seed dai dati importati, e
    // `eStorico` ci conta. Se un record del seed avesse un'origine esterna,
    // l'import lo scambierebbe per un proprio record e lo sovrascriverebbe.
    const conOrigine = [
      ...db.clienti,
      ...db.fornitori,
      ...db.articoli,
      ...db.lotti,
      ...db.movimenti,
      ...db.preventivi,
      ...db.ordini,
      ...db.ddt,
      ...db.acquisti,
      ...db.pagamenti,
    ].filter(eStorico)
    expect(conOrigine).toEqual([])
  })

  it('deriva la natura fiscale dagli identificativi', () => {
    for (const c of db.clienti) {
      expect(c.natura_fiscale).toBe(naturaFiscaleDa(c.piva, c.codice_fiscale))
    }
    // Un'azienda con partita IVA a 11 cifre e nessun codice fiscale è una
    // società: è il caso più comune, e se sparisse il seed non rappresenterebbe
    // più il cliente tipico di Wood Revive.
    expect(db.clienti.some((c) => c.natura_fiscale === 'societa')).toBe(true)
  })

  it('rispetta l invariante giacenza = somma dei movimenti', () => {
    expect(verificaInvarianteGiacenze(db)).toEqual([])
  })

  it('non ha giacenze negative', () => {
    const negative = db.articoli.filter((a) => a.giacenza_milli < 0)
    expect(negative.map((a) => `${a.codice} ${a.giacenza_milli}`)).toEqual([])
  })

  it('non impegna più di quanto ci sia a magazzino', () => {
    const sforati = db.articoli.filter((a) => disponibile(a) < 0)
    expect(sforati.map((a) => a.codice)).toEqual([])
  })

  it('non fa uscire da una partita più di quanto ci è entrato', () => {
    expect(verificaInvarianteLotti(db)).toEqual([])
  })

  it('non fa uscire materiale da un lotto prima che sia stato comprato', () => {
    const perLotto = new Map(db.lotti.map((l) => [l.id, l]))
    for (const m of db.movimenti) {
      if (!m.lotto_id || m.tipo !== 'scarico') continue
      const lotto = perLotto.get(m.lotto_id)
      expect(lotto).toBeDefined()
      expect(m.data >= lotto!.data_acquisto).toBe(true)
    }
  })

  it('carica ogni articolo dichiarato sulle righe di DDT dalla partita che dichiarano', () => {
    // È il controllo che rende vera la tracciabilità: se un DDT dice «questo
    // pavimento viene dal fienile di Cordignano», di quella coppia
    // (articolo, lotto) deve esserci stato un carico.
    const coppie = giacenzePerCoppia(db)
    for (const d of db.ddt) {
      if (d.stato !== 'emesso' && d.stato !== 'consegnato') continue
      for (const r of d.righe) {
        if (!r.lotto_id || !r.articolo_id) continue
        const voce = coppie.get(chiaveGiacenza(r.articolo_id, r.lotto_id))
        expect(voce, `${d.numero}: ${r.codice_articolo} non è mai entrato con ${r.lotto_codice}`).toBeDefined()
        expect(voce!.caricato_milli).toBeGreaterThanOrEqual(r.quantita_milli)
      }
    }
  })

  it('deriva lo stato dei lotti dal residuo, e ne ha almeno uno esaurito', () => {
    const esauriti = db.lotti.filter((l) => l.stato === 'esaurito')
    expect(esauriti.length).toBeGreaterThan(0)
    for (const l of esauriti) {
      const residuo = [...giacenzePerCoppia(db).values()]
        .filter((v) => v.lotto_id === l.id)
        .reduce((t, v) => t + v.residuo_milli, 0)
      expect(residuo).toBe(0)
    }
    expect(db.lotti.filter((l) => l.stato === 'disponibile').length).toBeGreaterThan(0)
  })

  it('dà a ogni articolo un prezzo di acquisto sotto il prezzo di vendita', () => {
    for (const a of db.articoli) {
      expect(a.prezzo_acquisto_cents, a.codice).toBeGreaterThan(0)
      expect(a.prezzo_acquisto_cents, a.codice).toBeLessThan(a.prezzo_listino_cents)
    }
  })

  it('calcola i totali dei documenti invece di scriverli a mano', () => {
    for (const p of db.preventivi) {
      const somma = p.righe.reduce((t, r) => t + r.imponibile_cents, 0)
      expect(p.imponibile_cents).toBeLessThanOrEqual(somma)
      expect(p.totale_cents).toBe(p.imponibile_cents + p.iva_cents)
      expect(p.data_scadenza > p.data).toBe(true)
    }
  })

  it('ricava il costo di ogni partita dall’ordine di acquisto, trasporto compreso', () => {
    for (const l of db.lotti) {
      if (!l.ordine_acquisto_id) continue
      const a = db.acquisti.find((x) => x.id === l.ordine_acquisto_id)!
      const righe = a.righe.reduce((t, r) => t + r.imponibile_cents, 0)
      expect(l.costo_acquisto_cents).toBe(righe + a.spese_trasporto_cents)
      expect(l.costo_acquisto_cents).toBeGreaterThan(righe)
    }
  })

  it('marca come evase le righe degli ordini coperte da DDT', () => {
    const evaso = db.ordini.find((o) => o.stato === 'evaso')
    expect(evaso).toBeDefined()
    for (const r of evaso!.righe) {
      expect(r.quantita_evasa_milli).toBe(r.quantita_milli)
    }
  })

  it('lascia intatto il magazzino per i DDT in bozza', () => {
    const bozza = db.ddt.find((d) => d.stato === 'bozza')
    expect(bozza).toBeDefined()
    const movimentiDelDdt = db.movimenti.filter((m) => m.documento_id === bozza!.id)
    expect(movimentiDelDdt).toEqual([])
  })

  it('valorizza ogni movimento di carico', () => {
    const carichiSenzaValore = db.movimenti.filter(
      (m) => quantitaConSegno(m) > 0 && m.valore_unitario_cents <= 0,
    )
    expect(carichiSenzaValore.map((m) => m.causale)).toEqual([])
  })

  it('non genera movimenti senza articolo: sarebbero merce che nessuno conta', () => {
    // Un carico con `articolo_id: null` sfuggirebbe a
    // `verificaInvarianteGiacenze`, che salta i movimenti senza articolo:
    // sarebbe valore in magazzino che nessun controllo sorveglia.
    const orfani = db.movimenti.filter((m) => !m.articolo_id)
    expect(orfani.map((m) => m.causale)).toEqual([])
  })

  it('deriva incassato e residuo di ogni ordine dai pagamenti', () => {
    for (const o of db.ordini) {
      const somma = db.pagamenti
        .filter((p) => p.ordine_id === o.id)
        .reduce((t, p) => t + p.importo_cents, 0)
      expect(o.incassato_cents, o.numero).toBe(somma)
      expect(o.residuo_cents, o.numero).toBe(o.totale_cents - somma)
    }
  })

  it('fa nascere ogni ordine da un preventivo: non esistono ordini diretti', () => {
    // È la regola confermata dal committente, non una proprietà accidentale dei
    // dati: il preventivo è il documento che il cliente accetta, e tutto il
    // resto discende da lì. I dati dimostrativi non possono suggerire che si
    // possa lavorare in un altro modo.
    const perId = new Map(db.preventivi.map((p) => [p.id, p]))
    for (const o of db.ordini) {
      expect(o.preventivo_id, `${o.numero} non ha un preventivo di origine`).toBeTruthy()
      const p = perId.get(o.preventivo_id!)
      expect(p, `${o.numero} rimanda a un preventivo inesistente`).toBeDefined()
      expect(o.preventivo_numero).toBe(p!.numero)
      // Il legame è nei due sensi, e il preventivo convertito lo dichiara.
      expect(p!.ordine_id).toBe(o.id)
      expect(p!.stato).toBe('convertito')
      // Nessun ordine può precedere il preventivo che lo ha generato.
      expect(o.data >= p!.data, `${o.numero} precede ${p!.numero}`).toBe(true)
    }
  })

  it('ha un ordine saldato, uno scaduto e uno in scadenza', () => {
    const oggi = new Date().toISOString().slice(0, 10)
    expect(db.ordini.filter((o) => o.residuo_cents <= 0).length).toBeGreaterThan(0)
    expect(
      db.ordini.filter(
        (o) => o.residuo_cents > 0 && o.data_scadenza_saldo && o.data_scadenza_saldo < oggi,
      ).length,
    ).toBeGreaterThan(1)
    expect(
      db.ordini.filter(
        (o) => o.residuo_cents > 0 && o.data_scadenza_saldo && o.data_scadenza_saldo > oggi,
      ).length,
    ).toBeGreaterThan(0)
  })
})

describe('compressione del salvataggio', () => {
  // Il tetto di localStorage in Chrome è stato MISURATO: 4,98 M caratteri.
  // L'archivio completo proiettato è 4,08 M — ci starebbe, ma con il 18% di
  // margine, che sparisce prima di dicembre. Questi test fissano il contratto
  // della compressione, che è ciò che porta il margine al 93%.
  it('rende un JSON grande molto più piccolo, e lo restituisce identico', async () => {
    const db = dbSeminato()
    const testo = JSON.stringify(db)
    const compresso = await comprimi(testo)

    expect(compresso.startsWith('gz1:')).toBe(true)
    // il seed è piccolo, ma il rapporto di compressione è già significativo.
    expect(compresso.length).toBeLessThan(testo.length)
    expect(await decomprimi(compresso)).toBe(testo)
  })

  it('legge ancora un payload NON compresso', async () => {
    // I dati salvati prima che questo file esistesse sono in chiaro, e al primo
    // avvio dopo l'aggiornamento non devono andare persi.
    const chiaro = '{"versione":6,"clienti":[]}'
    expect(await decomprimi(chiaro)).toBe(chiaro)
  })

  it('non comprime quando comprimere costerebbe di più', async () => {
    // Su un payload minuscolo l'involucro base64 pesa più del guadagno: si tiene
    // l'originale, perché non esiste un caso in cui valga la pena scrivere di più.
    const minuscolo = '{}'
    expect(await comprimi(minuscolo)).toBe(minuscolo)
  })

  it('regge un payload da megabyte senza sfondare lo stack', async () => {
    // ⚠️ `String.fromCharCode(...byte)` con lo spread su 400 KB solleva
    // `RangeError: Maximum call stack size exceeded`. La conversione va a blocchi,
    // e questo test è ciò che impedisce a qualcuno di «semplificarla».
    const grande = JSON.stringify(
      Array.from({ length: 20000 }, (_, i) => ({ id: `rec-${i}`, descrizione: 'Perlinato abete prima patina 20 mm' })),
    )
    expect(grande.length).toBeGreaterThan(1_000_000)
    const compresso = await comprimi(grande)
    expect(await decomprimi(compresso)).toBe(grande)
  })
})
