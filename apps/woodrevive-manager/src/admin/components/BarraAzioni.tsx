import type { LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

/**
 * Le azioni di una schermata, dichiarate una volta e rese in due forme.
 *
 * È la risposta alla tensione fra i due modi in cui questo gestionale si usa,
 * senza il compromesso mediocre che scontenterebbe entrambi:
 *   - da `md:` in su le azioni stanno IN ALTO, dentro `IntestazionePagina`,
 *     compatte: in ufficio si vuole tutto visibile senza scrollare;
 *   - sotto `md:` diventano una barra FISSA IN FONDO, bersagli da 44px e
 *     azione principale a piena larghezza in zona pollice: in magazzino si
 *     tiene il telefono con una mano sola.
 *
 * Il motivo per cui un comando è disabilitato si scrive SOTTO il comando, non
 * in un `title=`: su un telefono l'hover non esiste e un bottone spento e muto
 * è un vicolo cieco.
 *
 * Uso:
 *   <IntestazionePagina titolo="…" azioni={<BarraAzioni azioni={azioni} />} />
 *
 * Chi la usa: PreventivoNuovoPage, PreventivoDettaglioPage, OrdineDettaglioPage,
 * DdtDettaglioPage, AcquistoNuovoPage, AcquistoDettaglioPage.
 */

export interface AzionePagina {
  chiave: string
  etichetta: string
  icona?: LucideIcon
  /** Uno dei due: `onClick` per un comando, `a` per una destinazione. */
  onClick?: () => void
  a?: string
  tono?: 'primario' | 'secondario' | 'fantasma' | 'pericolo'
  disabilitata?: boolean
  /** Perché non si può fare. Compare sotto il comando, non in un `title=`. */
  motivo?: string
  inCorso?: boolean
  /** Azione marginale: resta in alto, fuori dalla barra del telefono. */
  soloDesktop?: boolean
  /** Etichetta più corta per la barra in fondo, dove lo spazio è quello che è. */
  etichettaBreve?: string
}

const CLASSE_TONO = {
  primario: 'btn-primary',
  secondario: 'btn-secondary',
  fantasma: 'btn-ghost',
  pericolo: 'btn-danger',
} as const

function Comando({
  azione,
  className = '',
  breve = false,
}: {
  azione: AzionePagina
  className?: string
  breve?: boolean
}) {
  const { icona: Icona, tono = 'secondario', disabilitata, inCorso } = azione
  const classe = `${CLASSE_TONO[tono]} ${className}`
  const testo = inCorso ? 'Attendi…' : breve ? (azione.etichettaBreve ?? azione.etichetta) : azione.etichetta
  const contenuto = (
    <>
      {Icona && <Icona size={16} strokeWidth={1.9} />}
      {testo}
    </>
  )

  if (azione.a && !disabilitata && !inCorso) {
    return (
      <Link to={azione.a} className={classe}>
        {contenuto}
      </Link>
    )
  }
  return (
    <button
      type="button"
      className={classe}
      onClick={azione.onClick}
      disabled={disabilitata || inCorso}
      aria-describedby={azione.motivo ? `${azione.chiave}-motivo` : undefined}
    >
      {contenuto}
    </button>
  )
}

export default function BarraAzioni({
  azioni,
  className = '',
}: {
  azioni: AzionePagina[]
  className?: string
}) {
  // La barra fissa copre il fondo della pagina: lo spazio va restituito al
  // contenuto, altrimenti l'ultima riga resta sotto i bottoni. Si fa qui e non
  // con un div segnaposto perché la barra si dichiara in cima alla pagina.
  useEffect(() => {
    document.body.classList.add('con-barra-azioni')
    return () => document.body.classList.remove('con-barra-azioni')
  }, [])

  const inFondo = azioni.filter((a) => !a.soloDesktop)
  const primaria = inFondo.find((a) => a.tono === 'primario') ?? inFondo[0]
  const altre = inFondo.filter((a) => a !== primaria)
  const motivi = azioni.filter((a) => a.disabilitata && a.motivo)

  return (
    <>
      {/* ── da md: in su — in alto, dentro l'intestazione ─────────────────── */}
      <div className={`hidden flex-wrap items-center gap-2 md:flex ${className}`}>
        {azioni.map((a) => (
          <Comando key={a.chiave} azione={a} />
        ))}
        {motivi.map((a) => (
          <p key={`${a.chiave}-motivo`} id={`${a.chiave}-motivo`} className="w-full text-xs text-warn">
            {a.motivo}
          </p>
        ))}
      </div>

      {/* ── sotto md: — barra fissa in fondo, zona pollice ────────────────── */}
      <div className="no-stampa zona-sicura-fondo fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur md:hidden">
        {Boolean(motivi.length) && (
          <p className="mb-2 text-xs text-warn">{motivi.map((a) => a.motivo).join(' · ')}</p>
        )}
        <div className="flex items-center gap-2">
          {altre.map((a) => (
            <Comando key={a.chiave} azione={a} className="shrink-0" breve />
          ))}
          {primaria && <Comando azione={primaria} className="flex-1" />}
        </div>
      </div>
    </>
  )
}
