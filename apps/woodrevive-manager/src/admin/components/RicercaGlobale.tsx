import { motion } from 'framer-motion'
import {
  ClipboardList,
  ClipboardPen,
  CornerDownLeft,
  FilePlus2,
  FileText,
  Layers,
  Loader2,
  PackagePlus,
  Boxes,
  ScrollText,
  Search,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { api, type RisultatoRicerca } from '../api'
import { formatEuro, formatQuantita } from '../lib/format'
import FormIncasso from './FormIncasso'
import { PERCORSO_CARICA_MERCE, PERCORSO_NUOVO_PREVENTIVO } from './AzioniRapide'
import { modaleAperta } from './Ui'
import { notificaDatiCambiati } from './eventiDati'

/**
 * Ricerca rapida globale — Cmd/Ctrl+K.
 *
 * Un campo solo che cerca dove servirebbero sette pagine: clienti, articoli,
 * partite, preventivi, ordini, DDT e schede lavorazione. Frecce per muoversi, Invio per saltarci,
 * Esc per chiudere. Il campo compare subito: non si aspetta nessun caricamento
 * per poter cominciare a digitare.
 *
 * Accanto a ogni risultato c'è l'informazione che serve a riconoscerlo: per un
 * articolo prezzo e disponibilità, per un documento cliente e totale, per una
 * partita la provenienza. Un elenco di codici senza contesto costringerebbe ad
 * aprirli uno a uno.
 *
 * In cima ci sono i comandi: «nuovo preventivo», «registra incasso», «carica
 * merce». È così che la creazione rapida diventa raggiungibile da qualunque
 * schermata senza aggiungere un bottone in ogni pagina. Fra i comandi non c'è
 * «nuovo ordine»: gli ordini nascono solo dai preventivi accettati.
 *
 * La ricerca è UNA chiamata, `api.ricercaGlobale(q)`, e non sei `lista*`
 * composte qui: la query sta in `mock/mockApi.ts`, che è la specifica del
 * backend. Da lì tornano dati — centesimi e millesimi — e la riga qui sotto li
 * formatta, che è l'unica cosa che il front-end sa fare meglio del server.
 */

const PER_GRUPPO = 4

type Genere = 'comando' | RisultatoRicerca['genere']

const GRUPPI: Array<{ genere: Genere; titolo: string; icona: LucideIcon }> = [
  { genere: 'comando', titolo: 'Azioni', icona: FilePlus2 },
  { genere: 'cliente', titolo: 'Clienti', icona: Users },
  { genere: 'articolo', titolo: 'Articoli', icona: Boxes },
  { genere: 'lotto', titolo: 'Partite', icona: Layers },
  { genere: 'preventivo', titolo: 'Preventivi', icona: FileText },
  { genere: 'ordine', titolo: 'Ordini', icona: ClipboardList },
  { genere: 'ddt', titolo: 'DDT', icona: ScrollText },
  { genere: 'scheda', titolo: 'Schede lavorazione', icona: ClipboardPen },
]

/** Dove porta una voce. Le rotte sono del front-end: l'API non le conosce. */
const PERCORSO: Record<RisultatoRicerca['genere'], (id: string) => string> = {
  cliente: (id) => `/clienti/${id}`,
  // Gli articoli non hanno una scheda propria: le loro informazioni stanno
  // tutte nella lista. Vedi AdminApp.tsx.
  articolo: () => '/articoli',
  lotto: (id) => `/lotti/${id}`,
  preventivo: (id) => `/preventivi/${id}`,
  ordine: (id) => `/ordini/${id}`,
  ddt: (id) => `/ddt/${id}`,
  scheda: (id) => `/schede-lavorazione/${id}`,
}

/** L'informazione che serve a riconoscere una voce senza doverla aprire. */
function notaDi(r: RisultatoRicerca): string | null {
  switch (r.genere) {
    case 'cliente':
      return [r.codice, r.luogo].filter(Boolean).join(' · ') || null
    case 'articolo':
      return `${formatEuro(r.prezzo_listino_cents)} · ${
        r.disponibile_milli > 0
          ? formatQuantita(r.disponibile_milli, r.unita_misura)
          : 'non disponibile'
      }`
    case 'lotto':
      return r.provenienza ?? 'Provenienza non dichiarata'
    case 'scheda':
      // Niente totale: una scheda si riconosce da chi l'ha chiesta e a chi va.
      return [r.committente, r.fornitore_nome].filter(Boolean).join(' → ')
    default:
      return `${r.cliente_nome} · ${formatEuro(r.totale_cents)}`
  }
}

interface Risultato {
  chiave: string
  genere: Genere
  titolo: string
  /** L'informazione utile accanto al nome: disponibilità, totale, provenienza. */
  nota: string | null
  a?: string
  /** Comandi che si aprono sul posto invece di portare altrove. */
  apre?: 'incasso'
  icona?: LucideIcon
}

const COMANDI: Risultato[] = [
  {
    chiave: 'cmd-preventivo',
    genere: 'comando',
    titolo: 'Nuovo preventivo',
    nota: 'Cliente, articoli, quantità',
    a: PERCORSO_NUOVO_PREVENTIVO,
    icona: FilePlus2,
  },
  {
    chiave: 'cmd-incasso',
    genere: 'comando',
    titolo: 'Registra incasso',
    nota: 'Acconto, saldo o caparra',
    apre: 'incasso',
    icona: Wallet,
  },
  {
    chiave: 'cmd-merce',
    genere: 'comando',
    titolo: 'Carica merce',
    nota: 'La fornitura è arrivata',
    a: PERCORSO_CARICA_MERCE,
    icona: PackagePlus,
  },
]

/**
 * Aggancia Cmd/Ctrl+K a livello di documento. Sta qui e non in AdminLayout
 * perché la scorciatoia e la palette sono la stessa cosa.
 *
 * ⚠️ Con una modale aperta la scorciatoia non fa niente: la palette sta a
 * `z-[60]`, la modale a `z-50`, e senza questa guardia comparirebbe SOPRA il
 * form che si sta compilando — con due Esc in ascolto sullo stesso tasto e
 * nessun modo di capire quale dei due strati risponderà.
 */
export function useScorciatoiaRicerca(apri: () => void): void {
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return
      if (modaleAperta()) return
      e.preventDefault()
      apri()
    }
    document.addEventListener('keydown', suTasto)
    return () => document.removeEventListener('keydown', suTasto)
  }, [apri])
}

