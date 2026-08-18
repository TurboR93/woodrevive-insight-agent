import type { TonoStato } from '../domain'

/**
 * Pill di stato. Fondo al 12% e testo pieno: una tabella di quaranta righe con
 * pill sature diventa illeggibile.
 */
const TONI: Record<TonoStato, string> = {
  ok: 'bg-ok/12 text-ok',
  warn: 'bg-warn/12 text-warn',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/12 text-info',
  neutro: 'bg-ink/8 text-ink-soft',
}

export default function StatoBadge({
  etichetta,
  tono = 'neutro',
  titolo,
}: {
  etichetta: string
  tono?: TonoStato
  titolo?: string
}) {
  return (
    <span
      title={titolo}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONI[tono]}`}
    >
      {etichetta}
    </span>
  )
}

/**
 * Select di cambio stato, usabile dentro una riga di tabella: mostra solo le
 * transizioni ammesse dalla macchina a stati.
 */
export function SelectStato<S extends string>({
  stato,
  etichette,
  toni,
  ammessi,
  onCambia,
  disabilitato,
  etichettaAria = 'Cambia stato',
}: {
  stato: S
  etichette: Record<S, string>
  toni: Record<S, TonoStato>
  ammessi: S[]
  onCambia: (nuovo: S) => void
  disabilitato?: boolean
  etichettaAria?: string
}) {
  if (disabilitato || !ammessi.length) {
    return <StatoBadge etichetta={etichette[stato]} tono={toni[stato]} />
  }
  return (
    <select
      value={stato}
      aria-label={etichettaAria}
      onClick={(e) => e.stopPropagation()}
      // Invio e spazio scelgono nella tendina: non devono anche aprire la riga
      // che c'è sotto. Tutto il resto prosegue — fermando ogni tasto,
      // Cmd/Ctrl+K smetteva di funzionare quando il fuoco era su uno stato.
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
      }}
      onChange={(e) => onCambia(e.target.value as S)}
      // Sul telefono è un comando come gli altri: 44px. Sul monitor torna una
      // pill compatta, perché sta dentro le righe di una tabella densa.
      className={`min-h-[2.75rem] cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-semibold focus:ring-2 focus:ring-brand/40 md:min-h-0 ${TONI[toni[stato]]}`}
    >
      <option value={stato}>{etichette[stato]}</option>
      {ammessi.map((s) => (
        <option key={s} value={s}>
          {etichette[s]}
        </option>
      ))}
    </select>
  )
}
