import { CalendarDays, Euro, FilePlus2, FileText, ShoppingCart, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '../api'
import { PERCORSO_NUOVO_PREVENTIVO } from '../components/AzioniRapide'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import DataTable, { CellaDoppia, type Colonna } from '../components/DataTable'
import FormIncasso from '../components/FormIncasso'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Card, Caricamento, Dato, Errore, KpiCard } from '../components/Ui'
import { notificaDatiCambiati } from '../components/eventiDati'
import {
  CANALE_LABEL,
  MEZZO_PAGAMENTO_LABEL,
  STATO_DDT_LABEL,
  STATO_ORDINE_LABEL,
  STATO_PREVENTIVO_LABEL,
  TIPO_CLIENTE_LABEL,
  TIPO_PAGAMENTO_LABEL,
  TONO_DDT,
  TONO_ORDINE,
  TONO_PREVENTIVO,
  identificativoFiscale,
  indirizzoConsegna,
  ordineScaduto,
  type DDT,
  type Ordine,
  type Pagamento,
  type Preventivo,
  type TonoStato,
} from '../domain'
import { formatData, formatEuro, formatPercentuale, oggiISO } from '../lib/format'
import { useFetch } from '../useFetch'

/** Le tre tabelle del fondo pagina hanno la stessa forma: numero, data, totale, stato. */
function colonneDocumento<T extends { numero: string; data: string; totale_cents: number }>(
  stato: (r: T) => { etichetta: string; tono: TonoStato },
): Colonna<T>[] {
  return [
    { chiave: 'numero', intestazione: 'Numero', cella: (r) => <span className="font-medium text-ink">{r.numero}</span> },
    { chiave: 'data', intestazione: 'Data', cella: (r) => formatData(r.data) },
    {
      chiave: 'totale',
      intestazione: 'Totale',
      allineamento: 'destra',
      cella: (r) => formatEuro(r.totale_cents),
    },
    {
      chiave: 'stato',
      intestazione: 'Stato',
      cella: (r) => {
        const s = stato(r)
        return <StatoBadge etichetta={s.etichetta} tono={s.tono} />
      },
    },
  ]
}

/**
 * Gli ordini portano due colonne in più: quanto resta da incassare, e il
 * comando per incassarlo. Da qui il residuo di un cliente si chiude senza
 * passare dallo scadenzario e senza aprire l'ordine.
 */
function colonneOrdini(oggi: string, onIncassa: (o: Ordine) => void): Colonna<Ordine>[] {
  return [
    {
      chiave: 'numero',
      intestazione: 'Numero',
      priorita: 'principale',
      cella: (o) => <span className="font-medium text-ink">{o.numero}</span>,
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
      cella: (o) => <span className="tabular">{formatEuro(o.totale_cents)}</span>,
    },
    {
      chiave: 'residuo',
      intestazione: 'Residuo',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (o) => (
        <span
          className={`tabular ${
            o.residuo_cents <= 0 ? 'text-ok' : ordineScaduto(o, oggi) ? 'text-danger' : 'text-ink'
          }`}
        >
          {formatEuro(o.residuo_cents)}
        </span>
      ),
    },
    {
      chiave: 'stato',
      intestazione: 'Stato',
      priorita: 'secondaria',
      cella: (o) => <StatoBadge etichetta={STATO_ORDINE_LABEL[o.stato]} tono={TONO_ORDINE[o.stato]} />,
    },
    {
      chiave: 'incassa',
      intestazione: <span className="sr-only">Incassa</span>,
      allineamento: 'destra',
      classe: 'w-36',
      priorita: 'azione',
      cella: (o) =>
        o.residuo_cents > 0 && o.stato !== 'annullato' ? (
          <button
            type="button"
            className="btn-secondary w-full md:w-auto"
            aria-label={`Registra un incasso sull’ordine ${o.numero}, residuo ${formatEuro(o.residuo_cents)}`}
            onClick={(e) => {
              // La riga porta all'ordine: il bottone incassa e resta qui.
              e.stopPropagation()
              onIncassa(o)
            }}
          >
            <Wallet size={15} />
            Incassa
          </button>
        ) : null,
    },
  ]
}

const COLONNE_INCASSI: Colonna<Pagamento>[] = [
  {
    chiave: 'data',
    intestazione: 'Data',
    cella: (p) => <span className="tabular text-ink">{formatData(p.data)}</span>,
  },
  {
    chiave: 'tipo',
    intestazione: 'Tipo',
    cella: (p) => (
      <CellaDoppia
        principale={TIPO_PAGAMENTO_LABEL[p.tipo]}
        secondario={p.ordine_numero ?? 'Senza ordine collegato'}
      />
    ),
  },
  {
    chiave: 'mezzo',
    intestazione: 'Mezzo',
    classe: 'hidden md:table-cell',
    cella: (p) => (
      <CellaDoppia principale={MEZZO_PAGAMENTO_LABEL[p.mezzo]} secondario={p.riferimento} />
    ),
  },
  {
    chiave: 'importo',
    intestazione: 'Importo',
    allineamento: 'destra',
    cella: (p) => (
      <span className={`tabular font-medium ${p.importo_cents < 0 ? 'text-danger' : 'text-ink'}`}>
        {formatEuro(p.importo_cents)}
      </span>
    ),
  },
]

