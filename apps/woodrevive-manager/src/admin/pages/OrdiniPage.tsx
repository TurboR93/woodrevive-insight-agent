import { ArrowRight, FileText, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { api } from '../api'
import { brandConfig } from '../brand.config'
import { AvvisoErrore } from '../components/Campi'
import DataTable, { CellaDoppia, type Colonna } from '../components/DataTable'
import Filtri, { opzioniDa, type ValoriFiltri } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import { SelectStato } from '../components/StatoBadge'
import { notificaDatiCambiati, useDatiCambiati } from '../components/eventiDati'
import { Barra, Caricamento, Errore } from '../components/Ui'
import {
  STATO_ORDINE_LABEL,
  TONO_ORDINE,
  TRANSIZIONI_ORDINE,
  evasioneOrdine,
  giorniDiRitardo,
  ordineScaduto,
  residuoIncerto,
  prossimiStati,
  type Ordine,
  type Preventivo,
  type StatoOrdine,
} from '../domain'
import { formatData, formatEuro, formatPercentuale, oggiISO } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Gli ordini di vendita.
 *
 * ⚠️ **Qui non si crea niente, e questa volta è una mancanza.** Il modello
 * nasceva sulla regola «ogni ordine viene da un preventivo accettato», e i dati
 * reali l'hanno smentita: 253 ordini contro 59 preventivi, e solo 32 collegati.
 * Il registro dei preventivi viveva in gran parte fuori dal vecchio gestionale.
 *
 * Finché non c'è `creaOrdine` con la sua rotta, l'unica porta d'ingresso resta
 * «Converti in ordine» — che è comodo averla qui, con l'elenco dei preventivi
 * accettati in cima — ma non è più tutta la verità sul mestiere.
 *
 * «Rifai come preventivo» resta com'è: rifare un ordine genera un PREVENTIVO
 * nuovo, che il cliente dovrà accettare, mai un secondo ordine.
 */
export default function OrdiniPage() {
  const navigate = useNavigate()
  const [filtri, setFiltri] = useState<ValoriFiltri>({})
  const [avviso, setAvviso] = useState<string | null>(null)
  /** Id del documento su cui è in corso un'azione. */
  const [inCorso, setInCorso] = useState<string | null>(null)
  const oggi = oggiISO()

  const { dati, caricamento, errore, ricarica } = useFetch(
    () => api.listaOrdini({ q: filtri.q, stato: filtri.stato, dal: filtri.dal, al: filtri.al }),
    [filtri.q, filtri.stato, filtri.dal, filtri.al],
  )
  const { dati: accettati, ricarica: ricaricaAccettati } = useFetch(
    () => api.listaPreventivi({ stato: 'accettato' }),
    [],
  )
  useDatiCambiati(ricarica)
  useDatiCambiati(ricaricaAccettati)

  const cambiaStato = async (o: Ordine, stato: StatoOrdine) => {
    setAvviso(null)
    try {
      await api.cambiaStatoOrdine(o.id, stato)
      ricarica()
    } catch (e) {
      setAvviso(messaggioDi(e))
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

  /**
   * Rifare un ordine non genera un ordine: genera il preventivo da cui un
   * ordine potrà nascere, con le stesse righe e senza le quantità già evase.
   */
  const rifaiComePreventivo = async (o: Ordine) => {
    setAvviso(null)
    setInCorso(o.id)
    try {
      const p = await api.preventivoDaOrdine(o.id, {
        validita_giorni: brandConfig.documenti.validitaGiorniPreventivo,
        tempi_consegna: brandConfig.documenti.tempiConsegna,
      })
      notificaDatiCambiati()
      navigate(`/preventivi/${p.id}`)
    } catch (e) {
      setAvviso(messaggioDi(e))
      setInCorso(null)
    }
  }

  const colonne: Array<Colonna<Ordine>> = [
    {
      chiave: 'numero',
      intestazione: 'Numero',
      priorita: 'principale',
      cella: (o) => (
        <CellaDoppia
          principale={o.numero}
          // «Senza preventivo» e non «preventivo non collegato»: nell'archivio
          // sono 221 ordini su 253, ed è come si è lavorato, non un dato perso.
          secondario={o.preventivo_numero ?? 'Senza preventivo'}
        />
      ),
    },
    {
      chiave: 'cliente',
      intestazione: 'Cliente',
      priorita: 'principale',
      cella: (o) => o.cliente_nome,
    },
    {
      chiave: 'data',
      intestazione: 'Data',
      priorita: 'secondaria',
      cella: (o) => <span className="tabular">{formatData(o.data)}</span>,
    },
    {
      chiave: 'totale',
      intestazione: 'Totale',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (o) => <span className="tabular font-medium text-ink">{formatEuro(o.totale_cents)}</span>,
    },
    {
      /*
       * Incassato e residuo, non acconto e saldo: il primo è quello che è
       * successo davvero, il secondo era solo il patto alla conferma. Il
       * residuo va in rosso quando la data di saldo è passata.
       */
      chiave: 'incassi',
      intestazione: 'Incassato / residuo',
      allineamento: 'destra',
      classe: 'hidden md:table-cell',
      priorita: 'secondaria',
      etichettaCard: 'Incassato',
      cella: (o) =>
        // Su 51 ordini importati e chiusi il filo con la fattura che li ha
        // incassati si è perso: il residuo che ne uscirebbe è il totale intero,
        // su merce consegnata e pagata anni fa. Vedi `residuoIncerto`.
        residuoIncerto(o) ? (
          <CellaDoppia
            principale={<span className="text-ink-mute">—</span>}
            secondario={<span className="text-ink-mute">Incasso non ricostruibile</span>}
          />
        ) : (
          <CellaDoppia
            principale={<span className="tabular">{formatEuro(o.incassato_cents)}</span>}
            secondario={
              <span
                className={`tabular ${
                  o.residuo_cents <= 0 ? 'text-ok' : ordineScaduto(o, oggi) ? 'text-danger' : ''
                }`}
              >
                Residuo {formatEuro(o.residuo_cents)}
              </span>
            }
          />
        ),
    },
    {
      chiave: 'scadenza',
      intestazione: 'Scadenza saldo',
      classe: 'hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (o) => {
        if (!o.data_scadenza_saldo) return <span className="text-ink-mute">Da concordare</span>
        const ritardo = giorniDiRitardo(o.data_scadenza_saldo, oggi)
        return (
          <CellaDoppia
            principale={
              <span className={`tabular ${ordineScaduto(o, oggi) ? 'text-danger' : 'text-ink-soft'}`}>
                {formatData(o.data_scadenza_saldo)}
              </span>
            }
            secondario={
              ordineScaduto(o, oggi) ? (
                <span className="text-danger">
                  In ritardo di {ritardo} {ritardo === 1 ? 'giorno' : 'giorni'}
                </span>
              ) : undefined
            }
          />
        )
      },
    },
    {
      chiave: 'consegna',
      intestazione: 'Consegna prevista',
      classe: 'hidden xl:table-cell',
      priorita: 'solo-tabella',
      cella: (o) => <span className="tabular text-ink-soft">{formatData(o.data_consegna_prevista)}</span>,
    },
    {
      chiave: 'evasione',
      intestazione: 'Evasione',
      classe: 'w-40',
      priorita: 'secondaria',
      cella: (o) => {
        const percentuale = evasioneOrdine(o)
        return (
          <Barra
            percentuale={percentuale}
            tono={percentuale >= 100 ? 'ok' : 'brand'}
            etichetta={formatPercentuale(percentuale, 0)}
          />
        )
      },
    },
    {
      chiave: 'stato',
      intestazione: 'Stato',
      priorita: 'secondaria',
      cella: (o) => (
        <SelectStato
          stato={o.stato}
          etichette={STATO_ORDINE_LABEL}
          toni={TONO_ORDINE}
          ammessi={prossimiStati(TRANSIZIONI_ORDINE, o.stato)}
          onCambia={(nuovo) => void cambiaStato(o, nuovo)}
        />
      ),
    },
    {
      chiave: 'azioni',
      intestazione: <span className="sr-only">Azioni</span>,
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'azione',
      cella: (o) => (
        <button
          type="button"
          className="btn-secondary w-full md:w-auto"
          disabled={inCorso === o.id}
          title="Crea un nuovo preventivo con le stesse righe"
          onClick={(e) => {
            e.stopPropagation()
            void rifaiComePreventivo(o)
          }}
        >
          <RotateCcw size={15} />
          Rifai come preventivo
        </button>
      ),
    },
  ]

  const inAttesa = accettati ?? []

  return (
    <>
      <IntestazionePagina
        titolo="Ordini"
        sottotitolo="Gli ordini di vendita. Alcuni nascono da un preventivo, molti no: nell’archivio sono 32 su 253."
      />

      <AvvisoErrore messaggio={avviso} />

      {/* ── L'unica porta d'ingresso, messa dove si guarda ─────────────────── */}
      {Boolean(inAttesa.length) && (
        <section className="card mb-4 px-5 py-4">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base text-ink">
              {inAttesa.length === 1
                ? 'Un preventivo accettato aspetta di diventare ordine'
                : `${inAttesa.length} preventivi accettati aspettano di diventare ordini`}
            </h2>
            <Link
              to="/preventivi"
              className="inline-flex items-center gap-1 text-sm text-ink-mute transition-colors hover:text-brand-strong"
            >
              <FileText size={15} />
              Tutti i preventivi
            </Link>
          </header>

          <ul className="mt-3 space-y-2">
            {inAttesa.slice(0, 4).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2"
              >
                <Link to={`/preventivi/${p.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="tabular block font-medium text-ink">{p.numero}</span>
                  <span className="block truncate text-xs text-ink-mute">
                    {p.cliente_nome}
                    {p.oggetto ? ` — ${p.oggetto}` : ''}
                  </span>
                </Link>
                <span className="tabular text-sm font-medium text-ink">{formatEuro(p.totale_cents)}</span>
                <button
                  type="button"
                  className="btn-primary w-full sm:w-auto"
                  disabled={inCorso === p.id}
                  onClick={() => void converti(p)}
                >
                  <ArrowRight size={15} />
                  Converti in ordine
                </button>
              </li>
            ))}
          </ul>

          {inAttesa.length > 4 && (
            <p className="mt-2 text-xs text-ink-mute">
              Ne mancano altri {inAttesa.length - 4}: li trovi filtrando i preventivi per stato
              «Accettato».
            </p>
          )}
        </section>
      )}

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per numero, cliente o note…"
        definizioni={[
          { chiave: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: opzioniDa(STATO_ORDINE_LABEL) },
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
          chiaveRiga={(o) => o.id}
          linkRiga={(o) => `/ordini/${o.id}`}
          messaggioVuoto="Nessun ordine con questi filtri."
        />
      )}
    </>
  )
}
