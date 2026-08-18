import type { ReactNode } from 'react'

/* Campi di form. Niente librerie: i form del pannello sono elenchi di campi
   controllati, e una form library qui aggiungerebbe solo cerimonia. */

export function Campo({
  etichetta,
  obbligatorio,
  aiuto,
  errore,
  children,
  className = '',
}: {
  etichetta: string
  obbligatorio?: boolean
  aiuto?: ReactNode
  errore?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label mb-1">
        {etichetta}
        {obbligatorio && <span className="text-danger"> *</span>}
      </span>
      {children}
      {errore ? (
        <span className="mt-1 block text-xs text-danger">{errore}</span>
      ) : (
        aiuto && <span className="mt-1 block text-xs text-ink-mute">{aiuto}</span>
      )}
    </label>
  )
}

export function Testo({
  valore,
  onCambia,
  ...resto
}: {
  valore: string
  onCambia: (v: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      {...resto}
      className={`input ${resto.className ?? ''}`}
      value={valore}
      onChange={(e) => onCambia(e.target.value)}
    />
  )
}

export function AreaTesto({
  valore,
  onCambia,
  righe = 3,
  ...resto
}: {
  valore: string
  onCambia: (v: string) => void
  righe?: number
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'>) {
  return (
    <textarea
      {...resto}
      rows={righe}
      className={`input ${resto.className ?? ''}`}
      value={valore}
      onChange={(e) => onCambia(e.target.value)}
    />
  )
}

export function Scelta<T extends string>({
  valore,
  onCambia,
  opzioni,
  vuoto,
  ...resto
}: {
  valore: T | ''
  onCambia: (v: T) => void
  opzioni: Array<{ valore: T; etichetta: string }>
  vuoto?: string
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  return (
    <select
      {...resto}
      className={`input ${resto.className ?? ''}`}
      value={valore}
      onChange={(e) => onCambia(e.target.value as T)}
    >
      {vuoto !== undefined && <option value="">{vuoto}</option>}
      {opzioni.map((o) => (
        <option key={o.valore} value={o.valore}>
          {o.etichetta}
        </option>
      ))}
    </select>
  )
}

/** Griglia di campi: una colonna su mobile, due da `md:` in su. */
export function GrigliaCampi({ children, colonne = 2 }: { children: ReactNode; colonne?: 1 | 2 | 3 }) {
  const classi = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' } as const
  return <div className={`grid grid-cols-1 gap-4 ${classi[colonne]}`}>{children}</div>
}

/** Riquadro di errore in cima ai form, per i messaggi che arrivano dall'API. */
export function AvvisoErrore({ messaggio }: { messaggio: string | null }) {
  if (!messaggio) return null
  return (
    <p className="mb-4 rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
      {messaggio}
    </p>
  )
}
