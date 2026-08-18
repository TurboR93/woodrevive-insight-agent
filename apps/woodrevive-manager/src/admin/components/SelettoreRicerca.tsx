import { Loader2, Search, X } from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Motore dei selettori con ricerca: si digita, si vedono i risultati, Invio
 * sceglie. Non si usa direttamente nelle pagine — sopra ci stanno
 * `SelettoreArticolo`, `SelettoreCliente` e `SelettoreFornitore`, che sanno
 * cosa cercare e cosa mostrare in ogni voce.
 *
 * Sostituisce le `<select>` native con l'intera anagrafica dentro: con
 * duecento clienti e trecento articoli, scegliere da una tendina significa
 * scorrere: qui bastano tre lettere.
 *
 * Tastiera, che è il punto di tutto:
 *   ↓ ↑      muovono l'evidenziazione (↓ apre l'elenco se è chiuso)
 *   Invio    sceglie la voce evidenziata
 *   Esc      chiude l'elenco; se è già chiuso, toglie la scelta
 *   Tab      chiude e passa al campo dopo
 *
 * Con `mantieniFuoco` il campo si svuota e resta a fuoco dopo la scelta: è il
 * ciclo che permette di incolonnare dieci righe di preventivo senza toccare il
 * mouse.
 */

/** Comandi che il chiamante può dare al selettore tenendone un `ref`. */
export interface ManiglieSelettore {
  /** Porta il fuoco nel campo di ricerca (e ne seleziona il contenuto). */
  focus: () => void
  /** Svuota il testo digitato e chiude l'elenco. */
  svuota: () => void
}

export interface PropsSelettoreRicerca<T> {
  /** Come si cercano le voci. Riceve il testo digitato, anche vuoto. */
  cerca: (q: string) => Promise<T[]>
  chiave: (voce: T) => string
  /** Come si disegna una voce dell'elenco. */
  riga: (voce: T) => ReactNode
  onScegli: (voce: T) => void
  /** Etichetta della voce già scelta: compare nel campo quando non ha il fuoco. */
  scelto?: string | null
  /** Se c'è, compare la X che toglie la scelta. */
  onPulisci?: () => void
  segnaposto?: string
  autoFocus?: boolean
  disabilitato?: boolean
  /** Obbligatoria: il campo non ha una `<label>` propria in tutti gli usi. */
  etichettaAria: string
  /** Quante voci al massimo. Poche e buone: l'elenco si legge, non si scorre. */
  massimo?: number
  /** Dopo la scelta il campo si svuota e resta a fuoco. */
  mantieniFuoco?: boolean
  /** Testo mostrato quando la ricerca non trova niente. */
  nessunRisultato?: ReactNode
  /** Nota fissa sotto l'elenco (es. «i prezzi sono di listino»). */
  notaElenco?: ReactNode
  id?: string
  className?: string
}

