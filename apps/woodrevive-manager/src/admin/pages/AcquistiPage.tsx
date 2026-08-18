import { FileEdit, PackagePlus } from 'lucide-react'
import { useState } from 'react'

import { api } from '../api'
import BarraAzioni from '../components/BarraAzioni'
import DataTable, { CellaDoppia, type Colonna } from '../components/DataTable'
import Filtri, { opzioniDa, type ValoriFiltri } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Caricamento, Errore } from '../components/Ui'
import { useDatiCambiati } from '../components/eventiDati'
import { STATO_ACQUISTO_LABEL, TONO_ACQUISTO, type OrdineAcquisto } from '../domain'
import { formatData, formatEuro } from '../lib/format'
import { useFetch } from '../useFetch'

/**
 * Ordini di acquisto: da qui entra il legno. Ogni riga compra un articolo
 * preciso, e alla ricezione l'ordine intero diventa **una partita** — la
 * provenienza è una proprietà della fornitura, non della singola riga.
 *
 * Prima della ricezione l'ordine è una promessa del fornitore, non materiale
 * in cortile: nessuna giacenza si muove.
 *
 * Non si crea più un ordine vuoto per poi riempirlo: si va in
 * `/acquisti/nuovo`, dove fornitore, articoli e provenienza stanno insieme e
 * si salva una volta sola. Le due porte sono i due casi veri — la merce è già
 * in cortile, oppure la si ordina e si aspetta.
 */
export default function AcquistiPage() {
  const [filtri, setFiltri] = useState<ValoriFiltri>({})

  const { dati, caricamento, errore, ricarica } = useFetch(
    () => api.listaAcquisti({ q: filtri.q, stato: filtri.stato, dal: filtri.dal, al: filtri.al }),
    [filtri.q, filtri.stato, filtri.dal, filtri.al],
  )
  useDatiCambiati(ricarica)

  const colonne: Colonna<OrdineAcquisto>[] = [
    {
      chiave: 'numero',
      intestazione: 'Numero',
      priorita: 'principale',
      cella: (a) => <CellaDoppia principale={a.numero} secondario={a.note} />,
    },
    {
      chiave: 'fornitore',
      intestazione: 'Fornitore',
      priorita: 'principale',
      cella: (a) => <span className="text-ink">{a.fornitore_nome}</span>,
    },
    {
      chiave: 'data',
      intestazione: 'Data',
      priorita: 'secondaria',
      cella: (a) => <span className="tabular">{formatData(a.data)}</span>,
    },
    {
      // Le righe si contano, non si sommano: un ordine può portare metri quadri
      // di perlinato, metri lineari di travi e pezzi di arredo insieme, e un
      // totale unico di quelle tre cose non vorrebbe dire niente.
      chiave: 'righe',
      intestazione: 'Righe',
      allineamento: 'destra',
      priorita: 'solo-tabella',
      cella: (a) => <span className="tabular text-ink-soft">{a.righe.length}</span>,
    },
    {
      chiave: 'imponibile',
      intestazione: 'Imponibile',
      allineamento: 'destra',
      classe: 'hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (a) => <span className="tabular">{formatEuro(a.imponibile_cents)}</span>,
    },
    {
      chiave: 'trasporto',
      intestazione: 'Trasporto',
      allineamento: 'destra',
      classe: 'hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (a) => (
        <span className="tabular text-ink-soft">{formatEuro(a.spese_trasporto_cents)}</span>
      ),
    },
    {
      chiave: 'totale',
      intestazione: 'Totale',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (a) => (
        <span className="tabular font-semibold text-ink">{formatEuro(a.totale_cents)}</span>
      ),
    },
    {
      chiave: 'consegna',
      intestazione: 'Consegna prevista',
      classe: 'hidden md:table-cell',
      priorita: 'secondaria',
      etichettaCard: 'In arrivo il',
      cella: (a) => <span className="tabular">{formatData(a.data_consegna_prevista)}</span>,
    },
    {
      chiave: 'stato',
      intestazione: 'Stato',
      priorita: 'secondaria',
      cella: (a) => (
        <StatoBadge etichetta={STATO_ACQUISTO_LABEL[a.stato]} tono={TONO_ACQUISTO[a.stato]} />
      ),
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Ordini di acquisto"
        sottotitolo="Le forniture comprate da segherie, recuperanti e demolitori: alla ricezione l’ordine diventa una partita di magazzino."
        azioni={
          <BarraAzioni
            azioni={[
              {
                chiave: 'ordine',
                etichetta: 'Ordine da inviare',
                etichettaBreve: 'Ordina',
                icona: FileEdit,
                tono: 'secondario',
                a: '/acquisti/nuovo?arrivata=0',
              },
              {
                chiave: 'carico',
                etichetta: 'Carica la merce',
                etichettaBreve: 'Carica',
                icona: PackagePlus,
                tono: 'primario',
                a: '/acquisti/nuovo',
              },
            ]}
          />
        }
      />

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per numero, fornitore o note…"
        definizioni={[
          {
            chiave: 'stato',
            etichetta: 'Stato',
            tipo: 'select',
            opzioni: opzioniDa(STATO_ACQUISTO_LABEL),
          },
          { chiave: 'dal', etichetta: 'Dal', tipo: 'data' },
          { chiave: 'al', etichetta: 'Al', tipo: 'data' },
        ]}
      />

      {caricamento && !dati ? (
        <Caricamento />
      ) : errore ? (
        <Errore messaggio={errore} onRiprova={ricarica} />
      ) : (
        <DataTable
          righe={dati ?? []}
          colonne={colonne}
          chiaveRiga={(a) => a.id}
          linkRiga={(a) => `/acquisti/${a.id}`}
          messaggioVuoto="Nessun ordine di acquisto con questi filtri."
        />
      )}
    </>
  )
}
