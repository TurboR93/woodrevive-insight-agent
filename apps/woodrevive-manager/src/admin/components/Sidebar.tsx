import {
  ArrowLeftRight,
  Bot,
  Boxes,
  ClipboardList,
  ClipboardPen,
  Database,
  FileText,
  LayoutDashboard,
  Layers,
  PackageCheck,
  ScrollText,
  Settings,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { api } from '../api'
import { Logo, brandConfig } from '../brand'
import { useFetch } from '../useFetch'

interface Voce {
  to: string
  label: string
  icona: LucideIcon
  end?: boolean
}

interface Gruppo {
  titolo: string | null
  voci: Voce[]
}

/**
 * La navigazione segue il flusso del mestiere, non l'ordine alfabetico:
 * si compra (acquisti), la merce sta da qualche parte (magazzino), si vende e
 * infine si incassa. È l'ordine in cui ci si pensa lavorando — e in mezzo non
 * c'è nessuna lavorazione, perché Wood Revive rivende legno già lavorato.
 */
export const GRUPPI: Gruppo[] = [
  {
    titolo: null,
    voci: [{ to: '/', label: 'Panoramica', icona: LayoutDashboard, end: true }],
  },
  {
    titolo: 'Anagrafiche',
    voci: [
      { to: '/clienti', label: 'Clienti', icona: Users },
      { to: '/fornitori', label: 'Fornitori', icona: Truck },
      { to: '/listino', label: 'Listino', icona: Tags },
    ],
  },
  {
    titolo: 'Acquisti',
    voci: [
      { to: '/acquisti', label: 'Ordini di acquisto', icona: ShoppingCart },
      // La specifica verso il fornitore: sta qui perché è un pezzo del
      // comprare, non del produrre — la lavorazione la fa il fornitore.
      { to: '/schede-lavorazione', label: 'Schede lavorazione', icona: ClipboardPen },
    ],
  },
  {
    titolo: 'Magazzino',
    voci: [
      { to: '/lotti', label: 'Lotti', icona: Layers },
      { to: '/articoli', label: 'Articoli', icona: Boxes },
      { to: '/movimenti', label: 'Movimenti', icona: ArrowLeftRight },
    ],
  },
  {
    titolo: 'Vendite',
    voci: [
      { to: '/preventivi', label: 'Preventivi', icona: FileText },
      { to: '/ordini', label: 'Ordini', icona: ClipboardList },
      { to: '/ddt', label: 'DDT', icona: ScrollText },
      { to: '/incassi', label: 'Incassi', icona: Wallet },
    ],
  },
  {
    titolo: null,
    voci: [{ to: '/impostazioni', label: 'Impostazioni', icona: Settings }],
  },
]

export default function Sidebar({ onNaviga }: { onNaviga?: () => void }) {
  const { dati: stato } = useFetch(() => api.statoDati(), [])
  const daImport = stato?.origine === 'import'

  return (
    <div className="flex h-full flex-col bg-ink text-white/80">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <Logo variante="negativo" className="h-7 w-auto" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {GRUPPI.map((gruppo, i) => (
          <div key={gruppo.titolo ?? `gruppo-${i}`} className="mb-5">
            {gruppo.titolo && (
              <p className="px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-widest text-white/35">
                {gruppo.titolo}
              </p>
            )}
            <ul className="space-y-0.5">
              {gruppo.voci.map((voce) => (
                <li key={voce.to}>
                  <NavLink
                    to={voce.to}
                    end={voce.end}
                    onClick={onNaviga}
                    className={({ isActive }) =>
                      [
                        // 44px nel drawer del telefono, compatto sul monitor:
                        // è lo stesso componente in due contesti diversi.
                        'flex min-h-[2.75rem] items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm transition-colors ease-wood md:min-h-0',
                        isActive
                          ? 'border-brand-soft bg-white/10 font-semibold text-white'
                          : 'border-transparent hover:bg-white/5 hover:text-white',
                      ].join(' ')
                    }
                  >
                    <voce.icona size={17} strokeWidth={1.8} className="shrink-0" />
                    {voce.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <a
          href="http://localhost:3000/"
          className="mb-4 flex min-h-[2.75rem] items-center gap-3 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          <Bot size={17} strokeWidth={1.8} />
          Passa all’agente AI
        </a>
        {/*
          Dire quali dati si sta guardando non è un dettaglio: con l'archivio
          vero a schermo, un'etichetta «dimostrativi» farebbe credere che si
          possa modificare qualunque cosa senza conseguenze.
        */}
        <p className="flex items-center gap-2 text-xs text-white/45">
          {daImport ? (
            <Database size={14} strokeWidth={1.8} />
          ) : (
            <PackageCheck size={14} strokeWidth={1.8} />
          )}
          {daImport ? 'Archivio demo locale' : 'Demo condivisa con l’agente'}
        </p>
        <p className="mt-1 text-[0.68rem] leading-relaxed text-white/30">
          {daImport ? 'Caricato soltanto in questo browser' : brandConfig.payoff}
        </p>
        {/*
          Finché non c'è un database, i dati stanno **in questo browser**. Da un
          altro dispositivo non si ritrova quello che si è scritto qui, e al
          prossimo import l'archivio viene sostituito. Chi lo sa non ci mette
          dentro lavoro vero; chi non lo sa lo scopre quando è troppo tardi.
        */}
        {daImport && (
          <p className="mt-2 border-t border-white/10 pt-2 text-[0.68rem] leading-relaxed text-white/30">
            Prova: quello che scrivi resta in questo browser e verrà sostituito al
            prossimo import.
          </p>
        )}
      </div>
    </div>
  )
}
