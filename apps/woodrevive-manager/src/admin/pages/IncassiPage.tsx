import { AlarmClock, Euro, Plus, Trash2, Wallet } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '../api'
import { AvvisoErrore } from '../components/Campi'
import DataTable, { CellaDoppia, type Colonna } from '../components/DataTable'
import Filtri, { opzioniDa, type ValoriFiltri } from '../components/Filtri'
import FormIncasso from '../components/FormIncasso'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Caricamento, Conferma, Errore, KpiCard } from '../components/Ui'
import { useDatiCambiati, notificaDatiCambiati } from '../components/eventiDati'
import {
  MEZZO_PAGAMENTO_LABEL,
  TIPO_PAGAMENTO_LABEL,
  type ID,
  type Pagamento,
  type VoceScadenzario,
} from '../domain'
import { formatData, formatEuro } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Incassi — la cassa, non il fatturato.
 *
 * Un ordine consegnato dice che la merce è uscita; questa pagina dice se i
 * soldi sono entrati. Sono due domande diverse e fra l'una e l'altra passano
 * settimane: senza un registro degli acconti e delle scadenze, il gestionale
 * racconterebbe solo metà della storia.
 *
 * Due tabelle, in quest'ordine perché è l'ordine in cui si usano:
 *   1. SCADENZARIO — chi deve ancora pagare, i più in ritardo in cima. È la
 *      lista con cui si fanno i solleciti la mattina, ed è qui che si incassa:
 *      ogni riga ha il suo «Incassa», che apre il form già compilato con
 *      cliente, ordine e residuo. **Non si esce mai dalla pagina**: prima
 *      l'unico modo di registrare un bonifico era aprire l'ordine, e cinque
 *      bonifici di fila costavano dieci cambi di pagina.
 *   2. ULTIMI INCASSI — cosa è entrato, per riconciliare con l'estratto conto.
 *
 * `incassato_cents` e `residuo_cents` dell'ordine sono DERIVATI dai pagamenti,
 * come la giacenza dai movimenti: qui si registra il fatto, i totali seguono.
 */

/** Cosa sta chiedendo il form aperto: sono tre casi diversi, non uno con tre if. */
type Apertura =
  /** Il bottone in cima: acconto senza ordine, cioè la caparra. */
  | { tipo: 'caparra' }
  /** Una riga dello scadenzario: cliente, ordine e residuo sono già dati. */
  | { tipo: 'scadenza'; voce: VoceScadenzario; prossimo: ID | null }
  /** Una riga degli ultimi incassi: si sta correggendo un movimento già scritto. */
  | { tipo: 'modifica'; pagamento: Pagamento }

