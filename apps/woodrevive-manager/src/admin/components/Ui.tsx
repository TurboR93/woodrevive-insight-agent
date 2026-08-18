import { motion } from 'framer-motion'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'

/* ==========================================================================
   Pezzi di interfaccia piccoli e ricorrenti. Stanno in un file solo perché
   sono tutti da dieci-venti righe e cercarli in dodici file sarebbe peggio.
   ========================================================================== */

// --------------------------------------------------------------- caricamento
export function Caricamento({ etichetta = 'Caricamento…' }: { etichetta?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-ink-mute">
      <Loader2 size={18} className="animate-spin" />
      {etichetta}
    </div>
  )
}

// -------------------------------------------------------------------- errore
export function Errore({ messaggio, onRiprova }: { messaggio: string; onRiprova?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="rounded-full bg-danger/10 p-3 text-danger">
        <AlertTriangle size={20} strokeWidth={1.8} />
      </span>
      <p className="max-w-md text-sm text-ink">{messaggio}</p>
      {onRiprova && (
        <button type="button" className="btn-secondary" onClick={onRiprova}>
          Riprova
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- stato vuoto
export function StatoVuoto({
  icona: Icona,
  titolo,
  testo,
  azione,
}: {
  icona?: LucideIcon
  titolo: string
  testo?: string
  azione?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      {Icona && (
        <span className="rounded-full bg-tint/50 p-3 text-brand-strong">
          <Icona size={22} strokeWidth={1.8} />
        </span>
      )}
      <p className="font-display text-lg text-ink">{titolo}</p>
      {testo && <p className="max-w-md text-sm text-ink-mute">{testo}</p>}
      {azione}
    </div>
  )
}

// --------------------------------------------------------------------- card
export function Card({
  titolo,
  azioni,
  children,
  className = '',
}: {
  titolo?: ReactNode
  azioni?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card ${className}`}>
      {(titolo || azioni) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {titolo && <h2 className="font-display text-base text-ink">{titolo}</h2>}
          {azioni && <div className="flex items-center gap-2">{azioni}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

/**
 * Blocco di un form lungo: titolo e filetto di separazione. La usano tutte le
 * modali di anagrafica — stava scritta tre volte, una per pagina.
 */
export function Sezione({
  titolo,
  children,
  className = '',
}: {
  titolo: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`border-t border-line pt-4 first:border-0 first:pt-0 ${className}`}>
      <h3 className="mb-3 font-display text-sm text-ink">{titolo}</h3>
      {children}
    </section>
  )
}

/** Coppia etichetta/valore per le schede di dettaglio. */
export function Dato({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label">{etichetta}</dt>
      <dd className="mt-1 text-sm text-ink">{children ?? '—'}</dd>
    </div>
  )
}

// -------------------------------------------------------------------- modale

/** Elementi che possono ricevere il fuoco dentro il pannello. */
const SELETTORI_FUOCO = [
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
]
const FOCALIZZABILI = SELETTORI_FUOCO.join(', ')
/** Gli stessi, ma solo dentro il corpo: il primo campo utile non è la X. */
const FOCALIZZABILI_CORPO = SELETTORI_FUOCO.map((s) => `[data-corpo-modale] ${s}`).join(', ')

/**
 * C'è una modale aperta in questo momento?
 *
 * Serve alle scorciatoie da tastiera registrate su `document` o su `window` —
 * Cmd/Ctrl+K della ricerca rapida, Cmd/Ctrl+Invio del salvataggio — che
 * altrimenti scatterebbero *attraverso* la modale: la palette comparirebbe
 * sopra il form d'incasso, o si salverebbe un preventivo mentre si sta
 * confermando di eliminarlo. Una scorciatoia globale è globale finché non c'è
 * uno strato sopra; da lì in poi comanda lo strato.
 *
 * Si guarda il DOM e non uno stato condiviso perché le modali di questo
 * pannello nascono in dieci pagine diverse e non hanno un registro comune:
 * `role="dialog" aria-modal="true"` ce l'hanno tutte, ed è ciò che le rende
 * modali anche per chi usa uno screen reader.
 */
export function modaleAperta(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null
}

/**
 * Modale del pannello.
 *
 * Oltre a Esc e al blocco dello scroll, che c'erano già, fa tre cose che
 * servono a chi lavora da tastiera e a chi lavora col pollice:
 *   - mette il fuoco sul primo campo utile all'apertura (o sull'elemento
 *     marcato `data-fuoco-iniziale`, se il form ne indica uno);
 *   - intrappola il Tab dentro il pannello, così non si finisce a navigare
 *     la pagina sotto senza accorgersene;
 *   - restituisce il fuoco al comando che l'ha aperta alla chiusura.
 *
 * `variante="foglio"` la fa salire dal basso sotto `md:`: una modale centrata
 * su un telefono tenuto con una mano sola è irraggiungibile. Da `md:` in su le
 * due varianti sono identiche.
 */
export function Modale({
  titolo,
  sottotitolo,
  onChiudi,
  larghezza = 'max-w-2xl',
  children,
  piede,
  variante = 'centrata',
}: {
  titolo: string
  sottotitolo?: string
  onChiudi: () => void
  larghezza?: string
  children: ReactNode
  piede?: ReactNode
  /** `foglio` = sale dal basso sotto `md:`, zona pollice. */
  variante?: 'centrata' | 'foglio'
}) {
  const pannello = useRef<HTMLDivElement>(null)
  const idTitolo = useId()

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onChiudi()
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [onChiudi])

  // Fuoco iniziale e ritorno del fuoco. Volutamente senza dipendenze: vale una
  // volta sola, all'apertura e alla chiusura.
  useEffect(() => {
    const apriva = document.activeElement as HTMLElement | null
    const p = pannello.current
    if (p) {
      const dichiarato = p.querySelector<HTMLElement>('[data-fuoco-iniziale]')
      const primo = dichiarato ?? p.querySelector<HTMLElement>(FOCALIZZABILI_CORPO)
      ;(primo ?? p).focus()
    }
    return () => {
      // L'elemento che ha aperto la modale può essere sparito (una riga
      // ricaricata): in quel caso non si forza nulla.
      if (apriva && document.contains(apriva)) apriva.focus()
    }
  }, [])

  const trappolaFuoco = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const p = pannello.current
    if (!p) return
    const elementi = Array.from(p.querySelectorAll<HTMLElement>(FOCALIZZABILI)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    )
    if (!elementi.length) return
    const primo = elementi[0]
    const ultimo = elementi[elementi.length - 1]
    if (e.shiftKey && document.activeElement === primo) {
      e.preventDefault()
      ultimo.focus()
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault()
      primo.focus()
    }
  }

  const foglio = variante === 'foglio'

  return (
    <div
      className={[
        'fixed inset-0 z-50 flex justify-center overflow-y-auto bg-ink/50',
        foglio ? 'items-end p-0 md:items-center md:p-4' : 'items-start p-4 md:items-center',
      ].join(' ')}
    >
      <motion.div
        ref={pannello}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitolo}
        tabIndex={-1}
        onKeyDown={trappolaFuoco}
        initial={{ opacity: 0, y: foglio ? 24 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={[
          'card w-full focus:outline-none',
          larghezza,
          foglio
            ? 'mt-auto max-h-[92vh] overflow-y-auto rounded-b-none md:my-auto md:max-h-none md:rounded-card'
            : 'my-auto',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id={idTitolo} className="font-display text-lg text-ink">
              {titolo}
            </h2>
            {sottotitolo && <p className="mt-0.5 text-sm text-ink-mute">{sottotitolo}</p>}
          </div>
          <button
            type="button"
            onClick={onChiudi}
            className="btn-icona -mr-1 text-ink-mute hover:bg-tint/40 hover:text-ink"
            aria-label="Chiudi"
          >
            <X size={18} />
          </button>
        </header>
        <div data-corpo-modale className="px-5 py-4">
          {children}
        </div>
        {piede && (
          <footer
            className={[
              'flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5',
              // Sul telefono il piede è la zona pollice: i comandi vanno larghi
              // e sopra l'indicatore di sistema.
              foglio ? 'zona-sicura-fondo md:pb-3.5 [&>button]:flex-1 md:[&>button]:flex-none' : '',
            ].join(' ')}
          >
            {piede}
          </footer>
        )}
      </motion.div>
    </div>
  )
}

// ------------------------------------------------------------------ conferma
export function Conferma({
  titolo,
  messaggio,
  etichettaConferma = 'Conferma',
  distruttiva,
  onConferma,
  onAnnulla,
  inCorso,
}: {
  titolo: string
  messaggio: ReactNode
  etichettaConferma?: string
  distruttiva?: boolean
  onConferma: () => void
  onAnnulla: () => void
  inCorso?: boolean
}) {
  return (
    <Modale
      titolo={titolo}
      onChiudi={onAnnulla}
      larghezza="max-w-md"
      piede={
        <>
          <button type="button" className="btn-secondary" onClick={onAnnulla} disabled={inCorso}>
            Annulla
          </button>
          <button
            type="button"
            className={distruttiva ? 'btn-danger' : 'btn-primary'}
            onClick={onConferma}
            disabled={inCorso}
          >
            {inCorso ? 'Attendi…' : etichettaConferma}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        {distruttiva && (
          <span className="h-fit rounded-full bg-danger/10 p-2 text-danger">
            <AlertTriangle size={18} strokeWidth={1.8} />
          </span>
        )}
        <div className="text-sm leading-relaxed text-ink-soft">{messaggio}</div>
      </div>
    </Modale>
  )
}

// -------------------------------------------------------------- barra e KPI
/** Barra di avanzamento: giacenza sulla scorta, evasione di un ordine, consumo di un lotto. */
export function Barra({
  percentuale,
  tono = 'brand',
  etichetta,
}: {
  percentuale: number
  tono?: 'brand' | 'ok' | 'warn' | 'danger'
  etichetta?: string
}) {
  const larghezza = Math.max(0, Math.min(100, percentuale))
  const colori = {
    brand: 'bg-brand',
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
  } as const
  return (
    <div className="min-w-[6rem]">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${colori[tono]}`} style={{ width: `${larghezza}%` }} />
      </div>
      {etichetta && <p className="mt-1 text-xs text-ink-mute">{etichetta}</p>}
    </div>
  )
}

export function KpiCard({
  etichetta,
  valore,
  dettaglio,
  icona: Icona,
  tono = 'brand',
  ritardo = 0,
}: {
  etichetta: string
  valore: ReactNode
  dettaglio?: ReactNode
  icona?: LucideIcon
  tono?: 'brand' | 'ok' | 'warn' | 'danger' | 'info'
  ritardo?: number
}) {
  const accenti = {
    brand: 'bg-brand/10 text-brand-strong',
    ok: 'bg-ok/10 text-ok',
    warn: 'bg-warn/10 text-warn',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-info/10 text-info',
  } as const

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: ritardo, ease: [0.22, 1, 0.36, 1] }}
      className="card flex items-start gap-3 px-5 py-4"
    >
      {Icona && (
        <span className={`rounded-xl p-2.5 ${accenti[tono]}`}>
          <Icona size={18} strokeWidth={1.8} />
        </span>
      )}
      <div className="min-w-0">
        <p className="label">{etichetta}</p>
        <p className="tabular mt-1 truncate text-xl font-semibold text-ink">{valore}</p>
        {dettaglio && <p className="mt-0.5 truncate text-xs text-ink-mute">{dettaglio}</p>}
      </div>
    </motion.div>
  )
}
