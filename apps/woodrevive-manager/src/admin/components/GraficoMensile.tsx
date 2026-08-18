import { formatEuro, formatMese } from '../lib/format'

/**
 * Grafico a barre affiancate: venduto e acquistato, mese per mese.
 *
 * Scritto a mano con div e classi Tailwind, senza librerie di grafici: una
 * dipendenza da 40 kB per dodici coppie di barre non si giustifica, e ogni
 * libreria di grafici porta con sé la propria palette da riportare ai token del
 * design system (vedi docs/design-system.md §1).
 *
 * L'asse verticale è implicito: non ci sono tacche né griglia, solo la linea di
 * base e il massimo dichiarato in legenda. Con dodici mesi affiancati il valore
 * assoluto della singola barra si legge dal tooltip (`title`), la forma
 * dell'andamento si legge a colpo d'occhio — che è l'unica cosa che serve
 * davvero in una panoramica.
 */

export interface PuntoMensile {
  /** Primo giorno del mese, ISO `YYYY-MM-DD`. */
  mese: string
  venduto_cents: number
  acquistato_cents: number
}

/** Altezza minima di una barra non nulla, in percentuale: un valore piccolo ma
 *  esistente deve restare visibile, altrimenti "poco" e "niente" si confondono. */
const MINIMA_VISIBILE = 2

export default function GraficoMensile({ dati }: { dati: PuntoMensile[] }) {
  const massimo = dati.reduce(
    (m, p) => Math.max(m, p.venduto_cents, p.acquistato_cents),
    0,
  )
  // Tutti i mesi a zero è un caso normale (azienda nuova, DB appena ripristinato):
  // si disegna il grafico vuoto, non si divide per zero.
  const vuoto = massimo <= 0

  const altezza = (cents: number): string => {
    if (vuoto || cents <= 0) return '0%'
    return `${Math.max(MINIMA_VISIBILE, (cents / massimo) * 100)}%`
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-4 text-xs text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand" aria-hidden="true" />
            Venduto
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-clay" aria-hidden="true" />
            Acquistato
          </span>
        </div>
        <p className="tabular text-xs text-ink-mute">
          {vuoto ? 'Nessun importo nel periodo' : `Massimo mensile ${formatEuro(massimo)}`}
        </p>
      </div>

      <div
        className="flex h-40 items-end gap-1 border-b border-line sm:h-48"
        role="img"
        aria-label="Venduto e acquistato degli ultimi dodici mesi"
      >
        {dati.map((p) => (
          <div
            key={p.mese}
            className="flex h-full flex-1 items-end justify-center gap-0.5"
            title={`${formatMese(p.mese)} — venduto ${formatEuro(p.venduto_cents)}, acquistato ${formatEuro(p.acquistato_cents)}`}
          >
            <div
              className="w-1/2 max-w-[15px] rounded-t-sm bg-brand"
              style={{ height: altezza(p.venduto_cents) }}
            />
            <div
              className="w-1/2 max-w-[15px] rounded-t-sm bg-clay"
              style={{ height: altezza(p.acquistato_cents) }}
            />
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1">
        {dati.map((p, i) => {
          const [mese, anno] = formatMese(p.mese).split(' ')
          // L'anno si stampa solo quando cambia: dodici "2026" sotto le barre
          // sono rumore, ma a cavallo di dicembre serve sapere dove si è.
          const cambioAnno = i === 0 || formatMese(dati[i - 1].mese).split(' ')[1] !== anno
          return (
            <p
              key={p.mese}
              className="flex-1 text-center text-[0.65rem] leading-tight text-ink-mute"
            >
              {mese}
              {cambioAnno && anno && (
                <span className="tabular block opacity-70">{anno}</span>
              )}
            </p>
          )
        })}
      </div>
    </div>
  )
}