export default function IncassiPage() {
  const [filtri, setFiltri] = useState<ValoriFiltri>({})
  const [apertura, setApertura] = useState<Apertura | null>(null)
  const [daEliminare, setDaEliminare] = useState<Pagamento | null>(null)
  const [erroreEliminazione, setErroreEliminazione] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  /*
   * Chi incassa cinque bonifici di fila non deve ritrovare il fuoco in cima
   * alla pagina dopo ognuno: appena il form si chiude, il comando della riga
   * successiva è già pronto sotto le dita (o sotto Invio).
   */
  const bottoniIncassa = useRef(new Map<ID, HTMLButtonElement | null>())
  const [daFocalizzare, setDaFocalizzare] = useState<ID | null>(null)

  const riepilogo = useFetch(() => api.riepilogo(), [])
  const scadenzario = useFetch(() => api.scadenzario(), [])
  const clienti = useFetch(() => api.listaClienti(), [])
  const pagamenti = useFetch(
    () =>
      api.listaPagamenti({
        q: filtri.q,
        cliente_id: filtri.cliente_id || undefined,
        mezzo: filtri.mezzo || undefined,
        tipo: filtri.tipo || undefined,
        dal: filtri.dal,
        al: filtri.al,
      }),
    [filtri.q, filtri.cliente_id, filtri.mezzo, filtri.tipo, filtri.dal, filtri.al],
  )

  const ricaricaTutto = useCallback(() => {
    riepilogo.ricarica()
    scadenzario.ricarica()
    pagamenti.ricarica()
  }, [riepilogo.ricarica, scadenzario.ricarica, pagamenti.ricarica])

  // Un incasso registrato dalle azioni rapide, da un'altra schermata, cambia
  // ciò che questa pagina sta mostrando: si rilegge da sola.
  useDatiCambiati(ricaricaTutto)

  const voci = scadenzario.dati ?? []

  /**
   * Chiude una scadenza importata dov'è nata, invece di aggiungerci un
   * `Pagamento` che la lascerebbe aperta e conterebbe l'incasso due volte.
   */
  const saldaScadenza = async (v: VoceScadenzario) => {
    setErroreEliminazione(null)
    try {
      await api.saldaScadenza(v.chiave)
      notificaDatiCambiati()
      ricaricaTutto()
    } catch (e) {
      setErroreEliminazione(messaggioDi(e))
    }
  }

  useEffect(() => {
    if (!daFocalizzare) return
    const bottone = bottoniIncassa.current.get(daFocalizzare)
    if (bottone) bottone.focus()
    setDaFocalizzare(null)
  }, [daFocalizzare, voci])

  const elimina = async () => {
    if (!daEliminare) return
    setInCorso(true)
    setErroreEliminazione(null)
    try {
      await api.eliminaPagamento(daEliminare.id)
      setDaEliminare(null)
      ricaricaTutto()
      notificaDatiCambiati()
    } catch (e) {
      setErroreEliminazione(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  const r = riepilogo.dati

  const totaleResiduo = voci.reduce((t, v) => t + v.residuo_cents, 0)
  const totaleScaduto = voci.filter((v) => v.scaduto).reduce((t, v) => t + v.residuo_cents, 0)
  const quantiScaduti = voci.filter((v) => v.scaduto).length

  /**
   * Colonne dello scadenzario. Si costruiscono qui dentro e non fuori dal
   * componente perché la colonna «Incassa» ha bisogno dello stato della pagina:
   * è il punto in cui questa lista smette di essere un rapporto e diventa il
   * posto in cui si lavora.
   */
  const colonneScadenzario: Colonna<VoceScadenzario>[] = [
    {
      chiave: 'ordine',
      intestazione: 'Documento',
      priorita: 'principale',
      cella: (v) => <CellaDoppia principale={v.numero} secondario={v.cliente_nome} />,
    },
    {
      chiave: 'totale',
      intestazione: 'Totale',
      allineamento: 'destra',
      classe: 'hidden sm:table-cell w-32',
      priorita: 'solo-tabella',
      cella: (v) => <span className="tabular text-ink-soft">{formatEuro(v.totale_cents)}</span>,
    },
    {
      chiave: 'incassato',
      intestazione: 'Incassato',
      allineamento: 'destra',
      classe: 'w-32',
      priorita: 'solo-tabella',
      cella: (v) => <span className="tabular text-ink-soft">{formatEuro(v.incassato_cents)}</span>,
    },
    {
      chiave: 'residuo',
      intestazione: 'Residuo',
      allineamento: 'destra',
      classe: 'w-32',
      priorita: 'secondaria',
      cella: (v) => (
        <span className={`tabular font-semibold ${v.scaduto ? 'text-danger' : 'text-ink'}`}>
          {formatEuro(v.residuo_cents)}
        </span>
      ),
    },
    {
      chiave: 'scadenza',
      intestazione: 'Scadenza saldo',
      classe: 'w-40',
      priorita: 'secondaria',
      cella: (v) =>
        v.data_scadenza_saldo ? (
          <span className={`tabular ${v.scaduto ? 'text-danger' : 'text-ink-soft'}`}>
            {formatData(v.data_scadenza_saldo)}
          </span>
        ) : (
          <span className="text-ink-mute">Da concordare</span>
        ),
    },
    {
      chiave: 'ritardo',
      intestazione: 'Ritardo',
      allineamento: 'destra',
      classe: 'w-32',
      priorita: 'secondaria',
      // Il ritardo è il motivo per cui si telefona: si legge come uno stato,
      // non come un numero in mezzo ad altri numeri.
      cella: (v) =>
        v.scaduto ? (
          <StatoBadge
            etichetta={`${v.giorni_ritardo} ${v.giorni_ritardo === 1 ? 'giorno' : 'giorni'}`}
            tono={v.giorni_ritardo >= 30 ? 'danger' : 'warn'}
            titolo={`In ritardo dal ${formatData(v.data_scadenza_saldo)}`}
          />
        ) : (
          <span className="text-ink-mute">—</span>
        ),
    },
    {
      chiave: 'incassa',
      intestazione: <span className="sr-only">Incassa</span>,
      allineamento: 'destra',
      classe: 'w-36',
      priorita: 'azione',
      cella: (v) => {
        const indice = voci.findIndex((x) => x.chiave === v.chiave)
        const prossimo = voci[indice + 1]?.chiave ?? null

        /*
         * ⚠️ Due bottoni diversi, perché sono due scritture diverse.
         *
         * Su un ordine si registra un `Pagamento`. Su una scadenza importata no:
         * la somma è già scritta in prima nota, e aggiungerci un pagamento
         * lascerebbe la scadenza aperta e conterebbe l'incasso due volte, una per
         * registro. Lì si spunta la scadenza dov'è nata.
         */
        const daScadenza = v.origine === 'scadenza'
        return (
          <button
            type="button"
            ref={(el) => {
              bottoniIncassa.current.set(v.chiave, el)
            }}
            className="btn-secondary w-full md:w-auto"
            aria-label={
              daScadenza
                ? `Segna incassata ${v.numero} — ${v.cliente_nome}, ${formatEuro(v.residuo_cents)}`
                : `Registra un incasso su ${v.numero} — ${v.cliente_nome}, residuo ${formatEuro(v.residuo_cents)}`
            }
            onClick={(e) => {
              // La riga porta all'ordine: il bottone no, il bottone incassa.
              e.stopPropagation()
              if (daScadenza) void saldaScadenza(v)
              else setApertura({ tipo: 'scadenza', voce: v, prossimo })
            }}
          >
            <Wallet size={15} />
            {daScadenza ? 'Segna incassata' : 'Incassa'}
          </button>
        )
      },
    },
  ]

  const colonnePagamenti: Colonna<Pagamento>[] = [
    {
      chiave: 'data',
      intestazione: 'Data',
      cella: (p) => <span className="tabular text-ink">{formatData(p.data)}</span>,
      classe: 'w-32',
      priorita: 'secondaria',
    },
    {
      chiave: 'cliente',
      intestazione: 'Cliente',
      priorita: 'principale',
      cella: (p) => (
        <CellaDoppia
          principale={p.cliente_nome}
          secondario={p.ordine_numero ?? 'Senza ordine collegato'}
        />
      ),
    },
    {
      chiave: 'tipo',
      intestazione: 'Tipo',
      cella: (p) => <span className="text-ink-soft">{TIPO_PAGAMENTO_LABEL[p.tipo]}</span>,
      classe: 'w-36',
      priorita: 'secondaria',
    },
    {
      chiave: 'mezzo',
      intestazione: 'Mezzo',
      classe: 'hidden md:table-cell w-40',
      priorita: 'secondaria',
      cella: (p) => (
        <CellaDoppia principale={MEZZO_PAGAMENTO_LABEL[p.mezzo]} secondario={p.riferimento} />
      ),
    },
    {
      chiave: 'importo',
      intestazione: 'Importo',
      allineamento: 'destra',
      classe: 'w-36',
      priorita: 'secondaria',
      // La nota di credito è negativa: si legge in danger perché toglie cassa.
      cella: (p) => (
        <span
          className={`tabular font-medium ${p.importo_cents < 0 ? 'text-danger' : 'text-ink'}`}
        >
          {formatEuro(p.importo_cents)}
        </span>
      ),
    },
    {
      chiave: 'azioni',
      intestazione: <span className="sr-only">Azioni</span>,
      allineamento: 'destra',
      classe: 'w-14',
      priorita: 'azione',
      cella: (p) => (
        <button
          type="button"
          className="btn-icona text-ink-soft hover:bg-tint/40"
          aria-label={`Elimina l’incasso del ${formatData(p.data)} di ${p.cliente_nome}`}
          onClick={(e) => {
            e.stopPropagation()
            setErroreEliminazione(null)
            setDaEliminare(p)
          }}
        >
          <Trash2 size={15} />
        </button>
      ),
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Incassi"
        sottotitolo="Acconti, saldi e note di credito. Il residuo di ogni ordine si deriva da qui: non si scrive a mano."
        azioni={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setApertura({ tipo: 'caparra' })}
          >
            <Plus size={16} />
            Registra incasso
          </button>
        }
      />

      {/* Zero e «non lo so» sono cose diverse anche qui: finché il riepilogo non
          è arrivato non si stampano importi, si dice che si sta caricando. */}
      {riepilogo.errore ? (
        <div className="mb-6">
          <Errore messaggio={riepilogo.errore} onRiprova={riepilogo.ricarica} />
        </div>
      ) : !r ? (
        <Caricamento />
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            etichetta="Da incassare"
            valore={formatEuro(r.da_incassare_cents)}
            dettaglio="Residuo degli ordini aperti più le scadenze non saldate"
            icona={Wallet}
          />
          <KpiCard
            etichetta="Scaduto"
            valore={formatEuro(r.scaduto_cents)}
            dettaglio={
              r.scaduto_cents > 0
                ? 'Oltre la data di saldo concordata'
                : 'Nessuna scadenza superata'
            }
            icona={AlarmClock}
            tono={r.scaduto_cents > 0 ? 'danger' : 'ok'}
            ritardo={0.04}
          />
          <KpiCard
            etichetta="Incassato quest’anno"
            valore={formatEuro(r.incassato_anno_cents)}
            dettaglio="Note di credito già dedotte"
            icona={Euro}
            tono="ok"
            ritardo={0.08}
          />
        </div>
      )}

      {/* --- scadenzario ----------------------------------------------------- */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg text-ink">Scadenzario</h2>
          <p className="text-sm text-ink-mute">
            Quello che c’è da incassare, i più in ritardo in cima: gli ordini aperti e le
            scadenze dell’archivio ancora scoperte. «Incassa» apre il form già compilato.
          </p>
        </div>

        {scadenzario.errore ? (
          <Errore messaggio={scadenzario.errore} onRiprova={scadenzario.ricarica} />
        ) : scadenzario.caricamento && !scadenzario.dati ? (
          <Caricamento />
        ) : (
          <>
            <DataTable
              righe={voci}
              colonne={colonneScadenzario}
              chiaveRiga={(v) => v.chiave}
              // Le voci storiche vengono dalle scadenze di prima nota: non hanno
              // un ordine da aprire. La riga resta leggibile, e non finge un link.
              linkRiga={(v) => (v.ordine_id ? `/ordini/${v.ordine_id}` : '')}
              // «Tutti gli ordini sono saldati» sarebbe una rassicurazione anche
              // quando gli ordini non ci sono: dice bene una cosa che non è stata
              // verificata. Questa è vera in entrambi i casi.
              messaggioVuoto="Nessun ordine con del residuo da incassare."
            />

            {Boolean(voci.length) && (
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                <span className="text-ink-mute">
                  {voci.length} {voci.length === 1 ? 'ordine' : 'ordini'} con residuo
                  {quantiScaduti > 0 &&
                    ` · ${quantiScaduti} ${quantiScaduti === 1 ? 'scaduto' : 'scaduti'}`}
                </span>
                <span className="text-ink-mute">
                  In attesa di incasso:{' '}
                  <span className="tabular font-semibold text-ink">{formatEuro(totaleResiduo)}</span>
                  {totaleScaduto > 0 && (
                    <>
                      {' · '}di cui scaduto{' '}
                      <span className="tabular font-semibold text-danger">
                        {formatEuro(totaleScaduto)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            )}
          </>
        )}
      </section>

      {/* --- ultimi incassi -------------------------------------------------- */}
      <section>
        <h2 className="mb-3 font-display text-lg text-ink">Ultimi incassi</h2>

        <Filtri
          valori={filtri}
          onCambia={setFiltri}
          segnaposto="Cerca per cliente, ordine, CRO o note…"
          definizioni={[
            {
              chiave: 'cliente_id',
              etichetta: 'Cliente',
              tipo: 'select',
              opzioni: (clienti.dati ?? []).map((c) => ({
                valore: c.id,
                etichetta: c.ragione_sociale,
              })),
            },
            { chiave: 'tipo', etichetta: 'Tipo', tipo: 'select', opzioni: opzioniDa(TIPO_PAGAMENTO_LABEL) },
            { chiave: 'mezzo', etichetta: 'Mezzo', tipo: 'select', opzioni: opzioniDa(MEZZO_PAGAMENTO_LABEL) },
            { chiave: 'dal', etichetta: 'Dal', tipo: 'data' },
            { chiave: 'al', etichetta: 'Al', tipo: 'data' },
          ]}
        />

        {pagamenti.errore ? (
          <Errore messaggio={pagamenti.errore} onRiprova={pagamenti.ricarica} />
        ) : pagamenti.caricamento && !pagamenti.dati ? (
          <Caricamento />
        ) : (
          <>
            <DataTable
              righe={pagamenti.dati ?? []}
              colonne={colonnePagamenti}
              chiaveRiga={(p) => p.id}
              onClickRiga={(p) => setApertura({ tipo: 'modifica', pagamento: p })}
              messaggioVuoto="Nessun incasso con questi filtri."
            />
            {Boolean(pagamenti.dati?.length) && (
              <p className="mt-2 text-right text-sm text-ink-mute">
                Totale dei movimenti mostrati:{' '}
                <span className="tabular font-semibold text-ink">
                  {formatEuro((pagamenti.dati ?? []).reduce((t, p) => t + p.importo_cents, 0))}
                </span>
              </p>
            )}
          </>
        )}
      </section>

      {/* Un form solo per tutti e tre i casi: cambia cosa arriva già compilato. */}
      {apertura?.tipo === 'caparra' && (
        <FormIncasso
          onChiudi={() => setApertura(null)}
          onSalvato={() => {
            setApertura(null)
            ricaricaTutto()
            notificaDatiCambiati()
          }}
        />
      )}

      {apertura?.tipo === 'scadenza' && (
        <FormIncasso
          clienteIniziale={apertura.voce.cliente_id}
          clienteNome={apertura.voce.cliente_nome}
          ordineIniziale={apertura.voce.ordine_id ?? undefined}
          ordineNumero={apertura.voce.numero}
          // Il residuo era già stampato in questa riga: adesso è nel campo.
          importoInizialeCents={apertura.voce.residuo_cents}
          residuoCents={apertura.voce.residuo_cents}
          bloccaCliente
          onChiudi={() => setApertura(null)}
          onSalvato={() => {
            const prossimo = apertura.prossimo
            setApertura(null)
            ricaricaTutto()
            notificaDatiCambiati()
            setDaFocalizzare(prossimo ?? null)
          }}
        />
      )}

      {apertura?.tipo === 'modifica' && (
        <FormIncasso
          pagamento={apertura.pagamento}
          clienteIniziale={apertura.pagamento.cliente_id}
          clienteNome={apertura.pagamento.cliente_nome}
          ordineIniziale={apertura.pagamento.ordine_id ?? undefined}
          ordineNumero={apertura.pagamento.ordine_numero ?? undefined}
          // Si corregge l'importo, la data, il mezzo, il riferimento. Spostare
          // un incasso su un altro cliente o un altro ordine non è una
          // correzione: si elimina e si registra dove va.
          bloccaCliente
          compatto={false}
          onChiudi={() => setApertura(null)}
          onSalvato={() => {
            setApertura(null)
            ricaricaTutto()
            notificaDatiCambiati()
          }}
        />
      )}

      {daEliminare && (
        <Conferma
          titolo="Eliminare l’incasso?"
          distruttiva
          etichettaConferma="Elimina"
          inCorso={inCorso}
          onAnnulla={() => {
            setDaEliminare(null)
            setErroreEliminazione(null)
          }}
          onConferma={() => void elimina()}
          messaggio={
            <>
              <AvvisoErrore messaggio={erroreEliminazione} />
              <p>
                L’incasso di <strong>{formatEuro(daEliminare.importo_cents)}</strong> del{' '}
                {formatData(daEliminare.data)} ({daEliminare.cliente_nome}) verrà eliminato. Il
                residuo dell’ordine collegato torna a comprenderlo.
              </p>
            </>
          }
        />
      )}
    </>
  )
}
