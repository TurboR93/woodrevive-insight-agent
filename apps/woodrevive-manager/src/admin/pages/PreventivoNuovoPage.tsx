import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { brandConfig } from '../brand.config'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Testo } from '../components/Campi'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import IntestazionePagina from '../components/IntestazionePagina'
import RigheDocumento, { rigaVuota } from '../components/RigheDocumento'
import { SelettoreCliente } from '../components/SelettoreAnagrafica'
import { modaleAperta } from '../components/Ui'
import { notificaDatiCambiati } from '../components/eventiDati'
import type { ClienteConTotali, RigaPreventivo } from '../domain'
import { formatEuro, formatPercentuale, oggiISO } from '../lib/format'
import { imponibileRiga, totaliDocumento } from '../lib/money'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Creazione rapida del preventivo: **una schermata sola**.
 *
 * Prima costava sette passaggi su tre viste — bottone, modale con cliente e
 * oggetto, salva, si apriva il dettaglio, aggiungi riga, scegli articolo,
 * quantità, salva — e lasciava in lista un PRV vuoto ogni volta che qualcuno
 * cambiava idea. Qui si salva UNA volta, alla fine: finché non si preme
 * «Salva», nessun numero di documento viene consumato.
 *
 * Il ciclo da tastiera è il punto di tutto:
 *   cliente → Invio → si è già nel campo articolo
 *   articolo → Invio → la riga entra con prezzo, UM, IVA ed essenza già dentro
 *   quantità → Invio → si torna a cercare il prossimo articolo
 *   Cmd/Ctrl+Invio → salvato.
 * Un preventivo di quattro righe si scrive senza toccare il mouse.
 *
 * Quello che NON si chiede, perché si sa già: data (oggi), validità,
 * condizioni di pagamento e tempi di consegna (`brand.config.ts`), sconto
 * generale (quello di listino del cliente), oggetto (proposto dalla prima riga).
 * Tutto resta modificabile, ma sotto «Condizioni», che parte chiusa: chi ha il
 * cliente davanti non deve scorrere otto campi per arrivare alla merce.
 *
 * `?cliente=<id>` preseleziona il cliente — è così che ci si arriva dalla sua
 * scheda — e in quel caso il fuoco parte direttamente dalla ricerca articolo.
 */
