/**
 * Incassi del seed.
 *
 * Gli importi NON si scrivono a mano dove sono derivabili: l'acconto è quello
 * pattuito sull'ordine, il saldo è quello che resta dopo l'acconto. Se domani
 * cambia un prezzo di riga, i pagamenti seguono il totale invece di
 * contraddirlo — è la stessa regola dei totali di documento.
 *
 * La fotografia che ne esce è quella di un commerciante vero:
 *   ORD-0001  incassato tutto, chiuso
 *   ORD-0002  acconto preso, saldo SCADUTO da più di una settimana
 *   ORD-0003  acconto, un versamento in contanti, una nota di credito per due
 *             tavole fessurate, e il resto SCADUTO da tre settimane
 *   ORD-0004  acconto più una Ri.Ba., saldo fra nove giorni
 *   ORD-0005  solo l'acconto, saldo in scadenza fra quattro giorni
 * più una caparra da un cliente per una fornitura non ancora ordinata.
 */

import type { Ordine, Pagamento } from '../../domain'
import type { Seme } from './comuni'
import { giorniFa, mesiFa, tracce } from './comuni'

interface SemePagamento {
  id: string
  ordine_id: string | null
  /** Cliente: obbligatorio solo per i pagamenti senza ordine. */
  cliente_id?: string
  cliente_nome?: string
  tipo: Pagamento['tipo']
  data: string
  mezzo: Pagamento['mezzo']
  riferimento: string | null
  note: string | null
  /**
   * Come si ricava l'importo:
   *   'acconto' → l'acconto pattuito sull'ordine
   *   'saldo'   → tutto quello che resta dopo l'acconto
   *   numero    → un importo preciso, in centesimi (negativo per gli storni)
   */
  importo: 'acconto' | 'saldo' | number
}

const semi: SemePagamento[] = [
  {
    id: 'pag-01',
    ordine_id: 'ord-01',
    tipo: 'acconto',
    data: mesiFa(2, 26),
    mezzo: 'bonifico',
    riferimento: 'CRO 4471902',
    note: 'Acconto 40% alla conferma.',
    importo: 'acconto',
  },
  {
    id: 'pag-02',
    ordine_id: 'ord-01',
    tipo: 'saldo',
    data: mesiFa(2, 3),
    mezzo: 'bonifico',
    riferimento: 'CRO 4489130',
    note: 'Saldo alla consegna in cantiere.',
    importo: 'saldo',
  },
  {
    id: 'pag-03',
    ordine_id: 'ord-02',
    tipo: 'acconto',
    data: giorniFa(19),
    mezzo: 'bonifico',
    riferimento: 'CRO 5012884',
    note: null,
    importo: 'acconto',
  },
  {
    id: 'pag-04',
    ordine_id: 'ord-03',
    tipo: 'acconto',
    data: mesiFa(2, 12),
    mezzo: 'bonifico',
    riferimento: 'CRO 4462017',
    note: null,
    importo: 'acconto',
  },
  {
    id: 'pag-05',
    ordine_id: 'ord-03',
    tipo: 'saldo',
    data: giorniFa(24),
    mezzo: 'contanti',
    riferimento: null,
    note: 'Versamento parziale alla consegna. Il resto era promesso a fine mese.',
    importo: 200000,
  },
  {
    id: 'pag-06',
    ordine_id: 'ord-03',
    tipo: 'nota_credito',
    data: giorniFa(15),
    mezzo: 'bonifico',
    riferimento: 'NC 2',
    note: 'Due tavole con una fenditura passante: storno concordato.',
    importo: -45000,
  },
  {
    id: 'pag-07',
    ordine_id: 'ord-04',
    tipo: 'acconto',
    data: giorniFa(21),
    mezzo: 'bonifico',
    riferimento: 'CRO 5033471',
    note: null,
    importo: 'acconto',
  },
  {
    id: 'pag-08',
    ordine_id: 'ord-04',
    tipo: 'saldo',
    data: giorniFa(6),
    mezzo: 'riba',
    riferimento: 'RIBA 118/A',
    note: 'Prima Ri.Ba. di due: la seconda scade con il saldo.',
    importo: 200000,
  },
  {
    id: 'pag-09',
    ordine_id: 'ord-05',
    tipo: 'acconto',
    data: giorniFa(8),
    mezzo: 'assegno',
    riferimento: 'Assegno 0034512',
    note: 'Ritirato in showroom alla firma dell’ordine.',
    importo: 'acconto',
  },
  {
    id: 'pag-10',
    ordine_id: null,
    cliente_id: 'cli-05',
    cliente_nome: 'Falegnameria Bettiol',
    tipo: 'acconto',
    data: giorniFa(30),
    mezzo: 'contanti',
    riferimento: null,
    note: 'Caparra su una partita di tavolame grezzo da definire.',
    importo: 150000,
  },
]

/**
 * Costruisce i pagamenti dagli ordini già totalizzati.
 * Va chiamata DOPO `ricalcolaVendita`, altrimenti i saldi verrebbero calcolati
 * su totali a zero.
 */
export function costruisciPagamenti(ordini: Seme<Ordine>[]): Seme<Pagamento>[] {
  const perId = new Map(ordini.map((o) => [o.id, o]))

  return semi.map((s) => {
    const ordine = s.ordine_id ? perId.get(s.ordine_id) : undefined
    if (s.ordine_id && !ordine) {
      throw new Error(`seed/incassi: l'ordine ${s.ordine_id} di ${s.id} non esiste`)
    }

    let importo: number
    if (typeof s.importo === 'number') importo = s.importo
    else if (s.importo === 'acconto') importo = ordine?.acconto_cents ?? 0
    else importo = (ordine?.totale_cents ?? 0) - (ordine?.acconto_cents ?? 0)

    return {
      id: s.id,
      cliente_id: ordine?.cliente_id ?? s.cliente_id!,
      cliente_nome: ordine?.cliente_nome ?? s.cliente_nome!,
      ordine_id: ordine?.id ?? null,
      ordine_numero: ordine?.numero ?? null,
      tipo: s.tipo,
      data: s.data,
      importo_cents: importo,
      mezzo: s.mezzo,
      riferimento: s.riferimento,
      note: s.note,
      ...tracce(s.data),
    }
  })
}