export default function ClienteDettaglioPage() {
  const { id = '' } = useParams()

  const cliente = useFetch(() => api.cliente(id), [id])
  const preventivi = useFetch(() => api.listaPreventivi({ cliente_id: id }), [id])
  const ordini = useFetch(() => api.listaOrdini({ cliente_id: id }), [id])
  const ddt = useFetch(() => api.listaDdt({ cliente_id: id }), [id])
  const incassi = useFetch(() => api.listaPagamenti({ cliente_id: id }), [id])

  /** `null` = form chiuso; `{ ordine: null }` = caparra senza ordine. */
  const [incasso, setIncasso] = useState<{ ordine: Ordine | null } | null>(null)

  if (cliente.caricamento) return <Caricamento />
  if (cliente.errore) return <Errore messaggio={cliente.errore} onRiprova={cliente.ricarica} />
  // Il cliente inesistente arriva come 404 dall'API e finisce in `errore`:
  // qui si può essere solo nell'istante fra la risposta e il render.
  if (!cliente.dati) return <Caricamento />

  const c = cliente.dati
  const oggi = oggiISO()

  /*
   * Posizione aperta del cliente: quanto deve ancora, e quanto di quel debito
   * ha già superato la scadenza concordata. Si somma sugli ordini perché è lì
   * che vivono `incassato_cents` e `residuo_cents`, derivati dai pagamenti —
   * sommare i pagamenti darebbe l'incassato, non il dovuto.
   */
  const ordiniVivi = (ordini.dati ?? []).filter((o) => o.stato !== 'annullato')
  const residuoAperto = ordiniVivi.reduce((t, o) => t + Math.max(0, o.residuo_cents), 0)
  const residuoScaduto = ordiniVivi
    .filter((o) => ordineScaduto(o, oggi))
    .reduce((t, o) => t + o.residuo_cents, 0)

  const ricaricaPosizione = () => {
    incassi.ricarica()
    ordini.ricarica()
    cliente.ricarica() // fatturato e ordini aperti sono derivati
    notificaDatiCambiati()
  }

  /*
   * Le due azioni che si fanno da qui, e sono due.
   *
   * NON c'è «Nuovo ordine», e non è una dimenticanza: un ordine nasce solo da
   * un preventivo accettato. Da questa scheda si parte con il preventivo — con
   * il cliente già scelto, passato nella querystring perché il link resti
   * condivisibile — e si arriva all'ordine convertendolo.
   */
  const azioni: AzionePagina[] = [
    {
      chiave: 'preventivo',
      etichetta: 'Nuovo preventivo',
      etichettaBreve: 'Preventivo',
      icona: FilePlus2,
      tono: 'primario',
      a: `${PERCORSO_NUOVO_PREVENTIVO}?cliente=${c.id}`,
    },
    {
      chiave: 'incasso',
      etichetta: 'Registra incasso',
      etichettaBreve: 'Incassa',
      icona: Wallet,
      onClick: () => setIncasso({ ordine: null }),
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo={c.ragione_sociale}
        sottotitolo={`${c.codice} · ${TIPO_CLIENTE_LABEL[c.tipo]} · ${identificativoFiscale(c)}`}
        indietro={{ a: '/clienti', label: 'Tutti i clienti' }}
        azioni={
          <>
            {!c.attivo && <StatoBadge etichetta="Non attivo" tono="neutro" />}
            <BarraAzioni azioni={azioni} />
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          etichetta="Preventivi aperti"
          valore={c.preventivi_aperti}
          icona={FileText}
          tono="info"
        />
        <KpiCard
          etichetta="Ordini aperti"
          valore={c.ordini_aperti}
          icona={ShoppingCart}
          tono="warn"
          ritardo={0.04}
        />
        <KpiCard
          etichetta="Fatturato"
          valore={formatEuro(c.fatturato_cents)}
          dettaglio="DDT emessi e consegnati"
          icona={Euro}
          tono="ok"
          ritardo={0.08}
        />
        <KpiCard
          etichetta="Da incassare"
          valore={formatEuro(residuoAperto)}
          dettaglio={
            residuoScaduto > 0 ? `${formatEuro(residuoScaduto)} scaduto` : 'Nessuna scadenza superata'
          }
          icona={Wallet}
          tono={residuoScaduto > 0 ? 'danger' : 'brand'}
          ritardo={0.12}
        />
        <KpiCard
          etichetta="Ultimo ordine"
          valore={formatData(c.ultimo_ordine)}
          icona={CalendarDays}
          ritardo={0.16}
        />
      </div>

      <Card titolo="Anagrafica" className="mb-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dato etichetta="Referente">{c.referente}</Dato>
          <Dato etichetta="Email">{c.email}</Dato>
          <Dato etichetta="Telefono">{c.telefono}</Dato>
          <Dato etichetta="Codice SDI">{c.codice_sdi}</Dato>
          <Dato etichetta="PEC">{c.pec}</Dato>
          <Dato etichetta="Canale">{CANALE_LABEL[c.canale]}</Dato>
          <Dato etichetta="Sede">
            {[c.indirizzo, [c.cap, c.citta].filter(Boolean).join(' '), c.provincia ? `(${c.provincia})` : null]
              .filter(Boolean)
              .join(', ') || '—'}
          </Dato>
          <Dato etichetta="Consegna">{indirizzoConsegna(c) || '—'}</Dato>
          <Dato etichetta="Identificativo fiscale">{identificativoFiscale(c)}</Dato>
          <Dato etichetta="Sconto default">
            {formatPercentuale(c.sconto_default_percentuale, 0)}
          </Dato>
          <Dato etichetta="Aliquota IVA default">
            {formatPercentuale(c.aliquota_iva_default, 0)}
          </Dato>
          <Dato etichetta="Note">{c.note}</Dato>
        </dl>
      </Card>

      <section className="mb-6">
        <h2 className="mb-3 font-display text-lg text-ink">Preventivi</h2>
        {preventivi.errore ? (
          <Errore messaggio={preventivi.errore} onRiprova={preventivi.ricarica} />
        ) : preventivi.caricamento && !preventivi.dati ? (
          <Caricamento />
        ) : (
          <DataTable
            righe={preventivi.dati ?? []}
            colonne={colonneDocumento<Preventivo>((p) => ({
              etichetta: STATO_PREVENTIVO_LABEL[p.stato],
              tono: TONO_PREVENTIVO[p.stato],
            }))}
            chiaveRiga={(p) => p.id}
            linkRiga={(p) => `/preventivi/${p.id}`}
            messaggioVuoto="Nessun preventivo per questo cliente."
          />
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-display text-lg text-ink">Ordini</h2>
        {ordini.errore ? (
          <Errore messaggio={ordini.errore} onRiprova={ordini.ricarica} />
        ) : ordini.caricamento && !ordini.dati ? (
          <Caricamento />
        ) : (
          <DataTable
            righe={ordini.dati ?? []}
            colonne={colonneOrdini(oggi, (o) => setIncasso({ ordine: o }))}
            chiaveRiga={(o) => o.id}
            linkRiga={(o) => `/ordini/${o.id}`}
            messaggioVuoto="Nessun ordine per questo cliente."
          />
        )}
      </section>

      {/* Lo storico degli incassi sta accanto agli ordini e non in fondo: la
          domanda «ha pagato?» arriva subito dopo «cosa ha ordinato?». */}
      <section className="mb-6">
        <h2 className="mb-3 font-display text-lg text-ink">Incassi</h2>
        {incassi.errore ? (
          <Errore messaggio={incassi.errore} onRiprova={incassi.ricarica} />
        ) : incassi.caricamento && !incassi.dati ? (
          <Caricamento />
        ) : (
          <DataTable
            righe={incassi.dati ?? []}
            colonne={COLONNE_INCASSI}
            chiaveRiga={(p) => p.id}
            linkRiga={(p) => (p.ordine_id ? `/ordini/${p.ordine_id}` : '/incassi')}
            messaggioVuoto="Nessun incasso registrato per questo cliente."
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg text-ink">Documenti di trasporto</h2>
        {ddt.errore ? (
          <Errore messaggio={ddt.errore} onRiprova={ddt.ricarica} />
        ) : ddt.caricamento && !ddt.dati ? (
          <Caricamento />
        ) : (
          <DataTable
            righe={ddt.dati ?? []}
            colonne={colonneDocumento<DDT>((d) => ({
              etichetta: STATO_DDT_LABEL[d.stato],
              tono: TONO_DDT[d.stato],
            }))}
            chiaveRiga={(d) => d.id}
            linkRiga={(d) => `/ddt/${d.id}`}
            messaggioVuoto="Nessun DDT per questo cliente."
          />
        )}
      </section>

      {/*
        Lo stesso form dello scadenzario e della scheda ordine. Con un ordine
        arriva già compilato con il suo residuo; senza, è la caparra che si
        collegherà a un ordine più avanti.
       */}
      {incasso && (
        <FormIncasso
          clienteIniziale={c.id}
          clienteNome={c.ragione_sociale}
          ordineIniziale={incasso.ordine?.id}
          ordineNumero={incasso.ordine?.numero}
          importoInizialeCents={
            incasso.ordine ? Math.max(0, incasso.ordine.residuo_cents) : undefined
          }
          residuoCents={incasso.ordine ? Math.max(0, incasso.ordine.residuo_cents) : undefined}
          tipoIniziale={incasso.ordine ? undefined : 'acconto'}
          bloccaCliente
          titolo={incasso.ordine ? `Incasso su ${incasso.ordine.numero}` : 'Registra un acconto'}
          onChiudi={() => setIncasso(null)}
          onSalvato={() => {
            setIncasso(null)
            ricaricaPosizione()
          }}
        />
      )}
    </>
  )
}
