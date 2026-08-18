import { ArrowRight, Copy, Euro, FileText, Plus, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api } from '../api'
import { AvvisoErrore } from '../components/Campi'
import DataTable, { CellaDoppia, type Colonna } from '../components/DataTable'
import Filtri, { opzioniDa, type ValoriFiltri } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import { PERCORSO_NUOVO_PREVENTIVO } from '../components/AzioniRapide'
import { SelectStato } from '../components/StatoBadge'
import { notificaDatiCambiati, useDatiCambiati } from '../components/eventiDati'
import { Caricamento, Errore, KpiCard } from '../components/Ui'
import {
  STATO_PREVENTIVO_LABEL,
  TONO_PREVENTIVO,
  TRANSIZIONI_PREVENTIVO,
  preventivoScaduto,
  prossimiStati,
  type Preventivo,
  type StatoPreventivo,
} from '../domain'
import { formatData, formatEuro, oggiISO } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * L'elenco dei preventivi, e le due cose che ci si fa sopra tutti i giorni
 * senza doverne aprire uno:
 *
 *   - **Duplica** — l'azione più usata del pannello: lo stesso lavoro per un
 *     altro cantiere, cambiando due quantità. La copia nasce in bozza con la
 *     data di oggi e si apre subito, pronta da correggere.
 *   - **Converti in ordine** — su un preventivo già accettato non c'è niente
 *     da leggere nel dettaglio: si converte da qui.
 *
 * «Nuovo preventivo» porta a `/preventivi/nuovo`, una schermata vera e
 * linkabile, non più una modale che salva un documento vuoto per poi aprirne
 * il dettaglio.
 */
