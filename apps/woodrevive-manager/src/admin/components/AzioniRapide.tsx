import { AnimatePresence, motion } from 'framer-motion'
import { FilePlus2, PackagePlus, Plus, Wallet, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import FormIncasso from './FormIncasso'
import { notificaDatiCambiati } from './eventiDati'

/**
 * Le azioni di tutti i giorni, sempre a un gesto di distanza.
 *
 * Sono tre, e sono tre perché sono tre le cose che in Wood Revive si fanno
 * ogni giorno: si preventiva, si incassa, si carica la merce che arriva.
 *
 * **Non c'è «Nuovo ordine», e non è una dimenticanza**: ogni ordine nasce da un
 * preventivo accettato, sempre. L'unico modo di ottenerne uno è «Converti in
 * ordine» dalla scheda del preventivo. Se qualcuno vorrà aggiungere qui un
 * comando per creare un ordine da zero, la risposta è no: non esiste nel
 * mestiere, non deve esistere nel gestionale.
 *
 * Tre forme, la stessa dichiarazione:
 *   - `compatta`   — nella topbar di ogni pagina, da `md:` in su;
 *   - `estesa`     — in cima alla Panoramica, con la riga di spiegazione;
 *   - `flottante`  — sul telefono, pulsante in basso a destra che apre il
 *     ventaglio. Sta sotto le modali (z-30 contro z-50) e sparisce dove la
 *     schermata ha già la sua barra fissa di azioni.
 */

/** Rotta della creazione rapida del preventivo. Vedi AdminApp.tsx. */
export const PERCORSO_NUOVO_PREVENTIVO = '/preventivi/nuovo'
/** Rotta della schermata di carico merce (fornitura arrivata in piazzale). */
export const PERCORSO_CARICA_MERCE = '/acquisti/nuovo'

interface VoceAzione {
  chiave: string
  etichetta: string
  descrizione: string
  icona: LucideIcon
  a?: string
  /** Azione che si apre sul posto invece di portare da un'altra parte. */
  apre?: 'incasso'
}

const AZIONI: VoceAzione[] = [
  {
    chiave: 'preventivo',
    etichetta: 'Nuovo preventivo',
    descrizione: 'Cliente, articoli, quantità: una schermata sola.',
    icona: FilePlus2,
    a: PERCORSO_NUOVO_PREVENTIVO,
  },
  {
    chiave: 'incasso',
    etichetta: 'Registra incasso',
    descrizione: 'Acconto, saldo o caparra senza ordine.',
    icona: Wallet,
    apre: 'incasso',
  },
  {
    chiave: 'merce',
    etichetta: 'Carica merce',
    descrizione: 'La fornitura è arrivata: nasce la partita.',
    icona: PackagePlus,
    a: PERCORSO_CARICA_MERCE,
  },
]

export default function AzioniRapide({
  variante = 'compatta',
  className = '',
}: {
  variante?: 'compatta' | 'estesa' | 'flottante'
  className?: string
}) {
  const navigate = useNavigate()
  const [incasso, setIncasso] = useState(false)
  const [ventaglio, setVentaglio] = useState(false)

  // Esc chiude il ventaglio, come chiude ogni cosa in questo pannello.
  useEffect(() => {
    if (!ventaglio) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setVentaglio(false)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [ventaglio])

  const esegui = (a: VoceAzione) => {
    setVentaglio(false)
    if (a.apre === 'incasso') setIncasso(true)
    else if (a.a) navigate(a.a)
  }

  const modaleIncasso = incasso && (
    <FormIncasso
      onChiudi={() => setIncasso(false)}
      onSalvato={() => {
        setIncasso(false)
        notificaDatiCambiati()
        // Si atterra sugli incassi: vedere il movimento in lista è la conferma
        // che è entrato davvero, e non serve nessun messaggio che sparisce.
        navigate('/incassi')
      }}
    />
  )

  // ── in cima alla Panoramica ──────────────────────────────────────────────
  if (variante === 'estesa') {
    return (
      <>
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${className}`}>
          {AZIONI.map((a) => {
            const contenuto = (
              <>
                <span className="rounded-xl bg-brand/10 p-2.5 text-brand-strong">
                  <a.icona size={18} strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{a.etichetta}</span>
                  <span className="mt-0.5 block text-xs text-ink-mute">{a.descrizione}</span>
                </span>
              </>
            )
            const classe =
              'card flex min-h-[2.75rem] items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors hover:bg-tint/30'
            return a.a ? (
              <Link key={a.chiave} to={a.a} className={classe}>
                {contenuto}
              </Link>
            ) : (
              <button key={a.chiave} type="button" className={classe} onClick={() => esegui(a)}>
                {contenuto}
              </button>
            )
          })}
        </div>
        {modaleIncasso}
      </>
    )
  }

  // ── telefono: pulsante flottante e ventaglio ─────────────────────────────
  if (variante === 'flottante') {
    return (
      <>
        <AnimatePresence>
          {ventaglio && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="no-stampa fixed inset-0 z-30 bg-ink/40 md:hidden"
              onClick={() => setVentaglio(false)}
              aria-hidden
            />
          )}
        </AnimatePresence>

        <div className={`pulsante-flottante no-stampa ${className}`}>
          <AnimatePresence>
            {ventaglio && (
              <motion.ul
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="mb-3 space-y-2"
              >
                {AZIONI.map((a) => (
                  <li key={a.chiave} className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => esegui(a)}
                      className="btn-secondary min-h-[2.75rem] shadow-card"
                    >
                      <a.icona size={17} strokeWidth={1.8} />
                      {a.etichetta}
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setVentaglio((v) => !v)}
            aria-expanded={ventaglio}
            aria-label={ventaglio ? 'Chiudi le azioni rapide' : 'Azioni rapide'}
            className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-strong text-white shadow-card transition-colors hover:bg-ink"
          >
            {ventaglio ? <X size={22} /> : <Plus size={24} />}
          </button>
        </div>

        {modaleIncasso}
      </>
    )
  }

  // ── topbar, da md: in su ─────────────────────────────────────────────────
  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        {AZIONI.map((a) =>
          a.a ? (
            <Link key={a.chiave} to={a.a} className="btn-secondary" title={a.descrizione}>
              <a.icona size={16} strokeWidth={1.9} />
              {a.etichetta}
            </Link>
          ) : (
            <button
              key={a.chiave}
              type="button"
              className="btn-secondary"
              title={a.descrizione}
              onClick={() => esegui(a)}
            >
              <a.icona size={16} strokeWidth={1.9} />
              {a.etichetta}
            </button>
          ),
        )}
      </div>
      {modaleIncasso}
    </>
  )
}
