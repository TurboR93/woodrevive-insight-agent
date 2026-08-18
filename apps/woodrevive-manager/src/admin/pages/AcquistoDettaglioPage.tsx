import { ExternalLink, PackageCheck, Save, Trash2, Warehouse, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../api'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Scelta, Testo } from '../components/Campi'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import IntestazionePagina from '../components/IntestazionePagina'
import SelettoreArticolo, { AggiungiArticolo } from '../components/SelettoreArticolo'
import { SelettoreFornitore } from '../components/SelettoreAnagrafica'
import type { ManiglieSelettore } from '../components/SelettoreRicerca'
import StatoBadge from '../components/StatoBadge'
import { Card, Caricamento, Dato, Errore } from '../components/Ui'
import { notificaDatiCambiati } from '../components/eventiDati'
import {
  ESSENZA_LABEL,
  PATINA_LABEL,
  QUALITA_LABEL,
  STATO_ACQUISTO_LABEL,
  TONO_ACQUISTO,
  type Articolo,
  type Essenza,
  type FornitoreConTotali,
  type ID,
  type Lotto,
  type LottoInput,
  type OrdineAcquisto,
  type Patina,
  type Qualita,
  type UnitaMisura,
} from '../domain'
import {
  SIMBOLO_UM,
  centsAInput,
  euroACents,
  formatData,
  formatEuro,
  formatQuantita,
  oggiISO,
} from '../lib/format'
import { nuovoId } from '../lib/id'
import { imponibileRiga, ripartisci, totaliDocumento } from '../lib/money'
import { inputAMilli, milliAInput } from '../lib/qty'
import { messaggioDi, useFetch } from '../useFetch'

/* ==========================================================================
   Come nelle altre pagine di documento, i numeri stanno nel form come testo e
   si convertono in centesimi/millesimi solo al salvataggio.

   Ogni riga compra un ARTICOLO preciso, non una descrizione libera: alla
   ricezione la riga deve generare un carico di magazzino, e un carico senza
   articolo non muove nessuna giacenza — sarebbe merce che il gestionale non sa
   di avere.

   La ricezione non è più una modale stretta con i campi della partita
   schiacciati in fondo: è una SCHERMATA DI LAVORO che prende tutta la pagina —
   in alto la partita (una per fornitura), sotto le righe con quantità ricevuta
   e costo. Si registra da lì, e chi la usa in piazzale col telefono vede una
   cosa per volta invece di una finestra da far scorrere.
   ========================================================================== */

interface FormRiga {
  id: ID
  articolo_id: string // '' finché non si sceglie: la ricezione lo pretende
  codice_articolo: string | null
  descrizione: string
  quantita: string
  unita_misura: UnitaMisura
  prezzo: string
  aliquota_iva: number
  lotto_id: ID | null
  note: string | null
}

interface Form {
  fornitore_id: string
  data: string
  data_consegna_prevista: string
  trasporto: string
  note: string
  righe: FormRiga[]
}

/**
 * Dati della partita che nascerà alla ricezione.
 *
 * Uno solo per ordine, non uno per riga: la provenienza è una proprietà della
 * fornitura. Tavole, perlinato e travi scesi dallo stesso fienile sono una
 * partita sola, e spezzarla per riga darebbe tre storie identiche da tenere
 * allineate a mano.
 */
interface FormLotto {
  descrizione: string
  provenienza_edificio: string
  provenienza_localita: string
  provenienza_provincia: string
  anno: string
  essenza: Essenza
  patina: Patina
  qualita: Qualita
  ubicazione: string
  note_storiche: string
}

const LOTTO_VUOTO: FormLotto = {
  descrizione: '',
  provenienza_edificio: '',
  provenienza_localita: '',
  provenienza_provincia: '',
  anno: '',
  essenza: 'abete',
  patina: 'naturale',
  qualita: 'B',
  ubicazione: '',
  note_storiche: '',
}

function daAcquisto(a: OrdineAcquisto): Form {
  return {
    fornitore_id: a.fornitore_id,
    data: a.data,
    data_consegna_prevista: a.data_consegna_prevista ?? '',
    trasporto: centsAInput(a.spese_trasporto_cents),
    note: a.note ?? '',
    righe: a.righe.map((r) => ({
      id: r.id,
      articolo_id: r.articolo_id,
      codice_articolo: r.codice_articolo,
      descrizione: r.descrizione,
      quantita: milliAInput(r.quantita_milli),
      unita_misura: r.unita_misura,
      prezzo: centsAInput(r.prezzo_unitario_cents),
      aliquota_iva: r.aliquota_iva,
      lotto_id: r.lotto_id,
      note: r.note,
    })),
  }
}

function corpo(f: Form, fornitori: FornitoreConTotali[]): Partial<OrdineAcquisto> {
  const fornitore = fornitori.find((x) => x.id === f.fornitore_id)
  const patch: Partial<OrdineAcquisto> = {
    data: f.data,
    fornitore_id: f.fornitore_id,
    data_consegna_prevista: f.data_consegna_prevista || null,
    spese_trasporto_cents: euroACents(f.trasporto),
    note: f.note.trim() || null,
    righe: f.righe.map((r) => ({
      id: r.id,
      articolo_id: r.articolo_id,
      codice_articolo: r.codice_articolo,
      descrizione: r.descrizione,
      quantita_milli: inputAMilli(r.quantita),
      unita_misura: r.unita_misura,
      prezzo_unitario_cents: euroACents(r.prezzo),
      aliquota_iva: r.aliquota_iva,
      imponibile_cents: imponibileRiga(inputAMilli(r.quantita), euroACents(r.prezzo), 0),
      lotto_id: r.lotto_id,
      note: r.note,
    })),
  }
  // `fornitore_nome` è uno snapshot: si riscrive solo se il fornitore esiste
  // davvero, altrimenti il documento perderebbe il nome che ha già.
  if (fornitore) patch.fornitore_nome = fornitore.ragione_sociale
  return patch
}

const OPZIONI_ESSENZA = (Object.entries(ESSENZA_LABEL) as Array<[Essenza, string]>).map(
  ([valore, etichetta]) => ({ valore, etichetta }),
)
const OPZIONI_PATINA = (Object.entries(PATINA_LABEL) as Array<[Patina, string]>).map(
  ([valore, etichetta]) => ({ valore, etichetta }),
)
const OPZIONI_QUALITA = (Object.entries(QUALITA_LABEL) as Array<[Qualita, string]>).map(
  ([valore, etichetta]) => ({ valore, etichetta }),
)

/** Griglia densa delle righe da `md:` in su. Sotto, ogni riga è una card. */
const GRIGLIA_RIGA =
  'md:grid md:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem_2.75rem] md:items-center md:gap-3'

// ===========================================================================

export default function AcquistoDettaglioPage() {
  const { id = '' } = useParams()
  const ricerca = useRef<ManiglieSelettore>(null)

  /*
   * Il catalogo si carica intero, non solo gli articoli attivi: un ordine
   * vecchio può riferire un articolo poi disattivato, e filtrarlo qui
   * lascerebbe la riga senza il suo articolo mentre l'articolo c'è.
   */
  const { dati, caricamento, errore, ricarica } = useFetch(
    () =>
      Promise.all([api.acquisto(id), api.listaFornitori(), api.listaLotti(), api.listaArticoli()]),
    [id],
  )

  const [form, setForm] = useState<Form | null>(null)
  const [erroreAzione, setErroreAzione] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [modo, setModo] = useState<'ordine' | 'ricezione'>('ordine')
  const [dataRicezione, setDataRicezione] = useState(oggiISO())
  const [datiLotto, setDatiLotto] = useState<FormLotto>(LOTTO_VUOTO)
  const [lottoCreato, setLottoCreato] = useState<Lotto | null>(null)
  const [fuocoRiga, setFuocoRiga] = useState<ID | null>(null)

  const acquisto = dati?.[0] ?? null
  const fornitori: FornitoreConTotali[] = useMemo(() => dati?.[1] ?? [], [dati])
  const lotti: Lotto[] = useMemo(() => dati?.[2] ?? [], [dati])
  const articoli: Articolo[] = useMemo(() => dati?.[3] ?? [], [dati])

  useEffect(() => {
    if (acquisto) setForm(daAcquisto(acquisto))
  }, [acquisto])

  /*
   * Il fuoco sulla quantità della riga appena aggiunta.
   *
   * `autoFocus` da solo NON basta: `AggiungiArticolo`, dopo la scelta, si
   * riprende il fuoco dentro un `requestAnimationFrame` registrato mentre gira
   * il gestore dell'Invio — cioè prima che React monti la riga — e quindi
   * scatta DOPO `autoFocus` e se lo riprende. Senza questo effetto la quantità
   * digitata finisce nella ricerca articolo e la riga resta a zero.
   *
   * Il nostro rAF parte da un effetto, che gira al commit: arriva secondo
   * nella coda dello stesso frame e vince. `Testo` non inoltra i ref, da qui
   * l'id. Stessa cura in AcquistoNuovoPage; la correzione giusta starebbe in
   * `AggiungiArticolo`, con una prop per non trattenere il fuoco.
   */
  useEffect(() => {
    if (!fuocoRiga) return
    const riga = fuocoRiga
    const frame = requestAnimationFrame(() => {
      const campo = document.getElementById(`qta-acq-${riga}`)
      if (campo instanceof HTMLInputElement) {
        campo.focus()
        campo.select()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [fuocoRiga])

  const mappaLotti = useMemo(() => new Map<ID, Lotto>(lotti.map((l) => [l.id, l])), [lotti])
  const mappaArticoli = useMemo(
    () => new Map<ID, Articolo>(articoli.map((a) => [a.id, a])),
    [articoli],
  )

  if (errore) return <Errore messaggio={errore} onRiprova={ricarica} />
  // L'ordine inesistente torna 404 dall'API e finisce in `errore`: qui manca
  // solo l'istante fra la risposta e la copia di lavoro.
  if (caricamento || !acquisto || !form) return <Caricamento />

  const soloLettura = acquisto.stato === 'ricevuto' || acquisto.stato === 'annullato'
  const aggiorna = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const aggiornaRiga = (indice: number, patch: Partial<FormRiga>) =>
    aggiorna({ righe: form.righe.map((r, i) => (i === indice ? { ...r, ...patch } : r)) })

  /**
   * Scegliere l'articolo riempie la riga: descrizione, unità di misura,
   * aliquota e ultimo prezzo pagato. Sono proposte, non vincoli — il fornitore
   * può quotare diversamente, e la riga resta modificabile.
   */
  const scegliArticolo = (indice: number, a: Articolo | null) => {
    if (!a) {
      aggiornaRiga(indice, { articolo_id: '', codice_articolo: null })
      return
    }
    const riga = form.righe[indice]
    const precedente = mappaArticoli.get(riga.articolo_id)
    const descrizioneDaTenere =
      riga.descrizione.trim() && riga.descrizione !== precedente?.nome ? riga.descrizione : a.nome
    aggiornaRiga(indice, {
      articolo_id: a.id,
      codice_articolo: a.codice,
      descrizione: descrizioneDaTenere,
      unita_misura: a.unita_misura,
      aliquota_iva: a.aliquota_iva,
      prezzo: riga.prezzo || centsAInput(a.prezzo_acquisto_cents),
    })
  }

  /** Invio sulla ricerca in testata: la riga nasce già compilata. */
  const aggiungiArticolo = (a: Articolo) => {
    const nuova: FormRiga = {
      id: nuovoId(),
      articolo_id: a.id,
      codice_articolo: a.codice,
      descrizione: a.nome,
      quantita: '',
      unita_misura: a.unita_misura,
      prezzo: centsAInput(a.prezzo_acquisto_cents),
      aliquota_iva: a.aliquota_iva,
      lotto_id: null,
      note: null,
    }
    aggiorna({ righe: [...form.righe, nuova] })
    setFuocoRiga(nuova.id)
  }

  // ------------------------------------------------------------------ totali
  const righeCalcolate = form.righe.map((r) => ({
    imponibile_cents: imponibileRiga(inputAMilli(r.quantita), euroACents(r.prezzo), 0),
    aliquota_iva: r.aliquota_iva,
  }))
  const totaliRighe = totaliDocumento(righeCalcolate, 0)
  const trasportoCents = euroACents(form.trasporto)
  const aliquotaTrasporto = form.righe[0]?.aliquota_iva ?? 22
  const imponibile = totaliRighe.imponibile_cents + trasportoCents
  const iva = totaliRighe.iva_cents + Math.round((trasportoCents * aliquotaTrasporto) / 100)

  const indiciDaRicevere = form.righe
    .map((r, i) => (r.lotto_id ? -1 : i))
    .filter((i) => i >= 0)
  const righeDaRicevere = indiciDaRicevere.map((i) => form.righe[i])
  const righeSenzaArticolo = righeDaRicevere.filter((r) => !r.articolo_id)
  // Le stesse quote che calcolerà `ricevalAcquisto`: mostrarle prima è ciò che
  // rende leggibile il costo di carico, e quindi il margine di domani.
  const quote = ripartisci(
    trasportoCents,
    indiciDaRicevere.map((i) => righeCalcolate[i].imponibile_cents),
  )
  const costoPartita = indiciDaRicevere.reduce(
    (t, indice, k) => t + righeCalcolate[indice].imponibile_cents + quote[k],
    0,
  )

  const lottiGenerati = [
    ...new Map(
      acquisto.righe
        .map((r) => (r.lotto_id ? mappaLotti.get(r.lotto_id) : undefined))
        .filter((l): l is Lotto => Boolean(l))
        .map((l) => [l.id, l]),
    ).values(),
  ]

  const motivoRicezioneBloccata = !righeDaRicevere.length
    ? 'Tutte le righe sono già state ricevute: non c’è materiale da prendere in carico.'
    : righeSenzaArticolo.length
      ? 'Ogni riga deve indicare un articolo: senza, la merce non entra a magazzino.'
      : righeDaRicevere.some((r) => inputAMilli(r.quantita) <= 0)
        ? 'Una riga ha quantità zero: scrivi quanto ne è arrivato o toglila.'
        : undefined

  // ------------------------------------------------------------------ azioni
  async function salva() {
    if (!form) return
    setInCorso(true)
    setErroreAzione(null)
    try {
      await api.aggiornaAcquisto(id, corpo(form, fornitori))
      notificaDatiCambiati()
      ricarica()
    } catch (e) {
      setErroreAzione(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  function apriRicezione() {
    if (!form || !acquisto) return
    setDataRicezione(oggiISO())
    const primo = mappaArticoli.get(form.righe.find((r) => !r.lotto_id)?.articolo_id ?? '')
    setDatiLotto({
      ...LOTTO_VUOTO,
      descrizione: `Fornitura ${acquisto.numero} — ${acquisto.fornitore_nome}`,
      essenza: primo?.essenza ?? LOTTO_VUOTO.essenza,
      patina: primo?.patina ?? LOTTO_VUOTO.patina,
    })
    setErroreAzione(null)
    setModo('ricezione')
    window.scrollTo({ top: 0 })
  }

  async function registraRicezione() {
    if (!form) return
    setInCorso(true)
    setErroreAzione(null)
    try {
      // La ricezione lavora sulle righe salvate: si salva e poi si riceve, in
      // un gesto solo. Il vecchio «Salva» prima di «Registra ricezione» era un
      // clic che non serviva a niente e che tutti facevano lo stesso.
      await api.aggiornaAcquisto(id, corpo(form, fornitori))
      const lotto: Partial<LottoInput> = {
        descrizione: datiLotto.descrizione.trim() || undefined,
        provenienza_edificio: datiLotto.provenienza_edificio.trim() || null,
        provenienza_localita: datiLotto.provenienza_localita.trim() || null,
        provenienza_provincia: datiLotto.provenienza_provincia.trim().toUpperCase() || null,
        anno_costruzione_stimato: Number(datiLotto.anno) || null,
        essenza: datiLotto.essenza,
        patina: datiLotto.patina,
        qualita: datiLotto.qualita,
        ubicazione: datiLotto.ubicazione.trim() || null,
        note_storiche: datiLotto.note_storiche.trim() || null,
      }
      const esito = await api.ricevalAcquisto(id, { data_ricezione: dataRicezione, lotto })
      setLottoCreato(esito.lotto)
      setModo('ordine')
      notificaDatiCambiati()
      ricarica()
      window.scrollTo({ top: 0 })
    } catch (e) {
      setErroreAzione(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  const aggiornaLotto = (patch: Partial<FormLotto>) =>
    setDatiLotto((precedente) => ({ ...precedente, ...patch }))

  /*
   * Righe della fornitura. È una FUNZIONE che restituisce JSX, non un
   * componente dichiarato qui dentro: un componente definito nel corpo del
   * padre è un tipo nuovo a ogni render, React lo rimonta e il campo che si
   * sta compilando perde il fuoco a ogni battuta.
   */
  function righeModificabili(ricevibiliSolo = false) {
    if (!form) return null
    const visibili = form.righe
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => (ricevibiliSolo ? !r.lotto_id : true))

    if (!visibili.length) {
      return (
        <p className="py-4 text-sm text-ink-mute">
          Nessuna riga. Cerca gli articoli comprati al fornitore: alla ricezione ognuno entra a
          magazzino con la partita di questa fornitura.
        </p>
      )
    }

    return (
      <>
        <div className={`hidden px-1 pb-2 ${GRIGLIA_RIGA}`}>
          <span className="label">Articolo</span>
          <span className="label text-right">
            {ricevibiliSolo ? 'Quantità ricevuta' : 'Quantità'}
          </span>
          <span className="label text-right">Costo unitario</span>
          <span className="label text-right">Costo di carico</span>
          <span className="sr-only">Azioni</span>
        </div>

        <ul className="space-y-3 md:space-y-0">
          {visibili.map(({ r, i }) => {
            const imponibileR = righeCalcolate[i].imponibile_cents
            const posizione = indiciDaRicevere.indexOf(i)
            const quota = posizione >= 0 ? quote[posizione] : 0
            const lotto = r.lotto_id ? mappaLotti.get(r.lotto_id) : undefined
            const bloccata = soloLettura || Boolean(r.lotto_id)

            if (bloccata) {
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-line px-4 py-3 md:rounded-none md:border-0 md:border-b md:border-line/60 md:px-1 md:py-2.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink">
                      {r.codice_articolo && (
                        <span className="tabular mr-1.5 text-ink-mute">{r.codice_articolo}</span>
                      )}
                      {r.descrizione || '—'}
                    </p>
                    {lotto && (
                      <Link
                        to={`/lotti/${lotto.id}`}
                        className="tabular text-xs font-semibold text-brand-strong hover:underline"
                      >
                        {lotto.codice}
                      </Link>
                    )}
                  </div>
                  <p className="tabular mt-1 text-xs text-ink-mute">
                    {formatQuantita(inputAMilli(r.quantita), r.unita_misura)} ·{' '}
                    {formatEuro(euroACents(r.prezzo))} al {SIMBOLO_UM[r.unita_misura]} ·{' '}
                    {formatEuro(imponibileR)} imponibile
                  </p>
                </li>
              )
            }

            return (
              <li
                key={r.id}
                className={`rounded-lg border border-line px-4 py-3 md:rounded-none md:border-0 md:border-b md:border-line/60 md:px-1 md:py-2 ${GRIGLIA_RIGA}`}
              >
                <div className="min-w-0">
                  <SelettoreArticolo
                    valore={mappaArticoli.get(r.articolo_id) ?? null}
                    etichettaValore={
                      r.codice_articolo ? `${r.codice_articolo} — ${r.descrizione}` : null
                    }
                    onScegli={(a) => scegliArticolo(i, a)}
                    soloAttivi={false}
                    etichettaAria={`Articolo della riga ${i + 1}`}
                  />
                  {r.articolo_id ? (
                    <input
                      className="input mt-2 text-sm md:mt-1 md:min-h-0 md:border-0 md:px-0 md:py-0 md:text-xs md:text-ink-mute"
                      value={r.descrizione}
                      onChange={(e) => aggiornaRiga(i, { descrizione: e.target.value })}
                      aria-label={`Descrizione della riga ${i + 1}`}
                      placeholder="Descrizione sul documento"
                    />
                  ) : (
                    <p className="mt-1 text-xs text-danger">
                      Senza articolo la merce non entra a magazzino.
                    </p>
                  )}
                </div>

                <div className="mt-3 md:mt-0">
                  <span className="label mb-1 md:hidden">
                    Quantità ({SIMBOLO_UM[r.unita_misura]})
                  </span>
                  <Testo
                    className="tabular text-right"
                    inputMode="decimal"
                    valore={r.quantita}
                    onCambia={(v) => aggiornaRiga(i, { quantita: v })}
                    placeholder="0"
                    id={`qta-acq-${r.id}`}
                    aria-label={`Quantità della riga ${i + 1}`}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      ricerca.current?.focus()
                    }}
                  />
                </div>

                <div className="mt-3 md:mt-0">
                  <span className="label mb-1 md:hidden">
                    Costo unitario (€/{SIMBOLO_UM[r.unita_misura]})
                  </span>
                  <Testo
                    className="tabular text-right"
                    inputMode="decimal"
                    valore={r.prezzo}
                    onCambia={(v) => aggiornaRiga(i, { prezzo: v })}
                    placeholder="0,00"
                    aria-label={`Costo unitario della riga ${i + 1}`}
                  />
                </div>

                <div className="mt-3 flex items-baseline justify-between gap-2 md:mt-0 md:block md:text-right">
                  <span className="label md:hidden">Costo di carico</span>
                  <span className="tabular text-sm font-semibold text-ink">
                    {formatEuro(imponibileR + quota)}
                  </span>
                  {quota > 0 && (
                    <span className="tabular block text-xs text-ink-mute">
                      {formatEuro(quota)} di trasporto
                    </span>
                  )}
                </div>

                <div className="mt-3 flex justify-end md:mt-0">
                  <button
                    type="button"
                    className="btn-icona btn-ghost"
                    onClick={() => aggiorna({ righe: form.righe.filter((_, k) => k !== i) })}
                    aria-label={`Elimina la riga ${i + 1}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </>
    )
  }

  // =========================================================== ricezione
  if (modo === 'ricezione') {
    const azioniRicezione: AzionePagina[] = [
      {
        chiave: 'annulla',
        etichetta: 'Torna all’ordine',
        etichettaBreve: 'Annulla',
        icona: X,
        tono: 'secondario',
        onClick: () => setModo('ordine'),
        disabilitata: inCorso,
      },
      {
        chiave: 'ricevi',
        etichetta: 'Registra la ricezione',
        etichettaBreve: 'Registra',
        icona: PackageCheck,
        tono: 'primario',
        onClick: registraRicezione,
        inCorso,
        disabilitata: Boolean(motivoRicezioneBloccata),
        motivo: motivoRicezioneBloccata,
      },
    ]

    return (
      <>
        <IntestazionePagina
          titolo={`Ricezione di ${acquisto.numero}`}
          sottotitolo={`${acquisto.fornitore_nome} · ${righeDaRicevere.length} ${
            righeDaRicevere.length === 1 ? 'riga da caricare' : 'righe da caricare'
          }. La fornitura diventa una partita di magazzino: qui si scrive la sua storia.`}
          azioni={<BarraAzioni azioni={azioniRicezione} />}
        />

        <AvvisoErrore messaggio={erroreAzione} />

        <div className="space-y-4">
          {/* ------------------------------------------------- la partita */}
          <Card titolo="La partita — da dove viene">
            <p className="mb-4 rounded-lg bg-tint/30 px-3 py-2 text-sm leading-relaxed text-ink-soft">
              Un blocco solo per tutta la fornitura: tavole, perlinato e travi scese dallo stesso
              fienile sono <strong>una partita sola</strong>. È la risposta che fra cinque anni il
              cliente si aspetta quando chiede da dove viene il suo pavimento.
            </p>

            <div className="space-y-4">
              <GrigliaCampi colonne={2}>
                <Campo etichetta="Descrizione della partita" obbligatorio>
                  <Testo
                    valore={datiLotto.descrizione}
                    onCambia={(v) => aggiornaLotto({ descrizione: v })}
                    placeholder="Fienile di Cordignano — tavolame e travi"
                  />
                </Campo>
                <Campo etichetta="Data di arrivo" obbligatorio>
                  <Testo type="date" valore={dataRicezione} onCambia={setDataRicezione} />
                </Campo>
              </GrigliaCampi>

              <GrigliaCampi colonne={2}>
                <Campo etichetta="Edificio di provenienza">
                  <Testo
                    valore={datiLotto.provenienza_edificio}
                    onCambia={(v) => aggiornaLotto({ provenienza_edificio: v })}
                    placeholder="Fienile ottocentesco con stalla"
                  />
                </Campo>
                <Campo etichetta="Ubicazione in magazzino">
                  <Testo
                    valore={datiLotto.ubicazione}
                    onCambia={(v) => aggiornaLotto({ ubicazione: v })}
                    placeholder="Capannone A — campata 3"
                  />
                </Campo>
              </GrigliaCampi>

              <GrigliaCampi colonne={3}>
                <Campo etichetta="Località">
                  <Testo
                    valore={datiLotto.provenienza_localita}
                    onCambia={(v) => aggiornaLotto({ provenienza_localita: v })}
                    placeholder="Cordignano"
                  />
                </Campo>
                <Campo etichetta="Provincia">
                  <Testo
                    valore={datiLotto.provenienza_provincia}
                    onCambia={(v) => aggiornaLotto({ provenienza_provincia: v })}
                    maxLength={2}
                    placeholder="TV"
                  />
                </Campo>
                <Campo etichetta="Anno di costruzione stimato">
                  <Testo
                    className="tabular"
                    inputMode="numeric"
                    valore={datiLotto.anno}
                    onCambia={(v) => aggiornaLotto({ anno: v })}
                    placeholder="1890"
                  />
                </Campo>
              </GrigliaCampi>

              <GrigliaCampi colonne={3}>
                <Campo etichetta="Essenza" obbligatorio>
                  <Scelta<Essenza>
                    valore={datiLotto.essenza}
                    onCambia={(v) => aggiornaLotto({ essenza: v })}
                    opzioni={OPZIONI_ESSENZA}
                  />
                </Campo>
                <Campo etichetta="Patina" obbligatorio>
                  <Scelta<Patina>
                    valore={datiLotto.patina}
                    onCambia={(v) => aggiornaLotto({ patina: v })}
                    opzioni={OPZIONI_PATINA}
                  />
                </Campo>
                <Campo etichetta="Qualità" obbligatorio>
                  <Scelta<Qualita>
                    valore={datiLotto.qualita}
                    onCambia={(v) => aggiornaLotto({ qualita: v })}
                    opzioni={OPZIONI_QUALITA}
                  />
                </Campo>
              </GrigliaCampi>

              <Campo
                etichetta="Note storiche"
                aiuto="È il testo che si racconta al cliente, e che finisce sulla scheda della partita."
              >
                <AreaTesto
                  righe={3}
                  valore={datiLotto.note_storiche}
                  onCambia={(v) => aggiornaLotto({ note_storiche: v })}
                  placeholder="Fienile costruito attorno al 1890, tavolame esposto a sud…"
                />
              </Campo>
            </div>
          </Card>

          {/* ------------------------------------------------- che cosa entra */}
          <Card titolo="Che cosa entra a magazzino">
            <div className="mb-4">
              <AggiungiArticolo
                ref={ricerca}
                onAggiungi={aggiungiArticolo}
                soloAttivi={false}
                segnaposto="È arrivato qualcosa in più? Cerca l’articolo e premi Invio…"
              />
            </div>

            {righeModificabili(true)}

            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-line pt-4 md:grid-cols-2">
              <Campo
                etichetta="Spese di trasporto (€)"
                aiuto="Si ripartiscono sulle righe qui sopra in proporzione al valore e finiscono nel costo di carico degli articoli: è la ragione per cui il margine, poi, è vero."
              >
                <Testo
                  className="tabular text-right"
                  inputMode="decimal"
                  valore={form.trasporto}
                  onCambia={(v) => aggiorna({ trasporto: v })}
                  placeholder="0,00"
                />
              </Campo>

              <dl className="space-y-2 self-end rounded-lg bg-tint/30 px-4 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-soft">Imponibile delle righe che entrano</dt>
                  <dd className="tabular font-medium text-ink">
                    {formatEuro(costoPartita - trasportoCents)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-soft">Trasporto ripartito</dt>
                  <dd className="tabular font-medium text-ink">{formatEuro(trasportoCents)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                  <dt className="font-semibold text-ink">Costo della partita</dt>
                  <dd className="tabular font-semibold text-brand-strong">
                    {formatEuro(costoPartita)}
                  </dd>
                </div>
              </dl>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink-mute">
              La ricezione non torna indietro: genera i movimenti di carico e la partita nasce
              disponibile. Diventerà esaurita da sola quando di quello che è entrato non resterà
              più niente.
            </p>
          </Card>
        </div>
      </>
    )
  }

  // ============================================================== ordine
  const azioni: AzionePagina[] = soloLettura
    ? []
    : [
        {
          chiave: 'salva',
          etichetta: 'Salva',
          icona: Save,
          tono: 'secondario',
          onClick: salva,
          inCorso,
        },
        {
          chiave: 'ricezione',
          etichetta: 'Registra ricezione',
          etichettaBreve: 'Ricezione',
          icona: PackageCheck,
          tono: 'primario',
          onClick: apriRicezione,
          disabilitata: inCorso || Boolean(motivoRicezioneBloccata),
          motivo: motivoRicezioneBloccata,
        },
      ]

  return (
    <>
      <IntestazionePagina
        titolo={`Ordine di acquisto ${acquisto.numero}`}
        indietro={{ a: '/acquisti', label: 'Tutti gli ordini di acquisto' }}
        sottotitolo={
          <span className="inline-flex flex-wrap items-center gap-2">
            {acquisto.fornitore_nome}
            <StatoBadge
              etichetta={STATO_ACQUISTO_LABEL[acquisto.stato]}
              tono={TONO_ACQUISTO[acquisto.stato]}
            />
          </span>
        }
        azioni={azioni.length ? <BarraAzioni azioni={azioni} /> : undefined}
      />

      <AvvisoErrore messaggio={erroreAzione} />

      {lottoCreato && (
        <EsitoRicezione
          lotto={lottoCreato}
          righe={acquisto.righe.filter((r) => r.lotto_id === lottoCreato.id)}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* ------------------------------------------------------- testata */}
          <Card titolo="Testata">
            {soloLettura ? (
              <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Dato etichetta="Fornitore">{acquisto.fornitore_nome}</Dato>
                <Dato etichetta="Data">
                  <span className="tabular">{formatData(acquisto.data)}</span>
                </Dato>
                <Dato etichetta="Consegna prevista">
                  <span className="tabular">{formatData(acquisto.data_consegna_prevista)}</span>
                </Dato>
                <Dato etichetta="Spese di trasporto">
                  <span className="tabular">{formatEuro(acquisto.spese_trasporto_cents)}</span>
                </Dato>
                <Dato etichetta="Data di ricezione">
                  <span className="tabular">{formatData(acquisto.data_ricezione)}</span>
                </Dato>
                <div className="md:col-span-3">
                  <Dato etichetta="Note">{acquisto.note || '—'}</Dato>
                </div>
              </dl>
            ) : (
              <div className="space-y-4">
                <GrigliaCampi colonne={3}>
                  <Campo etichetta="Fornitore" obbligatorio>
                    <SelettoreFornitore
                      valore={fornitori.find((f) => f.id === form.fornitore_id) ?? null}
                      onScegli={(f) => aggiorna({ fornitore_id: f?.id ?? '' })}
                    />
                  </Campo>
                  <Campo etichetta="Data" obbligatorio>
                    <Testo type="date" valore={form.data} onCambia={(v) => aggiorna({ data: v })} />
                  </Campo>
                  <Campo etichetta="Consegna prevista">
                    <Testo
                      type="date"
                      valore={form.data_consegna_prevista}
                      onCambia={(v) => aggiorna({ data_consegna_prevista: v })}
                    />
                  </Campo>
                </GrigliaCampi>

                <GrigliaCampi>
                  <Campo
                    etichetta="Spese di trasporto (€)"
                    aiuto="Si ripartiscono sulle righe in proporzione al valore e finiscono nel costo di carico degli articoli."
                  >
                    <Testo
                      className="tabular text-right"
                      inputMode="decimal"
                      valore={form.trasporto}
                      onCambia={(v) => aggiorna({ trasporto: v })}
                      placeholder="0,00"
                    />
                  </Campo>
                  <Campo etichetta="Note">
                    <AreaTesto righe={2} valore={form.note} onCambia={(v) => aggiorna({ note: v })} />
                  </Campo>
                </GrigliaCampi>
              </div>
            )}
          </Card>

          {/* --------------------------------------------------------- righe */}
          <Card titolo="Righe della fornitura">
            {!soloLettura && (
              <div className="mb-4">
                <AggiungiArticolo
                  ref={ricerca}
                  onAggiungi={aggiungiArticolo}
                  soloAttivi={false}
                  segnaposto="Aggiungi un articolo: codice o nome, poi Invio…"
                />
              </div>
            )}
            {righeModificabili()}
          </Card>

          {lottiGenerati.length > 0 && (
            <Card titolo="Partite generate">
              <ul className="space-y-2 text-sm">
                {lottiGenerati.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-baseline gap-2">
                    <Link
                      to={`/lotti/${l.id}`}
                      className="tabular font-semibold text-brand-strong hover:underline"
                    >
                      {l.codice}
                    </Link>
                    <span className="text-ink-soft">{l.descrizione}</span>
                    <span className="tabular text-xs text-ink-mute">
                      {formatData(l.data_acquisto)} · {formatEuro(l.costo_acquisto_cents)} (trasporto
                      compreso)
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-ink-mute">
                Da qui si arriva alla scheda della partita: cosa è entrato, cosa ne resta e a quali
                clienti è andato.
              </p>
            </Card>
          )}
        </div>

        {/* --------------------------------------------------------- totali */}
        <div className="space-y-4">
          <Card titolo="Totali">
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-ink-soft">Righe</dt>
                <dd className="tabular text-sm font-medium text-ink">{form.righe.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-ink-soft">Imponibile righe</dt>
                <dd className="tabular text-sm font-medium text-ink">
                  {formatEuro(totaliRighe.imponibile_cents)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 rounded-lg bg-tint/30 px-3 py-2">
                <dt className="text-sm font-semibold text-ink">Spese di trasporto</dt>
                <dd className="tabular text-sm font-semibold text-ink">
                  {formatEuro(trasportoCents)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-ink-soft">Imponibile totale</dt>
                <dd className="tabular text-sm font-medium text-ink">{formatEuro(imponibile)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-sm text-ink-soft">IVA</dt>
                <dd className="tabular text-sm font-medium text-ink">{formatEuro(iva)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                <dt className="text-sm font-semibold text-ink">Totale</dt>
                <dd className="tabular text-lg font-semibold text-brand-strong">
                  {formatEuro(imponibile + iva)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-ink-mute">
              Il trasporto è imponibile a tutti gli effetti e si ripartisce sulle righe in
              proporzione al valore: finisce nel costo di carico degli articoli, quindi nel costo
              medio, quindi nel margine. Se restasse fuori, ogni articolo sembrerebbe più
              redditizio di quanto è.
            </p>
          </Card>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Che cosa è entrato
// ---------------------------------------------------------------------------

/**
 * Non un messaggio che sparisce: la partita appena nata con dentro gli
 * articoli caricati, ognuno con la sua quantità, e i link per andarci.
 */
function EsitoRicezione({
  lotto,
  righe,
}: {
  lotto: Lotto
  righe: OrdineAcquisto['righe']
}) {
  return (
    <div className="mb-4 rounded-card border border-ok/30 bg-ok/8 px-5 py-4">
      <p className="font-display text-base text-ink">La merce è entrata a magazzino</p>
      <Link
        to={`/lotti/${lotto.id}`}
        className="tabular mt-1 inline-flex items-center gap-1.5 font-semibold text-brand-strong hover:underline"
      >
        <Warehouse size={15} />
        {lotto.codice}
        <ExternalLink size={14} />
      </Link>
      <p className="mt-0.5 text-sm text-ink-soft">
        {lotto.descrizione} · {formatEuro(lotto.costo_acquisto_cents)} trasporto ripartito compreso.
      </p>

      <ul className="mt-3 divide-y divide-line/70 border-t border-line/70">
        {righe.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
            <Link
              to={`/articoli?q=${encodeURIComponent(r.codice_articolo ?? r.descrizione)}`}
              className="min-w-0 flex-1 text-sm text-ink hover:underline"
            >
              {r.codice_articolo && (
                <span className="tabular mr-1.5 text-ink-mute">{r.codice_articolo}</span>
              )}
              {r.descrizione}
            </Link>
            <span className="tabular text-sm font-semibold text-ink">
              {formatQuantita(r.quantita_milli, r.unita_misura)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
