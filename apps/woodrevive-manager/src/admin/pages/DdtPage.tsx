import { Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import DataTable, { CellaDoppia, type Colonna } from '../components/DataTable'
import Filtri, { opzioniDa, type ValoriFiltri } from '../components/Filtri'
import FormIncasso from '../components/FormIncasso'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Caricamento, Errore } from '../components/Ui'
import { useDatiCambiati, notificaDatiCambiati } from '../components/eventiDati'
import {
  etichettaCausale,
  STATO_DDT_LABEL,
  TONO_DDT,
  type DDT,
  type ID,
  type VoceScadenzario,
} from '../domain'
import { formatData, formatEuro, formatQuantita } from '../lib/format'
import { useFetch } from '../useFetch'

/**
 * I documenti di trasporto — cosa è uscito, e cosa deve ancora uscire.
 *
 * La lista non è il punto da cui si consegna: un DDT si prepara dall'ordine, che
 * ci arriva con le righe residue e la partita già proposta. Qui si guarda
 * indietro, e la domanda che segue «la merce è partita?» è sempre la stessa:
 * **è stata pagata?** Per questo ogni riga il cui ordine ha ancora del residuo
 * porta il suo «Incassa», che apre il form già compilato senza uscire dalla
 * pagina: la catena ordine → DDT → incasso si chiude anche da qui.
 *
 * Nessun comando per creare un DDT dal nulla, come non c'è per gli ordini: un
 * DDT nasce da un ordine, che nasce da un preventivo accettato.
 */
