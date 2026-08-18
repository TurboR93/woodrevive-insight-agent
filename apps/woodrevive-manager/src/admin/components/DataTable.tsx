import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Quanto conta una colonna quando lo schermo si stringe.
 *
 *   'principale'   → in cima alla card, in evidenza (titolo della riga)
 *   'secondaria'   → sotto, in coppia etichetta/valore
 *   'solo-tabella' → non compare nella card: è rumore su un telefono
 *   'azione'       → in fondo alla card, senza etichetta, a piena larghezza
 *
 * Dichiararla è facoltativo: le colonne che non lo fanno si comportano come
 * hanno sempre fatto (la prima è il titolo, le altre coppie etichetta/valore).
 */
export type PrioritaColonna = 'principale' | 'secondaria' | 'solo-tabella' | 'azione'

export interface Colonna<T> {
  chiave: string
  intestazione: ReactNode
  /** Contenuto della cella. */
  cella: (riga: T) => ReactNode
  allineamento?: 'sinistra' | 'destra' | 'centro'
  /** Classi aggiuntive sulla cella (es. `w-40`, `hidden md:table-cell`). */
  classe?: string
  /** Come si comporta la colonna sotto `md:`, dove la tabella diventa card. */
  priorita?: PrioritaColonna
  /**
   * Etichetta della coppia nella card, quando `intestazione` non è testo
   * (icone, `<span className="sr-only">`) o è troppo lunga per stare a sinistra.
   */
  etichettaCard?: ReactNode
}

const ALLINEA = {
  sinistra: 'text-left',
  destra: 'text-right',
  centro: 'text-center',
} as const

/**
 * Tabella generica. Ogni lista del pannello passa da qui, così spaziature,
 * bordi e stato vuoto non divergono da una pagina all'altra.
 *
 * **Cambia forma alla soglia `md:`**, e non è un compromesso fra i due usi:
 *   - da `md:` in su è la tabella densa di sempre, che scorre dentro il suo
 *     contenitore e mostra tutte le colonne;
 *   - sotto `md:` le stesse colonne diventano un elenco di card impilate, con
 *     la colonna principale come titolo e le altre in coppie etichetta/valore.
 *     Su un telefono nessuno scorre sette colonne di lato per leggere un
 *     residuo.
 *
 * La riga resta cliccabile e raggiungibile da tastiera in entrambe le forme.
 */
export default function DataTable<T>({
  righe,
  colonne,
  chiaveRiga,
  linkRiga,
  onClickRiga,
  messaggioVuoto = 'Nessun risultato.',
  classeRiga,
  card,
}: {
  righe: T[]
  colonne: Colonna<T>[]
  chiaveRiga: (riga: T) => string
  linkRiga?: (riga: T) => string
  onClickRiga?: (riga: T) => void
  messaggioVuoto?: ReactNode
  classeRiga?: (riga: T) => string
  /**
   * Card completamente su misura sotto `md:`, per le liste in cui le colonne
   * non bastano a raccontare la riga. Se manca, la card si costruisce dalle
   * colonne secondo la loro `priorita`.
   */
  card?: (riga: T) => ReactNode
}) {
  const navigate = useNavigate()
  const cliccabile = Boolean(linkRiga || onClickRiga)
  const apri = (riga: T) => (linkRiga ? navigate(linkRiga(riga)) : onClickRiga?.(riga))

  if (!righe.length) {
    return (
      <div className="card px-6 py-14 text-center">
        <p className="text-sm text-ink-mute">{messaggioVuoto}</p>
      </div>
    )
  }

  // Nessuna colonna dichiara la priorità: si applica il comportamento storico —
  // la prima colonna fa da titolo, le altre da coppie etichetta/valore.
  const dichiarate = colonne.some((c) => c.priorita)
  const prioritaDi = (c: Colonna<T>, i: number): PrioritaColonna =>
    c.priorita ?? (dichiarate ? 'secondaria' : i === 0 ? 'principale' : 'secondaria')

  const principali = colonne.filter((c, i) => prioritaDi(c, i) === 'principale')
  const secondarie = colonne.filter((c, i) => prioritaDi(c, i) === 'secondaria')
  const azioni = colonne.filter((c, i) => prioritaDi(c, i) === 'azione')

  const attributiRiga = (riga: T) => ({
    onClick: cliccabile ? () => apri(riga) : undefined,
    // La riga cliccabile deve essere raggiungibile anche da tastiera:
    // senza questo, l'unico modo di aprire il dettaglio è il mouse.
    tabIndex: cliccabile ? 0 : undefined,
    onKeyDown: cliccabile
      ? (e: React.KeyboardEvent) => {
          if (e.target !== e.currentTarget) return
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          apri(riga)
        }
      : undefined,
  })

  return (
    <>
      {/* ── da md: in su — la tabella densa ──────────────────────────────── */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-tint/25">
              {colonne.map((c) => (
                <th
                  key={c.chiave}
                  scope="col"
                  className={[
                    'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-mute',
                    ALLINEA[c.allineamento ?? 'sinistra'],
                    c.classe ?? '',
                  ].join(' ')}
                >
                  {c.intestazione}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righe.map((riga) => (
              <tr
                key={chiaveRiga(riga)}
                {...attributiRiga(riga)}
                className={[
                  'border-b border-line/60 last:border-0 transition-colors',
                  cliccabile ? 'cursor-pointer hover:bg-tint/30' : '',
                  classeRiga?.(riga) ?? '',
                ].join(' ')}
              >
                {colonne.map((c) => (
                  <td
                    key={c.chiave}
                    className={[
                      'px-4 py-3 align-middle',
                      ALLINEA[c.allineamento ?? 'sinistra'],
                      c.classe ?? '',
                    ].join(' ')}
                  >
                    {c.cella(riga)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── sotto md: — le stesse colonne, impilate in card ──────────────── */}
      <ul className="space-y-3 md:hidden">
        {righe.map((riga) => (
          <li
            key={chiaveRiga(riga)}
            {...attributiRiga(riga)}
            className={[
              'card px-4 py-3 transition-colors',
              cliccabile ? 'cursor-pointer active:bg-tint/30' : '',
              classeRiga?.(riga) ?? '',
            ].join(' ')}
          >
            {card ? (
              card(riga)
            ) : (
              <>
                {principali.map((c) => (
                  <div key={c.chiave} className="mb-2 text-sm font-medium text-ink">
                    {c.cella(riga)}
                  </div>
                ))}

                {Boolean(secondarie.length) && (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    {secondarie.map((c) => (
                      <div key={c.chiave} className="min-w-0">
                        <dt className="label truncate">{c.etichettaCard ?? c.intestazione}</dt>
                        <dd className="mt-0.5 text-ink">{c.cella(riga)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {Boolean(azioni.length) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    {azioni.map((c) => (
                      <div key={c.chiave} className="flex-1">
                        {c.cella(riga)}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

/** Cella su due righe: valore in evidenza e dettaglio sotto. */
export function CellaDoppia({ principale, secondario }: { principale: ReactNode; secondario?: ReactNode }) {
  return (
    <div className="leading-tight">
      <div className="font-medium text-ink">{principale}</div>
      {secondario && <div className="mt-0.5 text-xs text-ink-mute">{secondario}</div>}
    </div>
  )
}
