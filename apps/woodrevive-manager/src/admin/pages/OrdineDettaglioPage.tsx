import { ClipboardPen, FileText, Trash2, Truck, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { api } from '../api'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Testo } from '../components/Campi'
import FormIncasso from '../components/FormIncasso'
import IntestazionePagina from '../components/IntestazionePagina'
import RigheDocumento, {
  CellaNumerica,
  margineDocumento,
  rigaVuota,
} from '../components/RigheDocumento'
import StatoBadge, { SelectStato } from '../components/StatoBadge'
import { Barra, Caricamento, Card, Conferma, Dato, Errore } from '../components/Ui'
import { notificaDatiCambiati } from '../components/eventiDati'
import {
  MEZZO_PAGAMENTO_LABEL,
  STATO_DDT_LABEL,
  STATO_ORDINE_LABEL,
  TIPO_PAGAMENTO_LABEL,
  TONO_DDT,
  TONO_ORDINE,
  TRANSIZIONI_ORDINE,
  evasioneOrdine,
  giorniDiRitardo,
  ordineScaduto,
  proponiLottoFifo,
  prossimiStati,
  residuoRiga,
  saldoOrdine,
  type ID,
  type Ordine,
  type RigaOrdine,
  type StatoOrdine,
  type VoceLottoDisponibile,
} from '../domain'
import {
  centsAInput,
  euroACents,
  formatData,
  formatEuro,
  formatPercentuale,
  formatQuantita,
  oggiISO,
} from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Partita proposta per ogni riga d'ordine, con il FIFO applicato all'intero
 * documento e non a una riga per volta.
 *
 * `api.lottiDisponibiliPerArticolo` restituisce le partite già ordinate dalla
 * più vecchia (mockApi: «prima le partite più vecchie»), quindi la regola è «la
 * prima che ci sta». L'unica cosa in più che serve qui è la memoria di ciò che
 * le righe precedenti hanno già impegnato: due righe dello stesso articolo
 * proporrebbero altrimenti due volte la stessa catasta, e la seconda uscirebbe
 * scoperta all'emissione.
 *
 * La regola di scelta è `proponiLottoFifo` in `domain/magazzino.ts`, dove è
 * coperta da test. Qui resta solo la composizione sul documento, che ha bisogno
 * dell'API e quindi non può stare in `domain/`.
 */
async function proponiLottiPerRighe(righe: RigaOrdine[]): Promise<Record<ID, ID | null>> {
  const daConsegnare = righe.filter((r) => r.articolo_id && residuoRiga(r) > 0)
  const idArticoli = [...new Set(daConsegnare.map((r) => r.articolo_id as ID))]

  const elenchi = await Promise.all(
    idArticoli.map(
      async (idArticolo) =>
        [idArticolo, await api.lottiDisponibiliPerArticolo(idArticolo)] as const,
    ),
  )
  const perArticolo = new Map<ID, VoceLottoDisponibile[]>(elenchi)

  const impegnato = new Map<string, number>()
  const proposta: Record<ID, ID | null> = {}

  for (const r of daConsegnare) {
    const articoloId = r.articolo_id as ID
    const quantita = residuoRiga(r)
    const disponibili = (perArticolo.get(articoloId) ?? [])
      .map((l) => ({
        ...l,
        residuo_milli: l.residuo_milli - (impegnato.get(`${articoloId}|${l.lotto_id}`) ?? 0),
      }))
      .filter((l) => l.residuo_milli > 0)

    const scelto = proponiLottoFifo(disponibili, quantita)
    proposta[r.id] = scelto?.lotto_id ?? null
    if (scelto) {
      const chiave = `${articoloId}|${scelto.lotto_id}`
      impegnato.set(chiave, (impegnato.get(chiave) ?? 0) + quantita)
    }
  }
  return proposta
}

