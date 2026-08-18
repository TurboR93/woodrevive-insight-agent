/**
 * Lotti e inventario iniziale.
 *
 * Il lotto è la **partita d'acquisto**: da quale edificio viene il materiale
 * arrivato con una fornitura. Non ha una quantità propria — la quantità sta
 * sugli articoli caricati con quel lotto — e non ha un costo scritto a mano:
 * `seed/index.ts` lo ricava dall'ordine di acquisto collegato, trasporto
 * compreso, come farebbe la ricezione.
 *
 * Nemmeno lo stato si scrive: `disponibile` o `esaurito` li deriva
 * `ricalcolaDerivati()` dal residuo. Qui parte da `disponibile` e chi legge il
 * seed non deve fidarsi di questo valore.
 *
 * I movimenti di magazzino NON stanno qui: li deriva `seed/index.ts` da questi
 * fatti, esattamente come farebbe l'applicazione. Così il seed non può nascere
 * incoerente — l'invariante `giacenza = Σ movimenti` vale per costruzione.
 */

import type { Lotto } from '../../domain'
import type { Seme } from './comuni'
import { mesiFa, num, tracce } from './comuni'

/** Le partite acquistate. Ognuna corrisponde a un ordine di acquisto ricevuto. */
export const lotti: Seme<Lotto>[] = [
  {
    id: 'lot-01',
    codice: num('LOT', 1),
    descrizione: 'Tabià di Falcade',
    fornitore_id: 'for-02',
    ordine_acquisto_id: 'acq-01',
    provenienza_edificio: 'Tabià di fondovalle',
    provenienza_localita: 'Falcade',
    provenienza_provincia: 'BL',
    anno_costruzione_stimato: 1905,
    data_acquisto: mesiFa(8, 6),
    essenza: 'larice',
    patina: 'bruciato_sole',
    qualita: 'A',
    costo_acquisto_cents: 0, // derivato da ACQ-0001 in seed/index.ts
    ubicazione: 'Capannone A — campata 1',
    stato: 'disponibile', // derivato: risulterà esaurito, l'ha svuotato DDT-0001
    note_storiche:
      'Tabià smontato per far posto a una strada forestale. Tavolato esterno rivolto a sud, ' +
      'bruciato dal sole per un secolo: colore bruno caldo che nessun trattamento riproduce.',
    note: 'Partita piccola, comprata tutta in una volta.',
    foto: [],
    ...tracce(mesiFa(8, 6)),
  },
  {
    id: 'lot-02',
    codice: num('LOT', 2),
    descrizione: 'Stalla Pieve di Soligo',
    fornitore_id: 'for-01',
    ordine_acquisto_id: 'acq-02',
    provenienza_edificio: 'Stalla con fienile sovrastante',
    provenienza_localita: 'Pieve di Soligo',
    provenienza_provincia: 'TV',
    anno_costruzione_stimato: 1935,
    data_acquisto: mesiFa(6, 5),
    essenza: 'abete',
    patina: 'seconda_patina',
    qualita: 'B',
    costo_acquisto_cents: 0,
    ubicazione: 'Capannone A — campata 4',
    stato: 'disponibile',
    note_storiche:
      'Partita grande e regolare: perlinato, pannelli e travature squadrate, tutto dallo stesso ' +
      'edificio. È il materiale su cui si appoggiano le forniture ripetitive.',
    note: null,
    foto: [],
    ...tracce(mesiFa(6, 5)),
  },
  {
    id: 'lot-03',
    codice: num('LOT', 3),
    descrizione: 'Fienile Cordignano',
    fornitore_id: 'for-03',
    ordine_acquisto_id: 'acq-03',
    provenienza_edificio: 'Fienile ottocentesco con stalla',
    provenienza_localita: 'Cordignano',
    provenienza_provincia: 'TV',
    anno_costruzione_stimato: 1890,
    data_acquisto: mesiFa(5, 8),
    essenza: 'abete',
    patina: 'prima_patina',
    qualita: 'A',
    costo_acquisto_cents: 0,
    ubicazione: 'Capannone A — campata 3',
    stato: 'disponibile',
    note_storiche:
      'Fienile della corte rurale di via Maestra, demolito per ampliamento. Il tavolato del ' +
      'sottotetto era esposto a sud: prima patina intatta su tutta la faccia a vista. ' +
      'La segheria ha consegnato tavole, pavimento e tavolame grezzo dello stesso edificio.',
    note: null,
    foto: [],
    ...tracce(mesiFa(5, 8)),
  },
  {
    id: 'lot-04',
    codice: num('LOT', 4),
    descrizione: 'Malga di Vodo',
    fornitore_id: 'for-02',
    ordine_acquisto_id: 'acq-04',
    provenienza_edificio: 'Malga d’alpeggio',
    provenienza_localita: 'Vodo di Cadore',
    provenienza_provincia: 'BL',
    anno_costruzione_stimato: 1920,
    data_acquisto: mesiFa(4, 3),
    essenza: 'larice',
    patina: 'bruciato_sole',
    qualita: 'A',
    costo_acquisto_cents: 0,
    ubicazione: 'Capannone A — campata 1',
    stato: 'disponibile',
    note_storiche:
      'Malga d’alpeggio a 1.600 metri, dismessa negli anni Settanta. Larice cresciuto lento, ' +
      'anelli fittissimi: si vede in controluce sul taglio di testa.',
    note: 'Ritiro con mezzo proprio: alla malga non sale il camion.',
    foto: [],
    ...tracce(mesiFa(4, 3)),
  },
  {
    id: 'lot-05',
    codice: num('LOT', 5),
    descrizione: 'Solaio Vittorio Veneto',
    fornitore_id: 'for-01',
    ordine_acquisto_id: 'acq-05',
    provenienza_edificio: 'Palazzo di fine Ottocento',
    provenienza_localita: 'Vittorio Veneto',
    provenienza_provincia: 'TV',
    anno_costruzione_stimato: 1875,
    data_acquisto: mesiFa(3, 6),
    essenza: 'rovere',
    patina: 'naturale',
    qualita: 'A',
    costo_acquisto_cents: 0,
    ubicazione: 'Capannone C — travi',
    stato: 'disponibile',
    note_storiche:
      'Solaio del palazzo di corso Mazzini. Rovere di primissima qualità, sezioni importanti ' +
      'fino a 32 cm: da qui vengono le tavole larghe e le travi tonde a vista.',
    note: 'Serviva la gru per calare le travi: trasporto più caro del solito.',
    foto: [],
    ...tracce(mesiFa(3, 6)),
  },
  {
    id: 'lot-06',
    codice: num('LOT', 6),
    descrizione: 'Palazzo Roncade',
    fornitore_id: 'for-04',
    ordine_acquisto_id: 'acq-06',
    provenienza_edificio: 'Palazzo signorile di campagna',
    provenienza_localita: 'Roncade',
    provenienza_provincia: 'TV',
    anno_costruzione_stimato: 1860,
    data_acquisto: mesiFa(2, 13),
    essenza: 'rovere',
    patina: 'naturale',
    qualita: 'A',
    costo_acquisto_cents: 0,
    ubicazione: 'Capannone B — prodotti finiti',
    stato: 'disponibile',
    note_storiche:
      'Comprata dal grossista di Trento, che l’aveva recuperata dal solaio di un palazzo di ' +
      'campagna sul Sile. Arriva già pronta: pavimento bistrato e lamelle, con la scheda di ' +
      'provenienza firmata dal fornitore.',
    note: null,
    foto: [],
    ...tracce(mesiFa(2, 13)),
  },
  {
    id: 'lot-07',
    codice: num('LOT', 7),
    descrizione: 'Baita Val Boite',
    fornitore_id: 'for-02',
    ordine_acquisto_id: 'acq-07',
    provenienza_edificio: 'Baita di alta quota',
    provenienza_localita: 'Borca di Cadore',
    provenienza_provincia: 'BL',
    anno_costruzione_stimato: 1890,
    data_acquisto: mesiFa(2, 14),
    essenza: 'cirmolo',
    patina: 'prima_patina',
    qualita: 'A',
    costo_acquisto_cents: 0,
    ubicazione: 'Capannone B — scaffale 7',
    stato: 'disponibile',
    note_storiche:
      'Rivestimento della stube di una baita sopra Borca. Cirmolo ancora profumato dopo ' +
      'centotrent’anni. Quantità piccola: da riservare ai lavori su misura.',
    note: null,
    foto: [],
    ...tracce(mesiFa(2, 14)),
  },
]

/**
 * Inventario iniziale: quello che c'era a magazzino il giorno in cui il
 * gestionale è entrato in funzione. Sono rettifiche di inventario, non
 * acquisti: nessuna partita le giustifica, e nel libro giornale si distinguono
 * proprio per questo — sono merce vera di cui non si sa più la provenienza.
 *
 * `[articolo_id, quantità in millesimi, valore unitario in centesimi]`
 */
export const inventarioIniziale: Array<[string, number, number]> = [
  ['art-01', 3000, 29500], // tavolame grezzo abete, m³
  ['art-04', 62000, 8400], // tavola abete 50 grigio
  ['art-05', 20000, 6700], // tavola larice 25 bruciato
  ['art-07', 40000, 4400], // perlinato abete
  ['art-09', 80000, 3300], // lamella abete 6
  ['art-11', 20000, 8500], // pannello 3 strati
  ['art-12', 30000, 2500], // travatura abete squadrata
  ['art-16', 58000, 7900], // rivestimento effetto bruciato
]

/** Data dell'inventario iniziale: l'avvio del gestionale. */
export const dataInventarioIniziale = mesiFa(10, 1)