export default function PreventivoNuovoPage() {
  const navigate = useNavigate()
  const [parametri] = useSearchParams()
  const clienteDaUrl = parametri.get('cliente')

  // Una sola chiamata, non l'intera anagrafica: il cliente qui è già noto.
  const { dati: clienteRisolto, errore: erroreCliente } = useFetch(
    () => (clienteDaUrl ? api.cliente(clienteDaUrl) : Promise.resolve(null)),
    [clienteDaUrl],
  )

  const [cliente, setCliente] = useState<ClienteConTotali | null>(null)
  const [righe, setRighe] = useState<RigaPreventivo[]>([])
  const [data, setData] = useState(oggiISO())
  const [validita, setValidita] = useState<number>(brandConfig.documenti.validitaGiorniPreventivo)
  const [sconto, setSconto] = useState(0)
  const [scontoToccato, setScontoToccato] = useState(false)
  const [condizioni, setCondizioni] = useState<string>(brandConfig.documenti.condizioniPagamento)
  const [tempi, setTempi] = useState<string>(brandConfig.documenti.tempiConsegna)
  const [note, setNote] = useState('')
  /** `null` finché nessuno lo scrive: vale la proposta calcolata dalla prima riga. */
  const [oggetto, setOggetto] = useState<string | null>(null)
  const [condizioniAperte, setCondizioniAperte] = useState(false)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const zonaRighe = useRef<HTMLDivElement>(null)

  /**
   * Il campo «Aggiungi un articolo» sta in testata a `RigheDocumento`, che non
   * espone un ref: lo si cerca nel proprio sotto-albero. Costa una riga e
   * lascia una sola ricerca articolo a schermo, la stessa del dettaglio.
   */
  const fuocoSuRicercaArticolo = () => {
    requestAnimationFrame(() => {
      zonaRighe.current
        ?.querySelector<HTMLInputElement>('input[aria-label="Aggiungi un articolo"]')
        ?.focus()
    })
  }

  const scegliCliente = (c: ClienteConTotali | null) => {
    setCliente(c)
    // Lo sconto di listino è un patto già preso con quel cliente: si applica da
    // solo, e resta com'è se qualcuno l'ha già cambiato a mano.
    if (c && !scontoToccato) setSconto(c.sconto_default_percentuale)
  }

  useEffect(() => {
    if (!clienteRisolto) return
    setCliente(clienteRisolto)
    setSconto((s) => (scontoToccato ? s : clienteRisolto.sconto_default_percentuale))
    // Vale una volta, quando il cliente della querystring arriva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteRisolto])

  const totali = totaliDocumento(
    righe.map((r) => ({
      imponibile_cents: imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, r.sconto_percentuale),
      aliquota_iva: r.aliquota_iva,
    })),
    sconto,
  )

  /** «Pavimento rovere antico — Rossi S.r.l.»: la prima riga e il cliente. */
  const oggettoProposto =
    righe[0]?.descrizione && cliente ? `${righe[0].descrizione} — ${cliente.ragione_sociale}` : ''
  const oggettoScritto = oggetto ?? oggettoProposto

  const pronto = Boolean(cliente) && righe.length > 0

  const salva = async () => {
    if (!cliente) {
      setAvviso('Scegli il cliente: è l’unica cosa che il preventivo non può indovinare.')
      return
    }
    if (!righe.length) {
      setAvviso('Aggiungi almeno una riga: un preventivo vuoto non serve a nessuno.')
      return
    }
    setInCorso(true)
    setAvviso(null)
    try {
      const p = await api.creaPreventivo({
        data,
        cliente_id: cliente.id,
        cliente_nome: cliente.ragione_sociale,
        oggetto: oggettoScritto.trim(),
        righe,
        sconto_generale_percentuale: sconto,
        validita_giorni: validita,
        condizioni_pagamento: condizioni.trim() || null,
        tempi_consegna: tempi.trim() || null,
        note: note.trim() || null,
        stato: 'bozza',
        ordine_id: null,
      })
      notificaDatiCambiati()
      // `replace`: tornando indietro dal dettaglio si va alla lista, non a una
      // schermata di creazione che ha già creato il suo documento.
      navigate(`/preventivi/${p.id}`, { replace: true })
    } catch (e) {
      setAvviso(messaggioDi(e))
      setInCorso(false)
    }
  }

  // Cmd/Ctrl+Invio salva da qualunque campo: chi lavora da tastiera non deve
  // cercare il bottone. Volutamente senza dipendenze — si riregistra a ogni
  // render e vede sempre i valori correnti. Con una modale aperta tace: lo
  // strato sopra comanda.
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

  const azioni: AzionePagina[] = [
    {
      chiave: 'annulla',
      etichetta: 'Annulla',
      a: '/preventivi',
      tono: 'fantasma',
      // In fondo al telefono resta solo il comando che conta.
      soloDesktop: true,
    },
    {
      chiave: 'salva',
      // Il totale sta NEL comando: sul telefono la barra in fondo è l'unica
      // cosa sempre visibile, e chi ha il cliente davanti deve vedere dove sta
      // arrivando mentre aggiunge righe.
      etichetta: `Salva preventivo · ${formatEuro(totali.totale_cents)}`,
      icona: Check,
      tono: 'primario',
      onClick: () => void salva(),
      disabilitata: !pronto || inCorso,
      motivo: !cliente
        ? 'Scegli il cliente per salvare.'
        : !righe.length
          ? 'Aggiungi almeno una riga.'
          : undefined,
      inCorso,
    },
  ]

  const riassuntoCondizioni = [
    `Oggetto: ${oggettoScritto.trim() || 'dalla prima riga'}`,
    `validità ${validita} giorni`,
    sconto > 0 ? `sconto ${formatPercentuale(sconto, 0)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <IntestazionePagina
        titolo="Nuovo preventivo"
        sottotitolo="Cliente, articoli, quantità. Il resto è già compilato e si salva una volta sola."
        indietro={{ a: '/preventivi', label: 'Tutti i preventivi' }}
        azioni={<BarraAzioni azioni={azioni} />}
      />

      <AvvisoErrore messaggio={avviso ?? erroreCliente} />

      {/* Un `<form>` vero: Invio nei campi non si perde nel vuoto. Il
          salvataggio passa comunque da `salva()`, uno solo per tutte le vie. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void salva()
        }}
      >
        <section className="card mb-4 px-5 py-5">
          <Campo
            etichetta="Cliente"
            obbligatorio
            aiuto={
              cliente
                ? `${cliente.citta ?? 'Senza città'}${
                    cliente.sconto_default_percentuale > 0
                      ? ` · sconto di listino ${formatPercentuale(cliente.sconto_default_percentuale, 0)}, già applicato`
                      : ''
                  }`
                : 'Tre lettere della ragione sociale, del codice o della città, poi Invio.'
            }
          >
            <SelettoreCliente
              valore={cliente}
              autoFocus={!clienteDaUrl}
              onScegli={(c) => {
                scegliCliente(c)
                if (c) fuocoSuRicercaArticolo()
              }}
            />
          </Campo>
        </section>

        {/* ── Condizioni: chiuse, perché sono già decise ──────────────────── */}
        <section className="card mb-4">
          <button
            type="button"
            className="flex min-h-[2.75rem] w-full items-center justify-between gap-3 px-5 py-4 text-left"
            aria-expanded={condizioniAperte}
            onClick={() => setCondizioniAperte((v) => !v)}
          >
            <span className="min-w-0">
              <span className="font-display text-base text-ink">Condizioni</span>
              <span className="mt-0.5 block truncate text-xs text-ink-mute">{riassuntoCondizioni}</span>
            </span>
            <ChevronDown
              size={18}
              className={`shrink-0 text-ink-mute transition-transform ${condizioniAperte ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>

          {condizioniAperte && (
            <div className="border-t border-line px-5 py-5">
              <GrigliaCampi colonne={2}>
                <Campo
                  etichetta="Oggetto"
                  className="md:col-span-2"
                  aiuto="Come lo riconosce il cliente. Se lo lasci stare, lo scrive la prima riga."
                >
                  <Testo
                    valore={oggettoScritto}
                    onCambia={setOggetto}
                    placeholder="Pavimento rovere antico — villa a Conegliano"
                  />
                </Campo>

                <Campo etichetta="Data">
                  <Testo valore={data} onCambia={setData} type="date" />
                </Campo>

                <Campo etichetta="Validità (giorni)">
                  <Testo
                    valore={String(validita)}
                    onCambia={(v) => setValidita(Math.max(0, Math.round(Number(v) || 0)))}
                    type="number"
                    min={0}
                  />
                </Campo>

                <Campo
                  etichetta="Sconto generale (%)"
                  aiuto="Si ripartisce sulle righe prima del calcolo dell’IVA."
                >
                  <Testo
                    valore={String(sconto)}
                    onCambia={(v) => {
                      setScontoToccato(true)
                      setSconto(Math.max(0, Number(v.replace(',', '.')) || 0))
                    }}
                    type="number"
                    min={0}
                    step="0.5"
                  />
                </Campo>

                <Campo etichetta="Condizioni di pagamento">
                  <AreaTesto valore={condizioni} onCambia={setCondizioni} righe={2} />
                </Campo>

                <Campo etichetta="Tempi di consegna">
                  <AreaTesto valore={tempi} onCambia={setTempi} righe={2} />
                </Campo>

                <Campo etichetta="Note" className="md:col-span-2">
                  <AreaTesto
                    valore={note}
                    onCambia={setNote}
                    righe={2}
                    placeholder="Annotazioni che finiscono in fondo al documento."
                  />
                </Campo>
              </GrigliaCampi>
            </div>
          )}
        </section>

        <div ref={zonaRighe}>
          <RigheDocumento<RigaPreventivo>
            righe={righe}
            onCambia={setRighe}
            // Nessun catalogo caricato in anticipo: qui le righe nascono tutte
            // dalla ricerca, che si tiene da parte gli articoli scelti per il
            // margine. Su un telefono in cantiere è una lista intera in meno.
            articoli={[]}
            scontoGenerale={sconto}
            creaRiga={() => rigaVuota(cliente?.aliquota_iva_default ?? 22)}
            autoFocusRicerca={Boolean(clienteDaUrl)}
          />
        </div>

        <p className="mt-4 text-xs text-ink-mute">
          Il preventivo nasce in bozza e non consuma un numero finché non lo salvi. Da tastiera:
          Cmd/Ctrl+Invio salva.
        </p>
      </form>
    </>
  )
}