export default function DdtPage() {
  const [filtri, setFiltri] = useState<ValoriFiltri>({})
  const [incasso, setIncasso] = useState<VoceScadenzario | null>(null)

  const { dati, caricamento, errore, ricarica } = useFetch(
    () => api.listaDdt({ q: filtri.q, stato: filtri.stato, dal: filtri.dal, al: filtri.al }),
    [filtri.q, filtri.stato, filtri.dal, filtri.al],
  )

  /*
   * Il residuo non sta sul DDT: sta sull'ordine, derivato dai pagamenti. Lo
   * scadenzario è già l'elenco degli ordini che devono ancora incassare — si
   * legge quello invece di chiedere un ordine per ogni riga.
   */
  const scadenzario = useFetch(() => api.scadenzario(), [])

  // Un incasso registrato altrove — dalla scheda ordine, dalle azioni rapide —
  // cambia quale riga porta ancora il suo «Incassa».
  useDatiCambiati(ricarica)
  useDatiCambiati(scadenzario.ricarica)

  const righe = dati ?? []
  // Solo le voci che nascono da un ordine: quelle storiche vengono dalle
  // scadenze di prima nota e non hanno un ordine a cui agganciarsi.
  const scadenzePerOrdine = new Map<ID, VoceScadenzario>(
    (scadenzario.dati ?? []).flatMap((v) => (v.ordine_id ? [[v.ordine_id, v] as const] : [])),
  )

  /** La voce di scadenzario dell'ordine di questo DDT, se ha ancora residuo. */
  const daIncassare = (d: DDT): VoceScadenzario | null => {
    if (!d.ordine_id || d.stato === 'bozza' || d.stato === 'annullato') return null
    const voce = scadenzePerOrdine.get(d.ordine_id)
    return voce && voce.residuo_cents > 0 ? voce : null
  }

  const inBozza = righe.filter((d) => d.stato === 'bozza').length
  // Lo stesso ordine può avere più DDT: il residuo si conta una volta sola.
  const ordiniDaIncassare = new Map<ID, VoceScadenzario>()
  for (const d of righe) {
    const voce = daIncassare(d)
    if (voce?.ordine_id) ordiniDaIncassare.set(voce.ordine_id, voce)
  }
  const totaleDaIncassare = [...ordiniDaIncassare.values()].reduce(
    (t, v) => t + v.residuo_cents,
    0,
  )

  const colonne: Array<Colonna<DDT>> = [
    {
      chiave: 'numero',
      intestazione: 'Numero',
      priorita: 'principale',
      cella: (d) => <CellaDoppia principale={d.numero} secondario={d.cliente_nome} />,
    },
    {
      chiave: 'trasporto',
      intestazione: 'Data trasporto',
      classe: 'w-40',
      priorita: 'secondaria',
      cella: (d) => (
        <CellaDoppia
          principale={<span className="tabular">{formatData(d.data_trasporto)}</span>}
          secondario={
            d.ora_trasporto ? <span className="tabular">ore {d.ora_trasporto}</span> : undefined
          }
        />
      ),
    },
    {
      chiave: 'causale',
      intestazione: 'Causale',
      classe: 'hidden lg:table-cell',
      // Quasi sempre «vendita»: sul telefono è rumore, sul monitor è una colonna.
      priorita: 'solo-tabella',
      cella: (d) => <span className="text-ink-soft">{etichettaCausale(d)}</span>,
    },
    {
      chiave: 'destinazione',
      intestazione: 'Destinazione',
      classe: 'hidden md:table-cell',
      priorita: 'secondaria',
      cella: (d) => (
        <span className="text-ink-soft">
          {[d.destinazione_citta, d.destinazione_provincia ? `(${d.destinazione_provincia})` : null]
            .filter(Boolean)
            .join(' ') || '—'}
        </span>
      ),
    },
    {
      chiave: 'colli',
      intestazione: 'Colli',
      allineamento: 'destra',
      classe: 'w-24',
      priorita: 'secondaria',
      cella: (d) => <span className="tabular">{d.colli_totali || '—'}</span>,
    },
    {
      chiave: 'peso',
      intestazione: 'Peso',
      allineamento: 'destra',
      classe: 'hidden sm:table-cell w-28',
      priorita: 'secondaria',
      cella: (d) => (
        <span className="tabular">
          {d.peso_totale_kg_milli ? formatQuantita(d.peso_totale_kg_milli, 'kg') : '—'}
        </span>
      ),
    },
    {
      chiave: 'ordine',
      intestazione: 'Ordine',
      classe: 'hidden lg:table-cell w-32',
      priorita: 'secondaria',
      cella: (d) =>
        d.ordine_id ? (
          <Link
            to={`/ordini/${d.ordine_id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-brand-strong hover:underline"
          >
            {d.ordine_numero}
          </Link>
        ) : (
          <span className="text-ink-mute">—</span>
        ),
    },
    {
      chiave: 'stato',
      intestazione: 'Stato',
      classe: 'w-32',
      priorita: 'secondaria',
      cella: (d) => (
        <StatoBadge
          etichetta={STATO_DDT_LABEL[d.stato]}
          tono={TONO_DDT[d.stato]}
          titolo={d.stato === 'bozza' ? 'La merce non è ancora uscita dal magazzino' : undefined}
        />
      ),
    },
    {
      chiave: 'incassa',
      intestazione: <span className="sr-only">Incassa</span>,
      allineamento: 'destra',
      classe: 'w-36',
      priorita: 'azione',
      cella: (d) => {
        const voce = daIncassare(d)
        if (!voce) return null
        return (
          <button
            type="button"
            className="btn-secondary w-full md:w-auto"
            aria-label={`Registra un incasso sull’ordine ${voce.numero} di ${voce.cliente_nome}, residuo ${formatEuro(voce.residuo_cents)}`}
            onClick={(e) => {
              // La riga apre il DDT: il bottone incassa e resta qui.
              e.stopPropagation()
              setIncasso(voce)
            }}
          >
            <Wallet size={15} />
            Incassa
          </button>
        )
      },
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Documenti di trasporto"
        sottotitolo="Un DDT si prepara dall’ordine e si emette dal suo dettaglio: l’emissione scarica il magazzino e non si torna indietro."
      />

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per numero, cliente o città…"
        definizioni={[
          { chiave: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: opzioniDa(STATO_DDT_LABEL) },
          { chiave: 'dal', etichetta: 'Dal', tipo: 'data' },
          { chiave: 'al', etichetta: 'Al', tipo: 'data' },
        ]}
      />

      {caricamento && !dati ? (
        <Caricamento />
      ) : errore ? (
        <Errore messaggio={errore} onRiprova={ricarica} />
      ) : (
        <>
          <DataTable
            righe={righe}
            colonne={colonne}
            chiaveRiga={(d) => d.id}
            linkRiga={(d) => `/ddt/${d.id}`}
            messaggioVuoto="Nessun DDT con questi filtri."
          />

          {Boolean(righe.length) && (
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="text-ink-mute">
                {righe.length} {righe.length === 1 ? 'documento' : 'documenti'}
                {inBozza > 0 && ` · ${inBozza} ancora in bozza: la merce non è uscita`}
              </span>
              {totaleDaIncassare > 0 && (
                <span className="text-ink-mute">
                  Da incassare sugli ordini collegati:{' '}
                  <span className="tabular font-semibold text-ink">
                    {formatEuro(totaleDaIncassare)}
                  </span>
                </span>
              )}
            </div>
          )}
        </>
      )}

      {/* Lo stesso form dello scadenzario e della scheda ordine, con il residuo
          già nel campo: la merce è uscita, resta da vedere se i soldi entrano. */}
      {incasso && (
        <FormIncasso
          clienteIniziale={incasso.cliente_id}
          clienteNome={incasso.cliente_nome}
          ordineIniziale={incasso.ordine_id ?? undefined}
          ordineNumero={incasso.numero}
          importoInizialeCents={incasso.residuo_cents}
          residuoCents={incasso.residuo_cents}
          bloccaCliente
          titolo={`Incasso su ${incasso.numero}`}
          onChiudi={() => setIncasso(null)}
          onSalvato={() => {
            setIncasso(null)
            scadenzario.ricarica()
            notificaDatiCambiati()
          }}
        />
      )}
    </>
  )
}
