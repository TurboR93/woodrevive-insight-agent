import { ClipboardPen } from 'lucide-react'
import { useState } from 'react'

import { api } from '../api'
import BarraAzioni from '../components/BarraAzioni'
import DataTable, { CellaDoppia, type Colonna } from '../components/DataTable'
import Filtri, { opzioniDa, type ValoriFiltri } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Caricamento, Errore } from '../components/Ui'
import { useDatiCambiati } from '../components/eventiDati'
import {
  STATO_SCHEDA_LABEL,
  TIPOLOGIA_SCHEDA_LABEL,
  TONO_SCHEDA,
  type SchedaLavorazione,
} from '../domain'
import { formatData } from '../lib/format'
import { useFetch } from '../useFetch'

/**
 * Schede di lavorazione: le specifiche d'acquisto verso i fornitori.
 *
 * Nonostante il nome, qui non si lavora niente: la scheda dice al fornitore
 * COME deve arrivare il materiale — misure, spazzolatura, finitura — e il
 * fornitore lo consegna già fatto. Nessuna giacenza si muove da questa pagina,
 * né da nessun'altra parte del ciclo di vita di una scheda.
 */
export default function SchedeLavorazionePage() {
  const [filtri, setFiltri] = useState<ValoriFiltri>({})

  const { dati, caricamento, errore, ricarica } = useFetch(
    () => api.listaSchede({ q: filtri.q, stato: filtri.stato, dal: filtri.dal, al: filtri.al }),
    [filtri.q, filtri.stato, filtri.dal, filtri.al],
  )
  useDatiCambiati(ricarica)

  const colonne: Colonna<SchedaLavorazione>[] = [
    {
      chiave: 'numero',
      intestazione: 'Numero',
      priorita: 'principale',
      cella: (s) => <CellaDoppia principale={s.numero} secondario={s.annotazioni} />,
    },
    {
      chiave: 'committente',
      intestazione: 'Committente',
      priorita: 'principale',
      cella: (s) => <span className="text-ink">{s.committente}</span>,
    },
    {
      chiave: 'fornitore',
      intestazione: 'Fornitore',
      classe: 'hidden md:table-cell',
      priorita: 'secondaria',
      cella: (s) => (
        <span className="text-ink-soft">{s.fornitore_nome ?? 'Da decidere'}</span>
      ),
    },
    {
      chiave: 'tipologie',
      intestazione: 'Tipologia',
      classe: 'hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (s) => (
        <span className="text-ink-soft">
          {s.tipologie.map((t) => TIPOLOGIA_SCHEDA_LABEL[t]).join(', ') || '—'}
        </span>
      ),
    },
    {
      chiave: 'data',
      intestazione: 'Data',
      priorita: 'secondaria',
      cella: (s) => <span className="tabular">{formatData(s.data)}</span>,
    },
    {
      chiave: 'consegna',
      intestazione: 'Consegna richiesta',
      classe: 'hidden md:table-cell',
      priorita: 'secondaria',
      etichettaCard: 'Consegna il',
      cella: (s) => <span className="tabular">{formatData(s.data_consegna)}</span>,
    },
    {
      chiave: 'stato',
      intestazione: 'Stato',
      priorita: 'secondaria',
      cella: (s) => (
        <StatoBadge etichetta={STATO_SCHEDA_LABEL[s.stato]} tono={TONO_SCHEDA[s.stato]} />
      ),
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Schede lavorazione"
        sottotitolo="Le specifiche consegnate ai fornitori: come deve arrivare il materiale. La lavorazione la fanno loro, prima della consegna."
        azioni={
          <BarraAzioni
            azioni={[
              {
                chiave: 'nuova',
                etichetta: 'Nuova scheda',
                etichettaBreve: 'Nuova',
                icona: ClipboardPen,
                tono: 'primario',
                a: '/schede-lavorazione/nuova',
              },
            ]}
          />
        }
      />

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per numero, committente, fornitore o annotazioni…"
        definizioni={[
          {
            chiave: 'stato',
            etichetta: 'Stato',
            tipo: 'select',
            opzioni: opzioniDa(STATO_SCHEDA_LABEL),
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
          chiaveRiga={(s) => s.id}
          linkRiga={(s) => `/schede-lavorazione/${s.id}`}
          messaggioVuoto="Nessuna scheda di lavorazione con questi filtri."
        />
      )}
    </>
  )
}
