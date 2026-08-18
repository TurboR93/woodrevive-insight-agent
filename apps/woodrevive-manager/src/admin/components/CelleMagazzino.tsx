import { quantitaConSegno, type MovimentoMagazzino, type TonoStato } from '../domain'
import { formatQuantita } from '../lib/format'

/* ==========================================================================
   Celle e indicatori di magazzino condivisi fra l'elenco dei movimenti, la
   lista dei lotti e la scheda del lotto. Stavano scritti due volte per pezzo,
   con differenze silenziose (una versione aveva l'aria-label, l'altra no).
   ========================================================================== */

/** Tono della pill per il tipo di movimento: carico verde, scarico rosso, rettifica neutra. */
export const TONO_MOVIMENTO: Record<MovimentoMagazzino['tipo'], TonoStato> = {
  carico: 'ok',
  scarico: 'danger',
  rettifica: 'info',
}

/**
 * Quantità di un movimento con il segno davanti: `+ 12,5 m³` in verde per un
 * carico, `− 3 m³` in rosso per uno scarico. Il segno è il meno tipografico
 * (−), non il trattino: incolonnato con le cifre tabulari resta allineato.
 */
export function QuantitaFirmata({ movimento }: { movimento: MovimentoMagazzino }) {
  const q = quantitaConSegno(movimento)
  const segno = q > 0 ? '+' : q < 0 ? '−' : ''
  const tono = q > 0 ? 'text-ok' : q < 0 ? 'text-danger' : 'text-ink-soft'
  return (
    <span className={`tabular font-semibold ${tono}`}>
      {segno}
      {formatQuantita(Math.abs(q), movimento.unita_misura)}
    </span>
  )
}
