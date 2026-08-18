import {
  ChevronDown,
  ExternalLink,
  PackageCheck,
  PackagePlus,
  Save,
  Trash2,
  Warehouse,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Scelta, Testo } from '../components/Campi'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import IntestazionePagina from '../components/IntestazionePagina'
import { AggiungiArticolo } from '../components/SelettoreArticolo'
import { SelettoreFornitore } from '../components/SelettoreAnagrafica'
import type { ManiglieSelettore } from '../components/SelettoreRicerca'
import { Card } from '../components/Ui'
import { notificaDatiCambiati } from '../components/eventiDati'
import {
  ESSENZA_LABEL,
  PATINA_LABEL,
  QUALITA_LABEL,
  type Articolo,
  type Essenza,
  type FornitoreConTotali,
  type ID,
  type Lotto,
  type OrdineAcquisto,
  type Patina,
  type Qualita,
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
import { inputAMilli } from '../lib/qty'
import { messaggioDi } from '../useFetch'

/* ==========================================================================
   CARICARE LA MERCE CHE ARRIVA — una schermata sola.

   È la schermata del piazzale: il camion ha scaricato, il DDT del fornitore è
   in mano e l'ordine di acquisto, spesso, non è mai stato scritto. Prima
   costava quattro viste — lista, modale fornitore, dettaglio vuoto, modale di
   ricezione — e tredici passaggi. Qui il fornitore, la merce e la provenienza
   stanno insieme, e un solo comando concatena le due chiamate che esistono
   già: `creaAcquisto` con le righe dentro, poi `ricevalAcquisto`.

   L'interruttore «Merce già arrivata» distingue i due casi veri del mestiere:
   acceso è il piazzale (nasce la partita, la merce entra a magazzino), spento
   è l'ufficio che ordina e aspetta (l'ordine resta in bozza e si riceverà più
   avanti dal suo dettaglio, come si è sempre fatto).

   Sotto `md:` si lavora un passo per volta: chi porta la merce, che cosa è
   arrivato, da dove viene. Da `md:` in su i tre blocchi sono aperti insieme,
   perché su un monitor nascondere due terzi della schermata è solo un clic in
   più.
   ========================================================================== */

interface RigaNuova {
  id: ID
  articolo: Articolo
  descrizione: string
  quantita: string
  prezzo: string
}

/** Ciò che è entrato davvero: si mostra dopo, con i link per andarci. */
interface Esito {
  acquisto: OrdineAcquisto
  lotto: Lotto
  caricati: Array<{
    codice: string | null
    descrizione: string
    quantita_milli: number
    unita_misura: RigaNuova['articolo']['unita_misura']
    costo_cents: number
  }>
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

// ===========================================================================

export default function AcquistoNuovoPage() {
  /*
   * «Carica un'altra fornitura» rimonta il modulo con una chiave nuova invece
   * di azzerare quindici campi a mano: in piazzale se ne caricano tre di fila,
   * e una schermata che si ricorda la fornitura precedente è un errore che
   * aspetta di succedere.
   */
  const [sessione, setSessione] = useState(0)
  return <ModuloCarico key={sessione} onAltra={() => setSessione((s) => s + 1)} />
}

function ModuloCarico({ onAltra }: { onAltra: () => void }) {
  const navigate = useNavigate()
  const ricerca = useRef<ManiglieSelettore>(null)
  // `?arrivata=0` apre la stessa schermata nel caso dell'ufficio che ordina e
  // aspetta. È una querystring e non uno stato del router perché il link deve
  // restare condivisibile, come tutte le rotte di questo pannello.
  const [parametri] = useSearchParams()

  // ---------------------------------------------------------------- stato
  const [passo, setPasso] = useState<1 | 2 | 3>(1)
  const [merceArrivata, setMerceArrivata] = useState(parametri.get('arrivata') !== '0')

  const [fornitore, setFornitore] = useState<FornitoreConTotali | null>(null)
  const [data, setData] = useState(oggiISO())
  const [dataRicezione, setDataRicezione] = useState(oggiISO())

  const [righe, setRighe] = useState<RigaNuova[]>([])
  const [fuocoRiga, setFuocoRiga] = useState<ID | null>(null)
  const [trasporto, setTrasporto] = useState('')

  // Della partita si tiene solo ciò che l'operatore ha davvero scritto: il
  // resto è una proposta viva, che segue il fornitore e il primo articolo
  // finché nessuno la contraddice.
  const [descrizioneScritta, setDescrizioneScritta] = useState<string | null>(null)
  const [essenzaScelta, setEssenzaScelta] = useState<Essenza | null>(null)
  const [patinaScelta, setPatinaScelta] = useState<Patina | null>(null)
  const [qualita, setQualita] = useState<Qualita>('B')
  const [edificio, setEdificio] = useState('')
  const [localita, setLocalita] = useState('')
  const [provincia, setProvincia] = useState('')
  const [anno, setAnno] = useState('')
  const [ubicazione, setUbicazione] = useState('')
  const [noteStoriche, setNoteStoriche] = useState('')

  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  /** L'ordine è nato ma la ricezione è fallita: non si può fingere di no. */
  const [ordineOrfano, setOrdineOrfano] = useState<OrdineAcquisto | null>(null)
  const [esito, setEsito] = useState<Esito | null>(null)

  // --------------------------------------------------------------- calcoli
  const primo = righe[0]?.articolo
  const descrizionePartita =
    descrizioneScritta ??
    (fornitore ? `Fornitura ${fornitore.ragione_sociale} del ${formatData(data)}` : '')
  const essenza = essenzaScelta ?? primo?.essenza ?? 'abete'
  const patina = patinaScelta ?? primo?.patina ?? 'naturale'

  const calcolate = useMemo(
    () =>
      righe.map((r) => ({
        imponibile_cents: imponibileRiga(inputAMilli(r.quantita), euroACents(r.prezzo), 0),
        aliquota_iva: r.articolo.aliquota_iva,
      })),
    [righe],
  )
  const totali = totaliDocumento(calcolate, 0)
  const trasportoCents = euroACents(trasporto)
  // Le quote sono le stesse che calcolerà `ricevalAcquisto`: mostrarle qui non
  // è un vezzo, è il motivo per cui dopo il margine è vero.
  const quote = ripartisci(trasportoCents, calcolate.map((c) => c.imponibile_cents))
  const costoPartita = totali.imponibile_cents + trasportoCents
  const aliquotaTrasporto = righe[0]?.articolo.aliquota_iva ?? 22
  const iva = totali.iva_cents + Math.round((trasportoCents * aliquotaTrasporto) / 100)

  const motivo = !fornitore
    ? 'Scegli il fornitore: senza, non si sa da chi arriva la merce.'
    : !righe.length
      ? 'Aggiungi almeno un articolo: è quello che entra a magazzino.'
      : righe.some((r) => inputAMilli(r.quantita) <= 0)
        ? 'Una riga ha quantità zero: scrivi quanto ne è arrivato o toglila.'
        : undefined

  // ---------------------------------------------------------------- azioni
  const aggiungiArticolo = (a: Articolo) => {
    const id = nuovoId()
    setRighe((precedenti) => [
      ...precedenti,
      {
        id,
        articolo: a,
        descrizione: a.nome,
        // L'ultimo prezzo pagato è la proposta migliore che il gestionale
        // abbia: il fornitore può quotare diversamente, e resta modificabile.
        prezzo: centsAInput(a.prezzo_acquisto_cents),
        quantita: '',
      },
    ])
    setFuocoRiga(id)
  }

  const aggiornaRiga = (id: ID, patch: Partial<RigaNuova>) =>
    setRighe((precedenti) => precedenti.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  /*
   * Il fuoco sulla quantità della riga appena aggiunta.
   *
   * `autoFocus` da solo NON basta, e la differenza si vede in piazzale:
   * `AggiungiArticolo`, dopo la scelta, si riprende il fuoco dentro un
   * `requestAnimationFrame` — è il suo contratto, il campo si svuota e resta
   * pronto per l'articolo successivo. Quel rAF viene registrato mentre gira il
   * gestore dell'Invio, cioè PRIMA che React monti la riga, e quindi scatta
   * dopo `autoFocus` e se lo riprende. Risultato: l'operatore digitava «120»
   * dentro la ricerca articolo, la riga restava a quantità zero e «Carica la
   * merce» non si accendeva mai — senza che niente spiegasse perché.
   *
   * Registrando il nostro rAF da un effetto, che gira al commit e quindi DOPO
   * quel gestore, finiamo secondi nella coda dello stesso frame e il fuoco
   * arriva dove deve. `Testo` non inoltra i ref, da qui l'id.
   *
   * La correzione giusta starebbe in `AggiungiArticolo` (una prop per non
   * trattenere il fuoco): finché non c'è, la stessa cura sta anche nella
   * ricezione di AcquistoDettaglioPage.
   */
  useEffect(() => {
    if (!fuocoRiga) return
    const riga = fuocoRiga
    const frame = requestAnimationFrame(() => {
      const campo = document.getElementById(`qta-${riga}`)
      if (campo instanceof HTMLInputElement) {
        campo.focus()
        campo.select()
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [fuocoRiga])

  const scegliFornitore = (f: FornitoreConTotali | null) => {
    setFornitore(f)
    if (!f) return
    // Sul telefono il passo successivo si apre da solo e il fuoco ci va
    // dentro: il fuoco su un blocco chiuso non arriverebbe da nessuna parte.
    setPasso(2)
    setTimeout(() => ricerca.current?.focus(), 0)
  }

  async function conferma() {
    if (!fornitore || motivo) return
    setInCorso(true)
    setErrore(null)
    setOrdineOrfano(null)

    const righeAcquisto = righe.map((r) => ({
      id: nuovoId(),
      articolo_id: r.articolo.id,
      codice_articolo: r.articolo.codice,
      descrizione: r.descrizione.trim() || r.articolo.nome,
      quantita_milli: inputAMilli(r.quantita),
      unita_misura: r.articolo.unita_misura,
      prezzo_unitario_cents: euroACents(r.prezzo),
      aliquota_iva: r.articolo.aliquota_iva,
      imponibile_cents: imponibileRiga(inputAMilli(r.quantita), euroACents(r.prezzo), 0),
      lotto_id: null,
      note: null,
    }))

    let acquisto: OrdineAcquisto
    try {
      acquisto = await api.creaAcquisto({
        data,
        fornitore_id: fornitore.id,
        fornitore_nome: fornitore.ragione_sociale,
        righe: righeAcquisto,
        spese_trasporto_cents: trasportoCents,
        data_consegna_prevista: null,
        data_ricezione: null,
        // Se la merce è in cortile l'ordine non è più una promessa: nasce
        // confermato e un istante dopo diventa ricevuto.
        stato: merceArrivata ? 'confermato' : 'bozza',
        note: null,
      })
    } catch (e) {
      setErrore(messaggioDi(e))
      setInCorso(false)
      return
    }

    if (!merceArrivata) {
      notificaDatiCambiati()
      navigate(`/acquisti/${acquisto.id}`)
      return
    }

    try {
      const ricevuto = await api.ricevalAcquisto(acquisto.id, {
        data_ricezione: dataRicezione,
        lotto: {
          descrizione: descrizionePartita.trim() || undefined,
          provenienza_edificio: edificio.trim() || null,
          provenienza_localita: localita.trim() || null,
          provenienza_provincia: provincia.trim().toUpperCase() || null,
          anno_costruzione_stimato: Number(anno) || null,
          essenza,
          patina,
          qualita,
          ubicazione: ubicazione.trim() || null,
          note_storiche: noteStoriche.trim() || null,
        },
      })
      notificaDatiCambiati()
      setEsito({
        acquisto: ricevuto.acquisto,
        lotto: ricevuto.lotto,
        caricati: righe.map((r, i) => ({
          codice: r.articolo.codice,
          descrizione: r.descrizione.trim() || r.articolo.nome,
          quantita_milli: inputAMilli(r.quantita),
          unita_misura: r.articolo.unita_misura,
          costo_cents: calcolate[i].imponibile_cents + quote[i],
        })),
      })
    } catch (e) {
      // L'ordine esiste già: lasciar credere che non sia successo niente
      // significherebbe farlo riscrivere da capo e ritrovarselo doppio.
      setOrdineOrfano(acquisto)
      setErrore(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  // ---------------------------------------------------------------- render
  if (esito) return <SchermataEsito esito={esito} onAltra={onAltra} />

  const azioni: AzionePagina[] = [
    {
      chiave: 'annulla',
      etichetta: 'Annulla',
      a: '/acquisti',
      tono: 'secondario',
    },
    {
      chiave: 'conferma',
      etichetta: merceArrivata ? 'Carica la merce' : 'Salva l’ordine',
      etichettaBreve: merceArrivata ? 'Carica' : 'Salva',
      icona: merceArrivata ? PackageCheck : Save,
      tono: 'primario',
      onClick: conferma,
      inCorso,
      disabilitata: Boolean(motivo),
      motivo,
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo={merceArrivata ? 'Carica la merce arrivata' : 'Nuovo ordine di acquisto'}
        indietro={{ a: '/acquisti', label: 'Ordini di acquisto' }}
        sottotitolo="Fornitore, articoli e provenienza in una schermata sola: alla conferma nasce la partita e la merce entra a magazzino."
        azioni={<BarraAzioni azioni={azioni} />}
      />

      <AvvisoErrore messaggio={errore} />

      {ordineOrfano && (
        <div className="mb-4 rounded-card border border-warn/30 bg-warn/8 px-5 py-4">
          <p className="text-sm text-ink">
            L’ordine <span className="tabular font-semibold">{ordineOrfano.numero}</span> è stato
            creato, ma la merce non è entrata a magazzino. Non riscriverlo: aprilo e registra la
            ricezione da lì.
          </p>
          <Link to={`/acquisti/${ordineOrfano.id}`} className="btn-secondary mt-3">
            Apri {ordineOrfano.numero}
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {/* ---------------------------------------------------------- 1 */}
        <Passo
          numero={1}
          titolo="Chi porta la merce"
          sottotitolo="Tre lettere del fornitore, poi Invio."
          riassunto={fornitore ? `${fornitore.ragione_sociale} · ${formatData(data)}` : 'Da scegliere'}
          aperto={passo === 1}
          onApri={() => setPasso(1)}
        >
          <div className="space-y-4">
            <Campo etichetta="Fornitore" obbligatorio>
              <SelettoreFornitore
                valore={fornitore}
                onScegli={scegliFornitore}
                autoFocus
                segnaposto="Segheria, recuperante, demolitore…"
              />
            </Campo>

            <GrigliaCampi colonne={merceArrivata ? 2 : 1}>
              <Campo etichetta="Data del documento" obbligatorio>
                <Testo type="date" valore={data} onCambia={setData} />
              </Campo>
              {merceArrivata && (
                <Campo etichetta="Data di arrivo" obbligatorio>
                  <Testo type="date" valore={dataRicezione} onCambia={setDataRicezione} />
                </Campo>
              )}
            </GrigliaCampi>

            <Interruttore
              acceso={merceArrivata}
              onCambia={setMerceArrivata}
              etichetta="Merce già arrivata"
              descrizione={
                merceArrivata
                  ? 'Il camion ha scaricato: alla conferma nasce la partita e le giacenze si muovono.'
                  : 'Ordine da inviare al fornitore: resta in bozza, la riceverai quando arriva.'
              }
            />
          </div>
        </Passo>

        {/* ---------------------------------------------------------- 2 */}
        <Passo
          numero={2}
          titolo="Che cosa è arrivato"
          sottotitolo="Invio aggiunge la riga e porta il fuoco sulla quantità; Invio nella quantità torna alla ricerca."
          riassunto={
            righe.length
              ? `${righe.length} ${righe.length === 1 ? 'articolo' : 'articoli'} · ${formatEuro(costoPartita)}`
              : 'Nessun articolo'
          }
          aperto={passo === 2}
          onApri={() => setPasso(2)}
        >
          <div className="space-y-4">
            <AggiungiArticolo
              ref={ricerca}
              onAggiungi={aggiungiArticolo}
              soloAttivi={false}
              segnaposto="Cerca l’articolo: codice o nome, poi Invio…"
            />

            {righe.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-mute">
                Nessun articolo. Ogni riga carica il proprio articolo a magazzino con la partita di
                questa fornitura: senza articolo la merce non entra.
              </p>
            ) : (
              <>
                {/* Intestazione della griglia densa: solo da md: in su, dove
                    le righe sono righe. Sul telefono ogni riga è una card e le
                    etichette stanno dentro. */}
                <div className="hidden gap-3 px-1 md:grid md:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem_2.75rem]">
                  <span className="label">Articolo</span>
                  <span className="label text-right">Quantità</span>
                  <span className="label text-right">Prezzo</span>
                  <span className="label text-right">Costo di carico</span>
                  <span className="sr-only">Azioni</span>
                </div>

                <ul className="space-y-3 md:space-y-0">
                  {righe.map((r, i) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-line px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_7rem_8rem_8rem_2.75rem] md:items-center md:gap-3 md:rounded-none md:border-0 md:border-b md:border-line/60 md:px-1 md:py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          <span className="tabular mr-1.5 text-ink-mute">{r.articolo.codice}</span>
                          {r.articolo.nome}
                        </p>
                        <input
                          className="input mt-2 text-sm md:mt-1 md:min-h-0 md:border-0 md:px-0 md:py-0 md:text-xs md:text-ink-mute"
                          value={r.descrizione}
                          onChange={(e) => aggiornaRiga(r.id, { descrizione: e.target.value })}
                          aria-label={`Descrizione della riga ${i + 1}`}
                          placeholder="Descrizione sul documento"
                        />
                      </div>

                      <div className="mt-3 md:mt-0">
                        <span className="label mb-1 md:hidden">
                          Quantità ({SIMBOLO_UM[r.articolo.unita_misura]})
                        </span>
                        <Testo
                          className="tabular text-right"
                          inputMode="decimal"
                          valore={r.quantita}
                          onCambia={(v) => aggiornaRiga(r.id, { quantita: v })}
                          placeholder="0"
                          id={`qta-${r.id}`}
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
                          Prezzo (€/{SIMBOLO_UM[r.articolo.unita_misura]})
                        </span>
                        <Testo
                          className="tabular text-right"
                          inputMode="decimal"
                          valore={r.prezzo}
                          onCambia={(v) => aggiornaRiga(r.id, { prezzo: v })}
                          placeholder="0,00"
                          aria-label={`Prezzo della riga ${i + 1}`}
                        />
                      </div>

                      <div className="mt-3 flex items-baseline justify-between gap-2 md:mt-0 md:block md:text-right">
                        <span className="label md:hidden">Costo di carico</span>
                        <span className="tabular text-sm font-semibold text-ink">
                          {formatEuro(calcolate[i].imponibile_cents + quote[i])}
                        </span>
                        {quote[i] > 0 && (
                          <span className="tabular block text-xs text-ink-mute">
                            {formatEuro(quote[i])} di trasporto
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex justify-end md:mt-0">
                        <button
                          type="button"
                          className="btn-icona btn-ghost"
                          onClick={() => setRighe((p) => p.filter((x) => x.id !== r.id))}
                          aria-label={`Togli ${r.articolo.nome}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="grid grid-cols-1 gap-4 border-t border-line pt-4 md:grid-cols-2">
              <Campo
                etichetta="Spese di trasporto (€)"
                aiuto="Si ripartiscono sulle righe in proporzione al valore e finiscono nel costo di carico: è la ragione per cui il margine, poi, è vero."
              >
                <Testo
                  className="tabular text-right"
                  inputMode="decimal"
                  valore={trasporto}
                  onCambia={setTrasporto}
                  placeholder="0,00"
                />
              </Campo>

              <dl className="space-y-2 self-end rounded-lg bg-tint/30 px-4 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-soft">Imponibile righe</dt>
                  <dd className="tabular font-medium text-ink">
                    {formatEuro(totali.imponibile_cents)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-soft">Trasporto</dt>
                  <dd className="tabular font-medium text-ink">{formatEuro(trasportoCents)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
                  <dt className="font-semibold text-ink">Costo della partita</dt>
                  <dd className="tabular font-semibold text-brand-strong">
                    {formatEuro(costoPartita)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-mute">IVA</dt>
                  <dd className="tabular text-ink-mute">{formatEuro(iva)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </Passo>

        {/* ---------------------------------------------------------- 3 */}
        {merceArrivata && (
          <Passo
            numero={3}
            titolo="Da dove viene"
            sottotitolo="Un blocco solo per tutta la fornitura: la provenienza è della partita, non della singola riga."
            riassunto={
              [edificio, [localita, provincia && `(${provincia})`].filter(Boolean).join(' ')]
                .filter(Boolean)
                .join(' — ') || 'Facoltativa, ma è ciò che il cliente compra'
            }
            aperto={passo === 3}
            onApri={() => setPasso(3)}
          >
            <div className="space-y-4">
              <p className="rounded-lg bg-tint/30 px-3 py-2 text-sm leading-relaxed text-ink-soft">
                Tavole, perlinato e travi scese dallo stesso fienile sono <strong>una partita
                sola</strong>. Fra cinque anni il cliente che chiede da dove viene il suo pavimento
                trova la risposta qui: è il momento giusto per scriverla.
              </p>

              <Campo etichetta="Descrizione della partita" obbligatorio>
                <Testo
                  valore={descrizionePartita}
                  onCambia={setDescrizioneScritta}
                  placeholder="Fienile di Cordignano — tavolame e travi"
                />
              </Campo>

              <GrigliaCampi colonne={2}>
                <Campo etichetta="Edificio di provenienza">
                  <Testo
                    valore={edificio}
                    onCambia={setEdificio}
                    placeholder="Fienile ottocentesco con stalla"
                  />
                </Campo>
                <Campo etichetta="Ubicazione in magazzino">
                  <Testo
                    valore={ubicazione}
                    onCambia={setUbicazione}
                    placeholder="Capannone A — campata 3"
                  />
                </Campo>
              </GrigliaCampi>

              <GrigliaCampi colonne={3}>
                <Campo etichetta="Località">
                  <Testo valore={localita} onCambia={setLocalita} placeholder="Cordignano" />
                </Campo>
                <Campo etichetta="Provincia">
                  <Testo
                    valore={provincia}
                    onCambia={setProvincia}
                    maxLength={2}
                    placeholder="TV"
                  />
                </Campo>
                <Campo etichetta="Anno di costruzione stimato">
                  <Testo
                    className="tabular"
                    inputMode="numeric"
                    valore={anno}
                    onCambia={setAnno}
                    placeholder="1890"
                  />
                </Campo>
              </GrigliaCampi>

              <GrigliaCampi colonne={3}>
                <Campo
                  etichetta="Essenza"
                  obbligatorio
                  aiuto={primo && !essenzaScelta ? `Proposta dal primo articolo.` : undefined}
                >
                  <Scelta<Essenza>
                    valore={essenza}
                    onCambia={setEssenzaScelta}
                    opzioni={OPZIONI_ESSENZA}
                  />
                </Campo>
                <Campo etichetta="Patina" obbligatorio>
                  <Scelta<Patina>
                    valore={patina}
                    onCambia={setPatinaScelta}
                    opzioni={OPZIONI_PATINA}
                  />
                </Campo>
                <Campo etichetta="Qualità" obbligatorio>
                  <Scelta<Qualita>
                    valore={qualita}
                    onCambia={setQualita}
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
                  valore={noteStoriche}
                  onCambia={setNoteStoriche}
                  placeholder="Fienile costruito attorno al 1890, tavolame esposto a sud…"
                />
              </Campo>
            </div>
          </Passo>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pezzi locali
// ---------------------------------------------------------------------------

/**
 * Blocco della schermata. Sotto `md:` se ne tiene aperto uno per volta — in
 * piazzale, con una mano occupata, un modulo lungo dieci schermate non si
 * compila. Da `md:` in su sono aperti tutti: nascondere due terzi di un
 * monitor sarebbe solo un clic in più.
 */
function Passo({
  numero,
  titolo,
  sottotitolo,
  riassunto,
  aperto,
  onApri,
  children,
}: {
  numero: number
  titolo: string
  sottotitolo: string
  riassunto: ReactNode
  aperto: boolean
  onApri: () => void
  children: ReactNode
}) {
  return (
    <section className="card">
      <button
        type="button"
        onClick={onApri}
        aria-expanded={aperto}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left md:cursor-default"
      >
        <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint/60 text-sm font-semibold text-brand-strong">
          {numero}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base text-ink">{titolo}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-mute">
            <span className="md:hidden">{aperto ? sottotitolo : riassunto}</span>
            <span className="hidden md:inline">{sottotitolo}</span>
          </span>
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-ink-mute transition-transform md:hidden ${aperto ? 'rotate-180' : ''}`}
        />
      </button>
      <div className={`border-t border-line px-5 py-4 ${aperto ? '' : 'hidden md:block'}`}>
        {children}
      </div>
    </section>
  )
}

/** Interruttore a due stati, bersaglio pieno: si preme con il pollice. */
function Interruttore({
  acceso,
  onCambia,
  etichetta,
  descrizione,
}: {
  acceso: boolean
  onCambia: (v: boolean) => void
  etichetta: string
  descrizione: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acceso}
      onClick={() => onCambia(!acceso)}
      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
        acceso ? 'border-brand bg-tint/40' : 'border-line bg-surface'
      }`}
    >
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          acceso ? 'bg-brand-strong' : 'bg-line'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-surface shadow-card transition-transform ${
            acceso ? 'translate-x-5' : ''
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{etichetta}</span>
        <span className="mt-0.5 block text-xs text-ink-mute">{descrizione}</span>
      </span>
    </button>
  )
}

/**
 * Che cosa è entrato davvero. Non è una conferma che sparisce: è la partita
 * appena nata con dentro gli articoli caricati, ognuno con il suo costo di
 * carico — trasporto ripartito compreso — e i link per andarci.
 */
function SchermataEsito({ esito, onAltra }: { esito: Esito; onAltra: () => void }) {
  const { acquisto, lotto, caricati } = esito
  return (
    <>
      <IntestazionePagina
        titolo="La merce è entrata a magazzino"
        indietro={{ a: '/acquisti', label: 'Ordini di acquisto' }}
        sottotitolo={`Ordine ${acquisto.numero} · ${acquisto.fornitore_nome} · ricevuto il ${formatData(acquisto.data_ricezione)}`}
        azioni={
          <BarraAzioni
            azioni={[
              {
                chiave: 'altra',
                etichetta: 'Carica un’altra fornitura',
                etichettaBreve: 'Altra',
                icona: PackagePlus,
                tono: 'secondario',
                onClick: onAltra,
              },
              {
                chiave: 'partita',
                etichetta: `Apri la partita ${lotto.codice}`,
                etichettaBreve: 'Apri la partita',
                icona: Warehouse,
                tono: 'primario',
                a: `/lotti/${lotto.id}`,
              },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card titolo="La partita" className="lg:col-span-1">
          <Link
            to={`/lotti/${lotto.id}`}
            className="tabular inline-flex items-center gap-1.5 text-lg font-semibold text-brand-strong hover:underline"
          >
            {lotto.codice}
            <ExternalLink size={15} />
          </Link>
          <p className="mt-1 text-sm text-ink">{lotto.descrizione}</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Provenienza</dt>
              <dd className="text-right text-ink">
                {[
                  lotto.provenienza_edificio,
                  [lotto.provenienza_localita, lotto.provenienza_provincia && `(${lotto.provenienza_provincia})`]
                    .filter(Boolean)
                    .join(' '),
                ]
                  .filter(Boolean)
                  .join(' — ') || 'non registrata'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Ubicazione</dt>
              <dd className="text-right text-ink">{lotto.ubicazione ?? '—'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
              <dt className="font-semibold text-ink">Costo della partita</dt>
              <dd className="tabular font-semibold text-ink">
                {formatEuro(lotto.costo_acquisto_cents)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-ink-mute">
            Trasporto ripartito compreso: è il numero che entra nel costo medio degli articoli, e
            quindi nel margine.
          </p>
        </Card>

        <Card titolo="Gli articoli caricati" className="lg:col-span-2">
          <ul className="divide-y divide-line">
            {caricati.map((c, i) => (
              <li
                key={`${c.codice}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <Link
                  to={`/articoli?q=${encodeURIComponent(c.codice ?? c.descrizione)}`}
                  className="min-w-0 flex-1 text-sm text-ink hover:underline"
                >
                  {c.codice && <span className="tabular mr-1.5 text-ink-mute">{c.codice}</span>}
                  {c.descrizione}
                </Link>
                <span className="text-right">
                  <span className="tabular block text-sm font-semibold text-ink">
                    {formatQuantita(c.quantita_milli, c.unita_misura)}
                  </span>
                  <span className="tabular block text-xs text-ink-mute">
                    {formatEuro(c.costo_cents)} di carico
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-mute">
            Ogni articolo è entrato con un movimento di carico che porta dentro la partita: da qui
            in avanti si sa da dove viene. Il libro giornale è in{' '}
            <Link to="/movimenti" className="text-brand-strong hover:underline">
              Movimenti
            </Link>
            , l’ordine è{' '}
            <Link to={`/acquisti/${acquisto.id}`} className="tabular text-brand-strong hover:underline">
              {acquisto.numero}
            </Link>
            .
          </p>
        </Card>
      </div>
    </>
  )
}
