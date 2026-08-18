import { AnimatePresence, motion } from 'framer-motion'
import { Menu, Search, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { Logo } from '../brand'
import AvvisoImport from './AvvisoImport'
import AzioniRapide from './AzioniRapide'
import RicercaGlobale, { useScorciatoiaRicerca } from './RicercaGlobale'
import Sidebar from './Sidebar'

/**
 * Cornice del pannello: sidebar, topbar, contenuto.
 *
 * Qui vivono le due cose che devono essere disponibili da OGNI schermata e che
 * per questo non possono stare in una pagina:
 *   - la RICERCA RAPIDA (Cmd/Ctrl+K), che porta a qualunque cliente, articolo,
 *     partita o documento senza passare dalle liste;
 *   - le AZIONI RAPIDE — nuovo preventivo, registra incasso, carica merce —
 *     nella topbar da `md:` in su e come pulsante flottante sul telefono.
 */
export default function AdminLayout() {
  const [drawerAperto, setDrawerAperto] = useState(false)
  const [ricercaAperta, setRicercaAperta] = useState(false)
  const { pathname } = useLocation()

  // Cambiare pagina chiude il drawer e riporta in cima: senza, si atterra
  // a metà della pagina nuova con lo scroll di quella vecchia.
  useEffect(() => {
    setDrawerAperto(false)
    setRicercaAperta(false)
    window.scrollTo(0, 0)
  }, [pathname])

  const apriRicerca = useCallback(() => setRicercaAperta(true), [])
  useScorciatoiaRicerca(apriRicerca)

  return (
    <div className="min-h-screen bg-wash">
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 md:block">
        <Sidebar />
      </aside>

      {/* topbar mobile */}
      <header className="no-stampa sticky top-0 z-20 flex items-center justify-between gap-2 bg-ink px-4 py-2 md:hidden">
        <Logo variante="negativo" className="h-6 w-auto" />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={apriRicerca}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
            aria-label="Ricerca rapida"
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={() => setDrawerAperto(true)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
            aria-label="Apri il menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {drawerAperto && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-ink/50 md:hidden"
              onClick={() => setDrawerAperto(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-72 md:hidden"
            >
              <button
                type="button"
                onClick={() => setDrawerAperto(false)}
                className="absolute right-2 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-lg text-white/70 hover:bg-white/10"
                aria-label="Chiudi il menu"
              >
                <X size={18} />
              </button>
              <Sidebar onNaviga={() => setDrawerAperto(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="md:pl-64">
        {/* topbar desktop: ricerca a sinistra, azioni quotidiane a destra */}
        <header className="no-stampa sticky top-0 z-20 hidden border-b border-line bg-wash/90 backdrop-blur md:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-3">
            <button
              type="button"
              onClick={apriRicerca}
              className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-mute transition-colors hover:border-brand hover:text-ink"
            >
              <Search size={16} />
              <span className="flex-1 text-left">Cerca clienti, articoli, partite, documenti…</span>
              <kbd className="rounded border border-line px-1.5 py-0.5 text-xs font-semibold">
                ⌘K
              </kbd>
            </button>
            <AzioniRapide variante="compatta" />
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          <AvvisoImport />
          <Outlet />
        </div>
      </main>

      {/* telefono: le stesse azioni, in zona pollice */}
      <AzioniRapide variante="flottante" />

      {ricercaAperta && <RicercaGlobale onChiudi={() => setRicercaAperta(false)} />}
    </div>
  )
}