export default function RicercaGlobale({ onChiudi }: { onChiudi: () => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [risultati, setRisultati] = useState<Risultato[]>([])
  const [caricamento, setCaricamento] = useState(false)
  const [evidenziato, setEvidenziato] = useState(0)
  const [incasso, setIncasso] = useState(false)
  const richiesta = useRef(0)
  const elenco = useRef<HTMLDivElement>(null)

  const comandi = q
    ? COMANDI.filter((c) => c.titolo.toLowerCase().includes(q.toLowerCase()))
    : COMANDI

  /*
   * Esc chiude la palette anche se il fuoco è finito su un risultato invece che
   * nel campo: il gestore del campo da solo lascerebbe aperta una ricerca da
   * cui si esce solo col mouse. Con il form d'incasso aperto tace, perché lì
   * comanda la modale.
   */
  useEffect(() => {
    if (incasso) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onChiudi()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [incasso, onChiudi])

  useEffect(() => {
    const testo = q.trim()
    if (!testo) {
      setRisultati([])
      setCaricamento(false)
      setEvidenziato(0)
      return
    }
    const mia = ++richiesta.current
    setCaricamento(true)
    const t = setTimeout(() => {
      api
        .ricercaGlobale(testo, PER_GRUPPO)
        .then((voci) => {
          if (mia !== richiesta.current) return
          setRisultati(
            voci.map((v) => ({
              chiave: `${v.genere}-${v.id}`,
              genere: v.genere,
              titolo: v.titolo,
              nota: notaDi(v),
              a: PERCORSO[v.genere](v.id),
            })),
          )
          setEvidenziato(0)
        })
        .catch(() => {
          if (mia !== richiesta.current) return
          setRisultati([])
        })
        .finally(() => {
          if (mia !== richiesta.current) return
          setCaricamento(false)
        })
    }, 160)
    return () => clearTimeout(t)
  }, [q])

  const tutti = [...comandi, ...risultati]

  // L'evidenziazione deve restare visibile anche quando si scorre con le frecce.
  useEffect(() => {
    elenco.current
      ?.querySelector('[data-evidenziato="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [evidenziato, tutti.length])

  const vai = (r: Risultato) => {
    if (r.apre === 'incasso') {
      setIncasso(true)
      return
    }
    if (r.a) {
      onChiudi()
      navigate(r.a)
    }
  }

  const suTasto = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setEvidenziato((i) => Math.min(i + 1, tutti.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setEvidenziato((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (tutti[evidenziato]) vai(tutti[evidenziato])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onChiudi()
    }
  }

  // Con il form d'incasso aperto la palette si toglie di mezzo: due strati di
  // tastiera sullo stesso schermo sono un modo sicuro di premere la cosa
  // sbagliata.
  if (incasso) {
    return (
      <FormIncasso
        onChiudi={() => {
          setIncasso(false)
          onChiudi()
        }}
        onSalvato={() => {
          setIncasso(false)
          onChiudi()
          notificaDatiCambiati()
          navigate('/incassi')
        }}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/50 p-4 md:pt-24"
      onClick={onChiudi}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        className="card w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ricerca rapida"
      >
        <div className="relative border-b border-line">
          <Search
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-mute"
            aria-hidden
          />
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={suTasto}
            placeholder="Cerca clienti, articoli, partite, documenti…"
            aria-label="Ricerca rapida"
            className="w-full bg-transparent px-12 py-4 text-base text-ink placeholder:text-ink-mute focus:outline-none"
          />
          {caricamento && (
            <Loader2
              size={16}
              className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-ink-mute"
            />
          )}
        </div>

        <div ref={elenco} className="max-h-[60vh] overflow-y-auto py-1">
          {GRUPPI.map((g) => {
            const voci = tutti.filter((r) => r.genere === g.genere)
            if (!voci.length) return null
            return (
              <div key={g.genere} className="py-1">
                <p className="px-4 py-1.5 text-[0.68rem] font-semibold uppercase tracking-widest text-ink-mute">
                  {g.titolo}
                </p>
                {voci.map((r) => {
                  const indice = tutti.indexOf(r)
                  const attivo = indice === evidenziato
                  const Icona = r.icona ?? g.icona
                  return (
                    <button
                      key={r.chiave}
                      type="button"
                      data-evidenziato={attivo}
                      onMouseEnter={() => setEvidenziato(indice)}
                      onClick={() => vai(r)}
                      className={`flex min-h-[2.75rem] w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                        attivo ? 'bg-tint/50' : 'hover:bg-tint/30'
                      }`}
                    >
                      <Icona size={16} strokeWidth={1.8} className="shrink-0 text-ink-mute" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{r.titolo}</span>
                        {r.nota && (
                          <span className="mt-0.5 block truncate text-xs text-ink-mute">{r.nota}</span>
                        )}
                      </span>
                      {attivo && <CornerDownLeft size={14} className="shrink-0 text-ink-mute" />}
                    </button>
                  )
                })}
              </div>
            )
          })}

          {!tutti.length && (
            <p className="px-4 py-8 text-center text-sm text-ink-mute">
              {caricamento ? 'Cerco…' : `Nessun risultato per «${q}».`}
            </p>
          )}
        </div>

        <p className="hidden items-center justify-between gap-3 border-t border-line px-4 py-2 text-xs text-ink-mute md:flex">
          <span>↑ ↓ per muoverti · Invio per aprire · Esc per chiudere</span>
          <span>Cerca clienti, articoli, partite e documenti</span>
        </p>
      </motion.div>
    </div>
  )
}
