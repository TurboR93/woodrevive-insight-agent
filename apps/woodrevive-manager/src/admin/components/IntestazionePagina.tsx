import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Testata di pagina: titolo, sottotitolo, eventuale ritorno alla lista e le
 * azioni a destra. Ogni pagina la usa, così titoli e spaziature non divergono.
 */
export default function IntestazionePagina({
  titolo,
  sottotitolo,
  indietro,
  azioni,
}: {
  titolo: string
  sottotitolo?: ReactNode
  indietro?: { a: string; label: string }
  azioni?: ReactNode
}) {
  return (
    <header className="mb-6">
      {indietro && (
        <Link
          to={indietro.a}
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-mute transition-colors hover:text-brand-strong"
        >
          <ChevronLeft size={16} />
          {indietro.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink md:text-3xl">{titolo}</h1>
          {sottotitolo && (
            <p className="mt-1 max-w-2xl text-sm text-ink-mute">{sottotitolo}</p>
          )}
        </div>
        {azioni && <div className="flex shrink-0 flex-wrap items-center gap-2">{azioni}</div>}
      </div>
    </header>
  )
}
