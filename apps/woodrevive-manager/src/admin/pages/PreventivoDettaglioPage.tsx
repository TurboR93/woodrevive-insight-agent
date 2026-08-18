import { ArrowRight, Check, Copy, FileDown, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { api } from '../api'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Testo } from '../components/Campi'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import IntestazionePagina from '../components/IntestazionePagina'
import RigheDocumento, { rigaVuota } from '../components/RigheDocumento'
import { SelettoreCliente } from '../components/SelettoreAnagrafica'
import { SelectStato } from '../components/StatoBadge'
import { notificaDatiCambiati } from '../components/eventiDati'
import { Caricamento, Conferma, Errore, modaleAperta } from '../components/Ui'
import {
  STATO_PREVENTIVO_LABEL,
  TONO_PREVENTIVO,
  TRANSIZIONI_PREVENTIVO,
  preventivoScaduto,
  prossimiStati,
  type ClienteConTotali,
  type Preventivo,
  type RigaPreventivo,
  type StatoPreventivo,
} from '../domain'
import { formatData, formatEuro, oggiISO } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * La scheda completa del preventivo: qui si corregge quello che la creazione
 * rapida non ha chiesto, si cambia stato e si converte in ordine.
 *
 * Non è più l'unico modo di aggiungere righe — la ricerca articolo con il
 * ciclo da tastiera sta in testata a `RigheDocumento`, la stessa di
 * `/preventivi/nuovo`: tre lettere, Invio, quantità, Invio.
 *
 * Le azioni passano da `BarraAzioni`: in alto sul monitor, in una barra fissa
 * in fondo sul telefono. «Converti in ordine» resta bloccata finché ci sono
 * modifiche non salvate, perché la conversione legge il documento dal server:
 * convertire una bozza modificata significherebbe perdere le correzioni senza
 * accorgersene.
 */