export default function PreventiviPage() {
  const navigate = useNavigate()
  const [filtri, setFiltri] = useState<ValoriFiltri>({})
  const [avviso, setAvviso] = useState<string | null>(null)
  /** Id del preventivo su cui è in corso un'azione di riga. */
  const [inCorso, setInCorso] = useState<string | null>(null)

  const { dati, caricamento, errore, ricarica } = useFetch(
    () => api.listaPreventivi({ q: filtri.q, stato: filtri.stato, dal: filtri.dal, al: filtri.al }),
    [filtri.q, filtri.stato, filtri.dal, filtri.al],
  )
  useDatiCambiati(ricarica)

  const preventivi = dati ?? []
  const oggi = oggiISO()
  const aperti = preventivi.filter((p) => p.stato === 'bozza' || p.stato === 'inviato')
  const valoreAperti = aperti.reduce((t, p) => t + p.totale_cents, 0)
  const daConvertire = preventivi.filter((p) => p.stato === 'accettato')

  const cambiaStato = async (p: Preventivo, stato: StatoPreventivo) => {
    setAvviso(null)
    try {
      await api.cambiaStatoPreventivo(p.id, stato)
      ricarica()
    } catch (e) {
      setAvviso(messaggioDi(e))
    }
  }

  /** La copia si apre subito: si duplica per cambiarci qualcosa. */
  const duplica = async (p: Preventivo) => {
    setAvviso(null)
    setInCorso(p.id)
    try {
      const copia = await api.duplicaPreventivo(p.id)
      notificaDatiCambiati()
      navigate(`/preventivi/${copia.id}`)
    } catch (e) {
      setAvviso(messaggioDi(e))
      setInCorso(null)
    }
  }

  const converti = async (p: Preventivo) => {
    setAvviso(null)
    setInCorso(p.id)
    try {
      const ordine = await api.convertiPreventivo(p.id)
      notificaDatiCambiati()
      navigate(`/ordini/${ordine.id}`)
    } catch (e) {
      setAvviso(messaggioDi(e))
      setInCorso(null)
    }
  }

  const colonne: Array<Colonna<Preventivo>> = [
    {
      chiave: 'numero',
      intestazione: 'Numero',
      priorita: 'principale',
      cella: (p) => <CellaDoppia principale={p.numero} secondario={STATO_PREVENTIVO_LABEL[p.stato]} />,
    },
    {
      chiave: 'cliente',
      intestazione: 'Cliente',
      priorita: 'principale',
      cella: (p) => p.cliente_nome,
    },
    {
      chiave: 'data',
      intestazione: 'Data',
      priorita: 'secondaria',
      cella: (p) => <span className="tabular">{formatData(p.data)}</span>,
    },
    {
      chiave: 'oggetto',
      intestazione: 'Oggetto',
      classe: 'hidden lg:table-cell max-w-xs',
      // Su un telefono l'oggetto è già nel titolo del lavoro: qui sarebbe rumore.
      priorita: 'solo-tabella',
      cella: (p) => <span className="line-clamp-2 text-ink-soft">{p.oggetto || '—'}</span>,
    },
    {
      chiave: 'totale',
      intestazione: 'Totale',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (p) => <span className="tabular font-medium text-ink">{formatEuro(p.totale_cents)}</span>,
    },
    {
      chiave: 'scadenza',
      intestazione: 'Scadenza',
      priorita: 'secondaria',
      cella: (p) => (
        <span className={`tabular ${preventivoScaduto(p, oggi) ? 'text-danger' : 'text-ink-soft'}`}>
          {formatData(p.data_scadenza)}
        </span>
      ),
    },
    {
      chiave: 'stato',
      intestazione: 'Stato',
      priorita: 'secondaria',
      cella: (p) => (
        <SelectStato
          stato={p.stato}
          etichette={STATO_PREVENTIVO_LABEL}
          toni={TONO_PREVENTIVO}
          ammessi={prossimiStati(TRANSIZIONI_PREVENTIVO, p.stato)}
          onCambia={(nuovo) => void cambiaStato(p, nuovo)}
        />
      ),
    },
    {
      chiave: 'azioni',
      intestazione: <span className="sr-only">Azioni</span>,
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'azione',
      // `stopPropagation` su ogni comando: il resto della riga continua a
      // portare al dettaglio, come in tutte le altre liste del pannello.
      cella: (p) => (
        <div className="flex items-center justify-end gap-2">
          {p.stato === 'accettato' && (
            <button
              type="button"
              className="btn-primary flex-1 md:flex-none"
              disabled={inCorso === p.id}
              onClick={(e) => {
                e.stopPropagation()
                void converti(p)
              }}
            >
              <ArrowRight size={15} />
              Converti
            </button>
          )}
          <button
            type="button"
            className="btn-secondary flex-1 md:flex-none"
            disabled={inCorso === p.id}
            onClick={(e) => {
              e.stopPropagation()
              void duplica(p)
            }}
          >
            <Copy size={15} />
            Duplica
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Preventivi"
        sottotitolo="Le offerte inviate ai clienti. Un preventivo accettato si converte in ordine con un tocco."
        azioni={
          <Link to={PERCORSO_NUOVO_PREVENTIVO} className="btn-primary">
            <Plus size={16} />
            Nuovo preventivo
          </Link>
        }
      />

      <AvvisoErrore messaggio={avviso} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          etichetta="Preventivi aperti"
          valore={aperti.length}
          dettaglio="Bozze e preventivi inviati"
          icona={FileText}
        />
        <KpiCard
          etichetta="Valore dei preventivi aperti"
          valore={formatEuro(valoreAperti)}
          dettaglio="IVA compresa"
          icona={Euro}
          tono="ok"
          ritardo={0.04}
        />
        <KpiCard
          etichetta="Accettati da convertire"
          valore={daConvertire.length}
          dettaglio={
            daConvertire.length ? 'Diventano ordini con un tocco' : 'Nessuno in attesa di conversione'
          }
          icona={ThumbsUp}
          tono="info"
          ritardo={0.08}
        />
      </div>

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per numero, cliente o oggetto…"
        definizioni={[
          { chiave: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: opzioniDa(STATO_PREVENTIVO_LABEL) },
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
          righe={preventivi}
          colonne={colonne}
          chiaveRiga={(p) => p.id}
          linkRiga={(p) => `/preventivi/${p.id}`}
          messaggioVuoto={
            <>
              Nessun preventivo con questi filtri.{' '}
              <Link to={PERCORSO_NUOVO_PREVENTIVO} className="font-semibold text-brand-strong hover:underline">
                Scrivine uno
              </Link>
              : cliente, articoli, quantità.
            </>
          }
        />
      )}
    </>
  )
}