function SelettoreRicercaInterno<T>(
  {
    cerca,
    chiave,
    riga,
    onScegli,
    scelto,
    onPulisci,
    segnaposto = 'Cerca…',
    autoFocus,
    disabilitato,
    etichettaAria,
    massimo = 8,
    mantieniFuoco = false,
    nessunRisultato = 'Nessun risultato.',
    notaElenco,
    id,
    className = '',
  }: PropsSelettoreRicerca<T>,
  ref: React.Ref<ManiglieSelettore>,
) {
  const campo = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [aperto, setAperto] = useState(false)
  const [voci, setVoci] = useState<T[]>([])
  const [caricamento, setCaricamento] = useState(false)
  const [evidenziata, setEvidenziata] = useState(0)
  const [posizione, setPosizione] = useState<Posizione | null>(null)

  // `cerca` è una closure nuova a ogni render: tenerla in un ref evita di far
  // ripartire la ricerca a ogni battuta del componente padre.
  const cercaRef = useRef(cerca)
  cercaRef.current = cerca
  const richiesta = useRef(0)

  useImperativeHandle(ref, () => ({
    focus: () => {
      campo.current?.focus()
      campo.current?.select()
    },
    svuota: () => {
      setQ('')
      setAperto(false)
    },
  }))

  // Ricerca con attesa breve: si digita più veloce di quanto valga la pena
  // interrogare, e le risposte fuori ordine si scartano col contatore.
  useEffect(() => {
    if (!aperto) return
    const mia = ++richiesta.current
    const attesa = q ? 150 : 0
    setCaricamento(true)
    const t = setTimeout(() => {
      cercaRef
        .current(q)
        .then((r) => {
          if (mia !== richiesta.current) return
          setVoci(r.slice(0, massimo))
          setEvidenziata(0)
        })
        .catch(() => {
          if (mia !== richiesta.current) return
          setVoci([])
        })
        .finally(() => {
          if (mia !== richiesta.current) return
          setCaricamento(false)
        })
    }, attesa)
    return () => clearTimeout(t)
  }, [q, aperto, massimo])

  // L'elenco vive in un portale su `document.body`, non dentro il campo: i due
  // posti in cui questo selettore serve di più — la tabella delle righe, che
  // scorre in orizzontale, e il foglio dell'incasso, che scorre in verticale —
  // sono contenitori con `overflow` non visibile, e un menu in flusso normale
  // ci verrebbe tagliato a metà. Da qui la posizione calcolata a mano.
  useLayoutEffect(() => {
    if (!aperto) {
      setPosizione(null)
      return
    }
    const misura = () => setPosizione(posizioneElenco(campo.current))
    misura()
    // `capture` per intercettare anche lo scroll dei contenitori interni.
    window.addEventListener('scroll', misura, true)
    window.addEventListener('resize', misura)
    return () => {
      window.removeEventListener('scroll', misura, true)
      window.removeEventListener('resize', misura)
    }
  }, [aperto, voci.length])

  const chiudi = useCallback(() => {
    setAperto(false)
    setQ('')
  }, [])

  const scegli = (voce: T) => {
    onScegli(voce)
    setQ('')
    if (mantieniFuoco) {
      // Il ciclo: la riga è entrata, il campo è di nuovo pronto per la prossima.
      setVoci([])
      setEvidenziata(0)
      requestAnimationFrame(() => campo.current?.focus())
    } else {
      setAperto(false)
      campo.current?.blur()
    }
  }

  const suTasto = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!aperto) {
        setAperto(true)
        return
      }
      setEvidenziata((i) => Math.min(i + 1, voci.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setEvidenziata((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter') {
      // Con l'elenco aperto Invio non deve MAI inviare il form che c'è intorno:
      // sceglie la voce, o non fa niente se non ce n'è una. Il contrario
      // significherebbe salvare un preventivo perché si è cercato un articolo
      // che non esiste.
      if (!aperto) return
      e.preventDefault()
      e.stopPropagation()
      if (voci[evidenziata]) scegli(voci[evidenziata])
      return
    }
    if (e.key === 'Escape') {
      // Esc chiude l'elenco; a elenco chiuso toglie la scelta. Due gesti nello
      // stesso tasto, nell'ordine in cui li si vuole.
      //
      // ⚠️ `stopPropagation` SOLO se c'è davvero qualcosa da chiudere: quando
      // non c'è né elenco né scelta, l'evento deve proseguire fino alla modale
      // che c'è intorno. Fermandolo sempre, Esc dentro un selettore non
      // chiudeva più il form d'incasso — e in questo pannello Esc chiude
      // sempre qualcosa, o non è Esc.
      if (aperto && (q || voci.length)) {
        e.stopPropagation()
        chiudi()
      } else if (onPulisci && scelto) {
        e.stopPropagation()
        onPulisci()
      }
      return
    }
    if (e.key === 'Tab') setAperto(false)
  }

  const idElenco = `${id ?? etichettaAria.replace(/\s+/g, '-')}-elenco`

  return (
    <div className={`relative ${className}`}>
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute"
        aria-hidden
      />
      <input
        ref={campo}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={aperto}
        aria-controls={idElenco}
        aria-autocomplete="list"
        aria-label={etichettaAria}
        autoComplete="off"
        className={`input pl-9 ${onPulisci && scelto ? 'pr-10' : ''}`}
        disabled={disabilitato}
        autoFocus={autoFocus}
        placeholder={aperto && scelto ? scelto : segnaposto}
        value={aperto ? q : (scelto ?? '')}
        onChange={(e) => {
          setQ(e.target.value)
          if (!aperto) setAperto(true)
        }}
        onFocus={() => {
          setAperto(true)
          setQ('')
        }}
        // Il ritardo lascia passare il click su una voce: senza, l'elenco
        // sparisce prima che il click arrivi a destinazione.
        onBlur={() => setTimeout(() => setAperto(false), 120)}
        onKeyDown={suTasto}
      />

      {onPulisci && scelto && !aperto && (
        <button
          type="button"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-mute hover:bg-tint/40 hover:text-ink"
          aria-label={`Togli la scelta: ${scelto}`}
          onClick={() => onPulisci()}
        >
          <X size={15} />
        </button>
      )}

      {aperto &&
        posizione &&
        createPortal(
          <div
            id={idElenco}
            role="listbox"
            aria-label={etichettaAria}
            style={posizione.stile}
            // z sopra le modali (z-50): il selettore serve anche dentro di loro.
            className="card z-[70] overflow-y-auto py-1 shadow-card"
          >
          {caricamento && !voci.length && (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-ink-mute">
              <Loader2 size={15} className="animate-spin" />
              Cerco…
            </p>
          )}

          {!caricamento && !voci.length && (
            <p className="px-3 py-3 text-sm text-ink-mute">{nessunRisultato}</p>
          )}

          {voci.map((v, i) => (
            <button
              key={chiave(v)}
              type="button"
              role="option"
              aria-selected={i === evidenziata}
              // `onMouseDown` e non `onClick`: il blur del campo arriverebbe prima.
              onMouseDown={(e) => {
                e.preventDefault()
                scegli(v)
              }}
              onMouseEnter={() => setEvidenziata(i)}
              className={`flex min-h-[2.75rem] w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                i === evidenziata ? 'bg-tint/50' : 'hover:bg-tint/30'
              }`}
            >
              {riga(v)}
            </button>
          ))}

            {notaElenco && Boolean(voci.length) && (
              <p className="border-t border-line px-3 py-2 text-xs text-ink-mute">{notaElenco}</p>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Dove disegnare l'elenco: sotto il campo, o sopra se sotto non ci sta. */
interface Posizione {
  stile: React.CSSProperties
}

function posizioneElenco(campo: HTMLInputElement | null): Posizione | null {
  if (!campo) return null
  const r = campo.getBoundingClientRect()
  const sotto = window.innerHeight - r.bottom
  const sopra = r.top
  const apreInAlto = sotto < 220 && sopra > sotto
  const altezza = Math.max(140, Math.min(320, (apreInAlto ? sopra : sotto) - 12))
  return {
    stile: {
      position: 'fixed',
      left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
      width: r.width,
      maxHeight: altezza,
      ...(apreInAlto
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
    },
  }
}

/**
 * `forwardRef` perde i generici: il cast restituisce la firma giusta, così
 * `<SelettoreRicerca<Articolo> …>` continua a essere tipizzato dai chiamanti.
 */
const SelettoreRicerca = forwardRef(SelettoreRicercaInterno) as <T>(
  props: PropsSelettoreRicerca<T> & { ref?: React.Ref<ManiglieSelettore> },
) => ReturnType<typeof SelettoreRicercaInterno>

export default SelettoreRicerca
