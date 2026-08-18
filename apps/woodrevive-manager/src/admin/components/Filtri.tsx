import { RotateCcw, Search } from 'lucide-react'

export type ValoriFiltri = Record<string, string>

export interface DefinizioneFiltro {
  chiave: string
  etichetta: string
  tipo: 'select' | 'data' | 'check'
  opzioni?: Array<{ valore: string; etichetta: string }>
}

/**
 * Barra filtri dichiarativa: ogni pagina descrive i propri filtri con un array
 * e non riscrive input, select e pulsante di azzeramento.
 */
export default function Filtri({
  valori,
  onCambia,
  definizioni = [],
  segnaposto = 'Cerca…',
}: {
  valori: ValoriFiltri
  onCambia: (v: ValoriFiltri) => void
  definizioni?: DefinizioneFiltro[]
  segnaposto?: string
}) {
  const imposta = (chiave: string, valore: string) => onCambia({ ...valori, [chiave]: valore })
  const attivi = Object.values(valori).some(Boolean)

  return (
    <div className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3">
      <label className="relative min-w-[12rem] flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
        <input
          type="search"
          value={valori.q ?? ''}
          onChange={(e) => imposta('q', e.target.value)}
          placeholder={segnaposto}
          className="input pl-9"
          aria-label="Cerca"
        />
      </label>

      {definizioni.map((d) => {
        if (d.tipo === 'check') {
          return (
            <label key={d.chiave} className="flex items-center gap-2 pb-2 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={valori[d.chiave] === '1'}
                onChange={(e) => imposta(d.chiave, e.target.checked ? '1' : '')}
                className="h-4 w-4 rounded border-line text-brand focus:ring-brand/40"
              />
              {d.etichetta}
            </label>
          )
        }
        if (d.tipo === 'data') {
          return (
            <label key={d.chiave} className="min-w-[9rem]">
              <span className="label mb-1">{d.etichetta}</span>
              <input
                type="date"
                value={valori[d.chiave] ?? ''}
                onChange={(e) => imposta(d.chiave, e.target.value)}
                className="input"
              />
            </label>
          )
        }
        return (
          <label key={d.chiave} className="min-w-[10rem]">
            <span className="label mb-1">{d.etichetta}</span>
            <select
              value={valori[d.chiave] ?? ''}
              onChange={(e) => imposta(d.chiave, e.target.value)}
              className="input"
            >
              <option value="">Tutti</option>
              {d.opzioni?.map((o) => (
                <option key={o.valore} value={o.valore}>
                  {o.etichetta}
                </option>
              ))}
            </select>
          </label>
        )
      })}

      {attivi && (
        <button type="button" onClick={() => onCambia({})} className="btn-ghost mb-0.5">
          <RotateCcw size={15} />
          Azzera
        </button>
      )}
    </div>
  )
}

/** Trasforma un dizionario di label in opzioni per la select. */
export function opzioniDa<T extends string>(etichette: Record<T, string>) {
  return (Object.entries(etichette) as Array<[T, string]>).map(([valore, etichetta]) => ({
    valore,
    etichetta,
  }))
}
