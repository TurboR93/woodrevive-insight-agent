/**
 * Schede di lavorazione dimostrative.
 *
 * Tre momenti del ciclo di vita: una inviata al fornitore e in attesa del
 * materiale, una bozza appena precompilata dal catalogo, una chiusa da mesi.
 * Il contenuto della prima ricalca il modulo cartaceo vero (mat_cliente/):
 * lamelle d'abete prima patina calibrate a 6 mm, da finire a saponato.
 *
 * Il committente è un nome copiato, non una FK: la seconda scheda lo dimostra
 * con un committente che in anagrafica non esiste.
 */

import type { SchedaLavorazione } from '../../domain'
import type { Seme } from './comuni'
import { giorniFa, giorniTra, mesiFa, num, tracce } from './comuni'

export const schede: Seme<SchedaLavorazione>[] = [
  {
    id: 'sch-01',
    numero: num('SCH', 1),
    data: giorniFa(6),
    committente: 'Hotel Alle Nevi',
    telefono: '0364 900112',
    data_consegna: giorniTra(24),
    ordine_id: 'ord-04',
    ordine_numero: num('ORD', 4),
    articolo_id: 'art-09',
    fornitore_id: 'for-03',
    fornitore_nome: 'Segheria Fratelli Da Ros',
    tipologie: ['pavimenti'],
    essenza: 'abete',
    larghezza_da_mm: 140,
    larghezza_a_mm: 210,
    lunghezza_da_mm: 1500,
    // Nessun massimo, come sul modulo vero: «lunghezze da 1500 a tutte
    // superiori», con il 40% oltre i 2.500 chiesto nelle annotazioni. Un
    // massimo a 2500 avrebbe vietato nel riquadro ciò che l'annotazione chiede.
    lunghezza_a_mm: null,
    spessore_mm: 6,
    spazzolatura: 'Nessuna: NON spazzolate',
    stucco_colore: null,
    bordo_frontale: null,
    finitura: 'Per saponato',
    quantita_milli: 100000,
    unita_misura: 'mq',
    annotazioni:
      'Cartelle abete prima patina calibrate a 6 mm (tolleranza 4/5 decimi). ' +
      'Lunghezze dal 40% sopra i 2.500 mm. Essiccate, non rifilate e non intestate.',
    stato: 'inviata',
    ...tracce(giorniFa(6)),
  },
  {
    id: 'sch-02',
    numero: num('SCH', 2),
    data: giorniFa(2),
    // In anagrafica non c'è: il committente è una riga scritta a mano,
    // esattamente come sul modulo cartaceo.
    committente: 'Studio Arch. Menegon',
    telefono: '0437 220481',
    data_consegna: null,
    ordine_id: null,
    ordine_numero: null,
    articolo_id: 'art-03',
    fornitore_id: null,
    fornitore_nome: null,
    tipologie: ['rivestimenti', 'piani'],
    essenza: 'abete',
    larghezza_da_mm: 140,
    larghezza_a_mm: 320,
    lunghezza_da_mm: 1000,
    lunghezza_a_mm: 4000,
    spessore_mm: 30,
    spazzolatura: null,
    stucco_colore: null,
    bordo_frontale: null,
    finitura: null,
    quantita_milli: null,
    unita_misura: null,
    annotazioni: 'In attesa delle misure definitive dal cantiere.',
    stato: 'bozza',
    ...tracce(giorniFa(2)),
  },
  {
    id: 'sch-03',
    numero: num('SCH', 3),
    data: mesiFa(3, 4),
    committente: 'Costruzioni Dolomiti S.r.l.',
    telefono: '0437 992410',
    data_consegna: mesiFa(2, 2),
    ordine_id: 'ord-01',
    ordine_numero: num('ORD', 1),
    articolo_id: 'art-07',
    fornitore_id: 'for-03',
    fornitore_nome: 'Segheria Fratelli Da Ros',
    tipologie: ['rivestimenti'],
    essenza: 'abete',
    larghezza_da_mm: 100,
    larghezza_a_mm: 180,
    lunghezza_da_mm: 1500,
    lunghezza_a_mm: 3000,
    spessore_mm: 20,
    spazzolatura: 'Leggera, a grana fine',
    stucco_colore: 'Bruno scuro, solo sui nodi passanti',
    bordo_frontale: 'Maschio-femmina',
    finitura: 'Nessuna: si posa a vista',
    quantita_milli: 85000,
    unita_misura: 'mq',
    annotazioni: 'Materiale arrivato conforme e consegnato al cantiere di Falcade.',
    stato: 'chiusa',
    ...tracce(mesiFa(3, 4)),
  },
]