export default function OrdineDettaglioPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const { dati, caricamento, errore, ricarica } = useFetch(() => api.ordine(id), [id])
  // Tutti gli articoli, non solo gli attivi: senza il costo di quelli usciti di
  // listino il margine delle righe vecchie risulterebbe «non calcolabile».
  const { dati: articoli } = useFetch(() => api.listaArticoli(), [])

  // I DDT e gli incassi si chiedono per cliente e si filtrano per ordine: è la
  // firma che avrà anche il backend, senza un endpoint per ogni relazione.
  const clienteId = dati?.cliente_id ?? ''
  const { dati: ddtCliente, ricarica: ricaricaDdt } = useFetch(
    () => (clienteId ? api.listaDdt({ cliente_id: clienteId }) : Promise.resolve([])),
    [clienteId],
  )
  const { dati: pagamenti, ricarica: ricaricaPagamenti } = useFetch(
    () => (id ? api.listaPagamenti({ ordine_id: id }) : Promise.resolve([])),
    [id],
  )

  const [bozza, setBozza] = useState<Ordine | null>(null)
  /**
   * L'ultima versione che il server ha confermato, e il metro con cui si misura
   * «ci sono modifiche non salvate».
   *
   * Non si può usare `dati` di `useFetch`: quella copia resta ferma alla prima
   * lettura, e ogni scrittura — un salvataggio, un cambio di stato — la lascia
   * indietro. Misurando lì, l'ordine risultava «modificato» per sempre: il
   * comando «Salva ordine» non spariva più dalla barra del telefono, il piè di
   * pagina continuava ad annunciare modifiche che erano già andate, e «Genera
   * DDT» rifaceva un salvataggio a ogni consegna. È lo stesso accorgimento di
   * PreventivoDettaglioPage, per la stessa ragione.
   */
  const [salvato, setSalvato] = useState<Ordine | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [erroreElimina, setErroreElimina] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [confermaElimina, setConfermaElimina] = useState(false)
  const [formIncasso, setFormIncasso] = useState(false)

  /** Una risposta del server vale per entrambe: è la nuova verità. */
  const arrivaDalServer = (o: Ordine) => {
    setBozza(o)
    setSalvato(o)
  }

  useEffect(() => {
    setBozza(dati)
    setSalvato(dati)
  }, [dati])

  if (errore) return <Errore messaggio={errore} onRiprova={ricarica} />
  // L'ordine inesistente torna 404 dall'API e finisce in `errore`: qui manca
  // solo l'istante fra la risposta e la copia di lavoro.
  if (caricamento || !bozza || !salvato) return <Caricamento />

  const ddtCollegati = (ddtCliente ?? []).filter((d) => d.ordine_id === id)
  const incassi = pagamenti ?? []
  const evasione = evasioneOrdine(salvato)
  const oggi = oggiISO()
  const scaduto = ordineScaduto(salvato, oggi)
  const ritardo = giorniDiRitardo(salvato.data_scadenza_saldo, oggi)
  // Righe già partite non si toccano più: le quantità evase sono uscite dal magazzino.
  const soloLettura = evasione > 0 || salvato.stato === 'evaso' || salvato.stato === 'annullato'
  const modificato = JSON.stringify(bozza) !== JSON.stringify(salvato)
  const imposta = (patch: Partial<Ordine>) => setBozza({ ...bozza, ...patch })

  const righeDaConsegnare = bozza.righe.filter((r) => r.articolo_id && residuoRiga(r) > 0)
  const annullato = salvato.stato === 'annullato'

  /*
   * Margine dell'ordine, sui dati salvati. Le righe libere e quelle il cui
   * articolo non ha né costo medio né prezzo d'acquisto restano fuori, e la
   * scheda lo dichiara: sommare zero al posto di «non lo so» farebbe sembrare
   * l'ordine meno redditizio di quanto è.
   */
  const margine = margineDocumento(
    salvato.righe,
    articoli ?? [],
    salvato.sconto_generale_percentuale,
  )

  /** Salva la testata e le righe, e restituisce l'ordine come sta sul server. */
  const salvaOra = async (): Promise<Ordine> => {
    const risposta = await api.aggiornaOrdine(id, {
      data: bozza.data,
      data_consegna_prevista: bozza.data_consegna_prevista,
      indirizzo_consegna: bozza.indirizzo_consegna,
      condizioni_pagamento: bozza.condizioni_pagamento,
      acconto_cents: bozza.acconto_cents,
      data_scadenza_saldo: bozza.data_scadenza_saldo,
      note: bozza.note,
      righe: bozza.righe,
      sconto_generale_percentuale: bozza.sconto_generale_percentuale,
    })
    arrivaDalServer(risposta)
    return risposta
  }

  const salva = async () => {
    setInCorso(true)
    setAvviso(null)
    try {
      await salvaOra()
      notificaDatiCambiati()
    } catch (e) {
      setAvviso(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  const cambiaStato = async (stato: StatoOrdine) => {
    setAvviso(null)
    try {
      arrivaDalServer(await api.cambiaStatoOrdine(id, stato))
      notificaDatiCambiati()
    } catch (e) {
      setAvviso(messaggioDi(e))
    }
  }

  /**
   * Prepara la consegna: righe residue, partita proposta per ognuna, e i dati
   * di trasporto ripresi dall'ultimo DDT dello stesso cliente.
   *
   * Chi consegna trova tutto già scritto e conferma; resta tutto modificabile
   * sul DDT. Tre cose accadono qui e non là:
   *   1. si salva prima, se ci sono modifiche: `creaDdtDaOrdine` legge le righe
   *      SUL SERVER, e un DDT generato da una bozza non salvata consegnerebbe
   *      quantità vecchie;
   *   2. il FIFO viaggia nel secondo argomento, che l'API accetta già: senza,
   *      ogni riga nascerebbe «senza partita dichiarata» e l'emissione salterebbe
   *      il controllo di capienza — la tracciabilità si perderebbe in silenzio;
   *   3. vettore, aspetto dei beni e modalità di trasporto arrivano dall'ultima
   *      consegna fatta a questo cliente: nove volte su dieci è lo stesso
   *      camion. `creaDdtDaOrdine` non li accetta in ingresso, quindi si
   *      scrivono con un `aggiornaDdt` subito dopo.
   */
  const generaDdt = async () => {
    setGenerando(true)
    setAvviso(null)
    try {
      const ordine = modificato ? await salvaOra() : salvato
      const lotti = await proponiLottiPerRighe(ordine.righe)
      const ddt = await api.creaDdtDaOrdine(id, lotti)

      // L'ultima consegna fatta a questo cliente — prima quelle di questo stesso
      // ordine, poi le altre, che le liste tornano già dalla più recente.
      const precedenti = [...ddtCollegati, ...(ddtCliente ?? [])]
      const ultimo = precedenti.find((d) => d.vettore || d.trasporto_a_cura_di !== 'mittente')
      if (ultimo) {
        await api.aggiornaDdt(ddt.id, {
          vettore: ultimo.vettore,
          trasporto_a_cura_di: ultimo.trasporto_a_cura_di,
          aspetto_beni: ultimo.aspetto_beni || ddt.aspetto_beni,
        })
      }

      ricaricaDdt()
      notificaDatiCambiati()
      navigate(`/ddt/${ddt.id}`)
    } catch (e) {
      setAvviso(messaggioDi(e))
      setGenerando(false)
    }
  }

  const elimina = async () => {
    setInCorso(true)
    setErroreElimina(null)
    try {
      await api.eliminaOrdine(id)
      notificaDatiCambiati()
      navigate('/ordini')
    } catch (e) {
      setErroreElimina(messaggioDi(e))
      setInCorso(false)
    }
  }

  const motivoDdt = annullato
    ? 'L’ordine è annullato: non esce più niente.'
    : !righeDaConsegnare.length
      ? 'Non c’è più niente da consegnare: tutte le righe sono evase.'
      : undefined

  const azioni: AzionePagina[] = [
    {
      chiave: 'ddt',
      etichetta: 'Genera DDT',
      etichettaBreve: 'DDT',
      icona: Truck,
      tono: 'primario',
      onClick: () => void generaDdt(),
      disabilitata: inCorso || Boolean(motivoDdt),
      motivo: motivoDdt,
      inCorso: generando,
    },
    {
      chiave: 'incasso',
      etichetta: 'Registra incasso',
      etichettaBreve: 'Incassa',
      icona: Wallet,
      onClick: () => setFormIncasso(true),
      disabilitata: annullato,
    },
    {
      chiave: 'scheda',
      etichetta: 'Scheda lavorazione',
      etichettaBreve: 'Scheda',
      icona: ClipboardPen,
      tono: 'secondario',
      // La specifica per il fornitore, precompilata da quest'ordine:
      // committente, telefono del cliente e data di consegna. Vedi la rotta.
      a: `/schede-lavorazione/nuova?ordine=${id}`,
      disabilitata: annullato,
      // Si prepara in ufficio: sul telefono la barra resta ai comandi di cantiere.
      soloDesktop: true,
    },
    // Compare solo quando c'è davvero qualcosa da salvare: un comando spento
    // nella barra del telefono ruba spazio all'azione che serve.
    ...(modificato
      ? [
          {
            chiave: 'salva',
            etichetta: 'Salva ordine',
            etichettaBreve: 'Salva',
            onClick: () => void salva(),
            disabilitata: inCorso,
            inCorso,
          } satisfies AzionePagina,
        ]
      : []),
    {
      chiave: 'elimina',
      etichetta: 'Elimina',
      icona: Trash2,
      tono: 'pericolo',
      // In magazzino non si cancellano ordini: si consegna e si incassa. Resta
      // in ufficio, dove c'è il monitor e si sa cosa si sta buttando via.
      soloDesktop: true,
      onClick: () => {
        setErroreElimina(null)
        setConfermaElimina(true)
      },
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo={`Ordine ${bozza.numero}`}
        sottotitolo={`${bozza.cliente_nome} — ${formatEuro(salvato.totale_cents)} · evaso al ${formatPercentuale(evasione, 0)} · residuo ${formatEuro(salvato.residuo_cents)}`}
        indietro={{ a: '/ordini', label: 'Tutti gli ordini' }}
        azioni={
          <>
            <SelectStato
              stato={bozza.stato}
              etichette={STATO_ORDINE_LABEL}
              toni={TONO_ORDINE}
              ammessi={prossimiStati(TRANSIZIONI_ORDINE, bozza.stato)}
              onCambia={(nuovo) => void cambiaStato(nuovo)}
            />
            <BarraAzioni azioni={azioni} />
          </>
        }
      />

      <AvvisoErrore messaggio={avviso} />

      {scaduto && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          <p>
            Saldo scaduto da {ritardo} {ritardo === 1 ? 'giorno' : 'giorni'}: restano{' '}
            {formatEuro(salvato.residuo_cents)} da incassare, attesi entro il{' '}
            {formatData(salvato.data_scadenza_saldo)}.
          </p>
          <button type="button" className="btn-secondary shrink-0" onClick={() => setFormIncasso(true)}>
            <Wallet size={15} />
            Incassa {formatEuro(salvato.residuo_cents)}
          </button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="card px-5 py-5 lg:col-span-2">
          <GrigliaCampi colonne={2}>
            <Campo etichetta="Data ordine">
              <Testo valore={bozza.data} onCambia={(v) => imposta({ data: v })} type="date" />
            </Campo>

            <Campo etichetta="Consegna prevista">
              <Testo
                valore={bozza.data_consegna_prevista ?? ''}
                onCambia={(v) => imposta({ data_consegna_prevista: v || null })}
                type="date"
              />
            </Campo>

            <Campo
              etichetta="Indirizzo di consegna"
              className="md:col-span-2"
              aiuto="Il DDT nasce con la destinazione del cliente: se qui c’è un cantiere, la scheda del DDT lo propone con un tocco."
            >
              <Testo
                valore={bozza.indirizzo_consegna ?? ''}
                onCambia={(v) => imposta({ indirizzo_consegna: v || null })}
                placeholder="Via, numero, CAP e città del cantiere"
              />
            </Campo>

            <Campo
              etichetta="Acconto pattuito"
              aiuto={`Saldo concordato: ${formatEuro(saldoOrdine(bozza))}. Quanto è davvero entrato si registra negli incassi.`}
            >
              <CellaNumerica
                etichetta="Acconto in euro"
                valore={centsAInput(bozza.acconto_cents)}
                onCambia={(t) => imposta({ acconto_cents: euroACents(t) })}
                classe="w-full"
              />
            </Campo>

            <Campo etichetta="Scadenza del saldo" aiuto="Entro quando è atteso il resto. Vuota = da concordare.">
              <Testo
                valore={bozza.data_scadenza_saldo ?? ''}
                onCambia={(v) => imposta({ data_scadenza_saldo: v || null })}
                type="date"
              />
            </Campo>

            <Campo etichetta="Condizioni di pagamento" className="md:col-span-2">
              <Testo
                valore={bozza.condizioni_pagamento ?? ''}
                onCambia={(v) => imposta({ condizioni_pagamento: v || null })}
              />
            </Campo>

            <Campo etichetta="Note" className="md:col-span-2">
              <AreaTesto
                valore={bozza.note ?? ''}
                onCambia={(v) => imposta({ note: v || null })}
                righe={3}
              />
            </Campo>
          </GrigliaCampi>
        </section>

        <div className="flex flex-col gap-4">
          <Card titolo="Riepilogo">
            <dl className="space-y-3">
              <Dato etichetta="Cliente">
                <Link to={`/clienti/${bozza.cliente_id}`} className="text-brand-strong hover:underline">
                  {bozza.cliente_nome}
                </Link>
              </Dato>
              {/* Ogni ordine nasce da un preventivo: se manca, è un dato da
                  sistemare, non un modo alternativo di lavorare. */}
              <Dato etichetta="Preventivo di origine">
                {bozza.preventivo_id ? (
                  <Link
                    to={`/preventivi/${bozza.preventivo_id}`}
                    className="inline-flex items-center gap-1 text-brand-strong hover:underline"
                  >
                    <FileText size={14} />
                    {bozza.preventivo_numero}
                  </Link>
                ) : (
                  <>
                    <span className="text-warn">Preventivo non collegato</span>
                    <span className="mt-0.5 block text-xs text-ink-mute">
                      Ogni ordine nasce da un preventivo accettato: questo non ne ha uno.
                    </span>
                  </>
                )}
              </Dato>
              <Dato etichetta="Totale">
                <span className="tabular font-semibold">{formatEuro(salvato.totale_cents)}</span>
              </Dato>
              <Dato etichetta="Margine dell’ordine">
                {margine.margine_cents == null ? (
                  <span className="text-ink-mute">Non calcolabile: nessun costo noto</span>
                ) : (
                  <>
                    <span className="tabular font-semibold text-ink">
                      {formatEuro(margine.margine_cents)}
                    </span>
                    <span className="tabular ml-2 text-xs text-ink-mute">
                      {formatPercentuale(
                        salvato.imponibile_cents
                          ? (margine.margine_cents / salvato.imponibile_cents) * 100
                          : null,
                        1,
                      )}{' '}
                      sull’imponibile
                    </span>
                    {margine.righe_senza_costo > 0 && (
                      <span className="mt-0.5 block text-xs text-ink-mute">
                        {margine.righe_senza_costo}{' '}
                        {margine.righe_senza_costo === 1 ? 'riga esclusa' : 'righe escluse'}: costo
                        non noto.
                      </span>
                    )}
                  </>
                )}
              </Dato>
              <Dato etichetta="Evasione">
                <Barra
                  percentuale={evasione}
                  tono={evasione >= 100 ? 'ok' : 'brand'}
                  etichetta={formatPercentuale(evasione, 0)}
                />
              </Dato>
            </dl>
          </Card>

          {/*
            Incassi in evidenza: acconto pattuito e denaro entrato sono due
            numeri diversi, e finché non si vedono affiancati nessuno se ne
            accorge. `incassato_cents` e `residuo_cents` sono derivati dai
            pagamenti — qui si leggono, non si scrivono. Il comando per
            registrarne uno sta nelle azioni della pagina: in alto sul monitor,
            in fondo sul telefono, uno solo.
           */}
          <Card titolo="Incassi">
            <dl className="mb-3 grid grid-cols-2 gap-3">
              <Dato etichetta="Incassato">
                <span className="tabular font-semibold text-ok">
                  {formatEuro(salvato.incassato_cents)}
                </span>
              </Dato>
              <Dato etichetta="Residuo">
                <span
                  className={`tabular font-semibold ${
                    salvato.residuo_cents > 0 ? (scaduto ? 'text-danger' : 'text-ink') : 'text-ok'
                  }`}
                >
                  {formatEuro(salvato.residuo_cents)}
                </span>
              </Dato>
              <Dato etichetta="Acconto pattuito">
                <span className="tabular">{formatEuro(salvato.acconto_cents)}</span>
              </Dato>
              <Dato etichetta="Scadenza saldo">
                <span className={`tabular ${scaduto ? 'text-danger' : ''}`}>
                  {salvato.data_scadenza_saldo ? formatData(salvato.data_scadenza_saldo) : '—'}
                </span>
              </Dato>
            </dl>

            {incassi.length ? (
              <ul className="space-y-2 border-t border-line pt-3">
                {incassi.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="tabular text-ink-soft">{formatData(p.data)}</span>{' '}
                      <span className="text-ink">{TIPO_PAGAMENTO_LABEL[p.tipo]}</span>
                      <span className="block truncate text-xs text-ink-mute">
                        {MEZZO_PAGAMENTO_LABEL[p.mezzo]}
                        {p.riferimento ? ` · ${p.riferimento}` : ''}
                      </span>
                    </span>
                    <span
                      className={`tabular shrink-0 font-medium ${
                        p.importo_cents < 0 ? 'text-danger' : 'text-ink'
                      }`}
                    >
                      {formatEuro(p.importo_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-line pt-3 text-sm text-ink-mute">
                Nessun incasso registrato su questo ordine.
              </p>
            )}
          </Card>

          <Card titolo="Documenti di trasporto">
            {ddtCollegati.length ? (
              <ul className="space-y-2">
                {ddtCollegati.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <Link to={`/ddt/${d.id}`} className="text-sm text-brand-strong hover:underline">
                      {d.numero}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-ink-mute">
                      <span className="tabular">{formatData(d.data_trasporto)}</span>
                      <StatoBadge etichetta={STATO_DDT_LABEL[d.stato]} tono={TONO_DDT[d.stato]} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-mute">
                Nessun DDT: «Genera DDT» prepara la consegna con le righe residue e la partita più
                vecchia già scelta per ognuna.
              </p>
            )}
          </Card>
        </div>
      </div>

      <RigheDocumento<RigaOrdine>
        righe={bozza.righe}
        onCambia={(righe) => imposta({ righe })}
        articoli={articoli ?? []}
        scontoGenerale={bozza.sconto_generale_percentuale}
        soloLettura={soloLettura}
        creaRiga={() => ({ ...rigaVuota(), quantita_evasa_milli: 0 })}
        colonneExtra={[
          {
            chiave: 'evasa',
            intestazione: 'Evasa',
            cella: (r) => formatQuantita(r.quantita_evasa_milli, r.unita_misura),
          },
          {
            chiave: 'residuo',
            intestazione: 'Residuo',
            cella: (r) => (
              <span className={residuoRiga(r) > 0 ? 'text-ink' : 'text-ok'}>
                {formatQuantita(residuoRiga(r), r.unita_misura)}
              </span>
            ),
          },
        ]}
      />

      {/* La testata resta modificabile anche a righe bloccate: acconto, scadenza
          del saldo, indirizzo di consegna e note cambiano fino alla chiusura.
          Il salvataggio è un'azione della pagina come le altre: qui resta solo
          il suo stato, che è un'informazione e non un comando. */}
      <p className="mt-4 text-right text-sm text-ink-mute">
        {soloLettura
          ? 'Righe in sola lettura: parte della merce è già uscita con un DDT.'
          : modificato
            ? 'Modifiche non salvate: «Genera DDT» le salva da solo prima di preparare la consegna.'
            : `Totale salvato: ${formatEuro(salvato.totale_cents)}`}
      </p>

      {formIncasso && (
        <FormIncasso
          clienteIniziale={salvato.cliente_id}
          clienteNome={salvato.cliente_nome}
          ordineIniziale={salvato.id}
          ordineNumero={salvato.numero}
          importoInizialeCents={Math.max(0, salvato.residuo_cents)}
          residuoCents={Math.max(0, salvato.residuo_cents)}
          bloccaCliente
          onChiudi={() => setFormIncasso(false)}
          onSalvato={() => {
            setFormIncasso(false)
            ricaricaPagamenti()
            ricarica() // incassato_cents e residuo_cents sono derivati: vanno riletti
            notificaDatiCambiati()
          }}
        />
      )}

      {confermaElimina && (
        <Conferma
          titolo="Eliminare l’ordine?"
          messaggio={
            <>
              <p>
                L’ordine {bozza.numero} e i suoi DDT ancora in bozza verranno eliminati. Se c’è un
                preventivo di origine, torna in stato «accettato». Un ordine con incassi registrati
                non si elimina: prima vanno stornati.
              </p>
              {erroreElimina && <p className="mt-3 font-semibold text-danger">{erroreElimina}</p>}
            </>
          }
          etichettaConferma="Elimina"
          distruttiva
          inCorso={inCorso}
          onConferma={() => void elimina()}
          onAnnulla={() => setConfermaElimina(false)}
        />
      )}
    </>
  )
}