export default function PreventivoDettaglioPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const { dati, caricamento, errore, ricarica } = useFetch(() => api.preventivo(id), [id])
  // Tutti gli articoli, non solo gli attivi: il selettore mostra comunque i
  // soli articoli a catalogo, ma senza il costo di quelli usciti di listino il
  // margine delle righe già scritte risulterebbe «non calcolabile».
  const { dati: articoli } = useFetch(() => api.listaArticoli(), [])
  // Il cliente del documento, non l'intera anagrafica: la ricerca se la fa il
  // selettore da solo, e questa serve solo a scriverne il nome nel campo.
  const { dati: clienteDelDocumento } = useFetch(
    () => (dati ? api.cliente(dati.cliente_id) : Promise.resolve(null)),
    [dati?.cliente_id],
  )

  const [bozza, setBozza] = useState<Preventivo | null>(null)
  /**
   * L'ultima versione che il server ha confermato, e il metro con cui si misura
   * «ci sono modifiche non salvate».
   *
   * Non si può usare `dati` di `useFetch`: quella copia resta ferma alla prima
   * lettura, e ogni scrittura — un salvataggio, un cambio di stato — la lascia
   * indietro. Misurando lì, il documento risultava «modificato» per sempre: il
   * bottone «Salva» non tornava mai «Salvato» e, quel che è peggio, «Converti
   * in ordine» restava bloccata subito dopo aver accettato il preventivo, che è
   * esattamente il momento in cui la si preme.
   */
  const [salvato, setSalvato] = useState<Preventivo | null>(null)
  const [cliente, setCliente] = useState<ClienteConTotali | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [confermaElimina, setConfermaElimina] = useState(false)

  /** Una risposta del server vale per entrambe: è la nuova verità. */
  const arrivaDalServer = (p: Preventivo) => {
    setBozza(p)
    setSalvato(p)
  }

  useEffect(() => {
    setBozza(dati)
    setSalvato(dati)
  }, [dati])
  useEffect(() => setCliente(clienteDelDocumento), [clienteDelDocumento])

  const modificato = Boolean(bozza) && JSON.stringify(bozza) !== JSON.stringify(salvato)

  const salva = async () => {
    if (!bozza || !modificato) return
    setInCorso(true)
    setAvviso(null)
    try {
      arrivaDalServer(
        await api.aggiornaPreventivo(id, {
          cliente_id: bozza.cliente_id,
          oggetto: bozza.oggetto,
          data: bozza.data,
          validita_giorni: bozza.validita_giorni,
          condizioni_pagamento: bozza.condizioni_pagamento,
          tempi_consegna: bozza.tempi_consegna,
          note: bozza.note,
          righe: bozza.righe,
          sconto_generale_percentuale: bozza.sconto_generale_percentuale,
        }),
      )
      notificaDatiCambiati()
    } catch (e) {
      setAvviso(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  // Cmd/Ctrl+Invio salva, come nella schermata di creazione. Non attraverso una
  // modale, però: con la conferma di eliminazione aperta salverebbe il
  // documento che si sta per buttare via.
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
      if (modaleAperta()) return
      e.preventDefault()
      void salva()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  })

  if (errore) return <Errore messaggio={errore} onRiprova={ricarica} />
  // Il preventivo inesistente torna 404 dall'API e finisce in `errore`: qui
  // manca solo l'istante fra la risposta e la copia di lavoro.
  if (caricamento || !bozza || !salvato) return <Caricamento />

  const soloLettura = bozza.stato === 'convertito'
  const scaduto = preventivoScaduto(bozza, oggiISO())
  const imposta = (patch: Partial<Preventivo>) => setBozza({ ...bozza, ...patch })

  const cambiaStato = async (stato: StatoPreventivo) => {
    setAvviso(null)
    try {
      // Anche il cambio di stato è una risposta del server: se restasse solo
      // nella bozza, accettare un preventivo lo farebbe sembrare modificato e
      // bloccherebbe la conversione.
      arrivaDalServer(await api.cambiaStatoPreventivo(id, stato))
      notificaDatiCambiati()
    } catch (e) {
      setAvviso(messaggioDi(e))
    }
  }

  const converti = async () => {
    setInCorso(true)
    setAvviso(null)
    try {
      const ordine = await api.convertiPreventivo(id)
      notificaDatiCambiati()
      navigate(`/ordini/${ordine.id}`)
    } catch (e) {
      setAvviso(messaggioDi(e))
      setInCorso(false)
    }
  }

  /** La copia nasce in bozza con la data di oggi e si apre subito. */
  const duplica = async () => {
    setInCorso(true)
    setAvviso(null)
    try {
      const copia = await api.duplicaPreventivo(id)
      notificaDatiCambiati()
      navigate(`/preventivi/${copia.id}`)
    } catch (e) {
      setAvviso(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  /**
   * Il generatore vive in `documents/` e si carica al volo, così jsPDF non pesa
   * sul primo caricamento del pannello. Se il modulo manca o fallisce, la pagina
   * lo dice e resta in piedi.
   */
  const scaricaPdf = async () => {
    setAvviso(null)
    try {
      const c = await api.cliente(bozza.cliente_id)
      const { generaPreventivoPdf } = await import('../documents/preventivoPdf')
      await generaPreventivoPdf(bozza, c)
    } catch (e) {
      setAvviso(`PDF non ancora disponibile: ${messaggioDi(e)}`)
    }
  }

  const elimina = async () => {
    setInCorso(true)
    setAvviso(null)
    try {
      await api.eliminaPreventivo(id)
      notificaDatiCambiati()
      navigate('/preventivi')
    } catch (e) {
      setAvviso(messaggioDi(e))
      setInCorso(false)
      setConfermaElimina(false)
    }
  }

  const azioni: AzionePagina[] = [
    ...(soloLettura
      ? []
      : [
          {
            chiave: 'salva',
            etichetta: modificato ? 'Salva preventivo' : 'Salvato',
            etichettaBreve: modificato ? 'Salva' : 'Salvato',
            icona: Check,
            // Primario solo quando c'è davvero qualcosa da salvare: altrimenti
            // il comando che conta è quello che fa avanzare il documento.
            tono: (modificato ? 'primario' : 'secondario') as AzionePagina['tono'],
            onClick: () => void salva(),
            disabilitata: !modificato || inCorso,
            inCorso,
          },
        ]),
    ...(bozza.stato === 'accettato'
      ? [
          {
            chiave: 'converti',
            etichetta: 'Converti in ordine',
            etichettaBreve: 'Converti',
            icona: ArrowRight,
            tono: 'primario' as const,
            onClick: () => void converti(),
            disabilitata: inCorso || modificato,
            motivo: modificato
              ? 'Salva le modifiche prima di convertire: l’ordine copia il preventivo salvato.'
              : undefined,
          },
        ]
      : []),
    {
      chiave: 'duplica',
      etichetta: 'Duplica',
      icona: Copy,
      tono: 'secondario',
      onClick: () => void duplica(),
      disabilitata: inCorso,
    },
    {
      chiave: 'pdf',
      etichetta: 'Scarica PDF',
      icona: FileDown,
      tono: 'secondario',
      onClick: () => void scaricaPdf(),
      soloDesktop: true,
    },
    ...(soloLettura
      ? []
      : [
          {
            chiave: 'elimina',
            etichetta: 'Elimina',
            icona: Trash2,
            tono: 'pericolo' as const,
            onClick: () => setConfermaElimina(true),
            soloDesktop: true,
          },
        ]),
  ]

  return (
    <>
      <IntestazionePagina
        titolo={`Preventivo ${bozza.numero}`}
        sottotitolo={`${bozza.cliente_nome}${bozza.oggetto ? ` — ${bozza.oggetto}` : ''}`}
        indietro={{ a: '/preventivi', label: 'Tutti i preventivi' }}
        azioni={
          <>
            <SelectStato
              stato={bozza.stato}
              etichette={STATO_PREVENTIVO_LABEL}
              toni={TONO_PREVENTIVO}
              ammessi={prossimiStati(TRANSIZIONI_PREVENTIVO, bozza.stato)}
              onCambia={(nuovo) => void cambiaStato(nuovo)}
            />
            <BarraAzioni azioni={azioni} />
          </>
        }
      />

      <AvvisoErrore messaggio={avviso} />

      {soloLettura && (
        <p className="mb-4 rounded-lg border border-ok/30 bg-ok/8 px-3 py-2 text-sm text-ink-soft">
          Preventivo convertito in ordine: da qui è in sola lettura.{' '}
          {bozza.ordine_id && (
            <Link to={`/ordini/${bozza.ordine_id}`} className="font-semibold text-brand-strong hover:underline">
              Apri l’ordine
            </Link>
          )}{' '}
          Per rifare lo stesso lavoro, duplicalo: nasce un preventivo nuovo, in bozza.
        </p>
      )}

      {scaduto && (
        <p className="mb-4 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-sm text-warn">
          Scaduto il {formatData(bozza.data_scadenza)}: rinnova la validità prima di ripresentarlo.
        </p>
      )}

      <section className="card mb-4 px-5 py-5">
        <GrigliaCampi colonne={2}>
          <Campo etichetta="Cliente" obbligatorio>
            <SelettoreCliente
              valore={cliente}
              disabilitato={soloLettura}
              cancellabile={false}
              onScegli={(c) => {
                if (!c) return
                setCliente(c)
                imposta({ cliente_id: c.id, cliente_nome: c.ragione_sociale })
              }}
            />
          </Campo>

          <Campo etichetta="Oggetto">
            <Testo
              valore={bozza.oggetto}
              onCambia={(v) => imposta({ oggetto: v })}
              disabled={soloLettura}
              placeholder="Pavimento rovere antico — villa a Conegliano"
            />
          </Campo>

          <Campo etichetta="Data">
            <Testo
              valore={bozza.data}
              onCambia={(v) => imposta({ data: v })}
              type="date"
              disabled={soloLettura}
            />
          </Campo>

          <Campo
            etichetta="Validità (giorni)"
            aiuto={`Scadenza calcolata: ${formatData(salvato.data_scadenza)}`}
          >
            <Testo
              valore={String(bozza.validita_giorni)}
              onCambia={(v) => imposta({ validita_giorni: Math.max(0, Math.round(Number(v) || 0)) })}
              type="number"
              min={0}
              disabled={soloLettura}
            />
          </Campo>

          <Campo etichetta="Condizioni di pagamento">
            <AreaTesto
              valore={bozza.condizioni_pagamento ?? ''}
              onCambia={(v) => imposta({ condizioni_pagamento: v || null })}
              righe={2}
              disabled={soloLettura}
            />
          </Campo>

          <Campo etichetta="Tempi di consegna">
            <AreaTesto
              valore={bozza.tempi_consegna ?? ''}
              onCambia={(v) => imposta({ tempi_consegna: v || null })}
              righe={2}
              disabled={soloLettura}
            />
          </Campo>

          <Campo
            etichetta="Sconto generale (%)"
            aiuto="Si ripartisce sulle righe prima del calcolo dell’IVA."
          >
            <Testo
              valore={String(bozza.sconto_generale_percentuale)}
              onCambia={(v) =>
                imposta({ sconto_generale_percentuale: Math.max(0, Number(v.replace(',', '.')) || 0) })
              }
              type="number"
              min={0}
              step="0.5"
              disabled={soloLettura}
            />
          </Campo>

          <Campo etichetta="Note" className="md:col-span-2">
            <AreaTesto
              valore={bozza.note ?? ''}
              onCambia={(v) => imposta({ note: v || null })}
              righe={3}
              disabled={soloLettura}
              placeholder="Annotazioni che finiscono in fondo al documento."
            />
          </Campo>
        </GrigliaCampi>
      </section>

      <RigheDocumento<RigaPreventivo>
        righe={bozza.righe}
        onCambia={(righe) => imposta({ righe })}
        articoli={articoli ?? []}
        scontoGenerale={bozza.sconto_generale_percentuale}
        soloLettura={soloLettura}
        creaRiga={() => rigaVuota(cliente?.aliquota_iva_default ?? 22)}
      />

      {!soloLettura && (
        <p className="mt-4 text-right text-sm text-ink-mute">
          {modificato
            ? 'Modifiche non salvate. Cmd/Ctrl+Invio salva.'
            : `Totale salvato: ${formatEuro(salvato.totale_cents)}`}
        </p>
      )}

      {confermaElimina && (
        <Conferma
          titolo="Eliminare il preventivo?"
          messaggio={`Il preventivo ${bozza.numero} verrà eliminato definitivamente. Un preventivo già convertito in ordine non si può eliminare.`}
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
