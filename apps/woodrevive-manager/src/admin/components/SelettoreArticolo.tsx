import { forwardRef, useCallback } from 'react'

import { api } from '../api'
import { disponibile, type Articolo } from '../domain'
import { formatEuro, formatQuantita } from '../lib/format'
import SelettoreRicerca, { type ManiglieSelettore } from './SelettoreRicerca'

/**
 * Ricerca di un articolo da tastiera: tre lettere del codice o del nome e
 * Invio. Sostituisce le `<select>` con l'intero catalogo dentro, che erano il
 * passaggio più lento di ogni documento.
 *
 * Ogni voce mostra i due numeri che servono per decidere: **prezzo di listino**
 * e **disponibilità**. La disponibilità a zero si legge in `text-danger` ma non
 * impedisce la scelta — un preventivo si fa anche sulla merce da ordinare, e
 * bloccarlo qui vorrebbe dire perdere la vendita per un vincolo che il mestiere
 * non ha.
 *
 * Due modi d'uso, due componenti:
 *   - `SelettoreArticolo`  — selettore singolo: tiene la scelta, ha la X per
 *     toglierla (la riga torna libera). Usato dalla riga di un documento.
 *   - `AggiungiArticolo`   — campo che AGGIUNGE: dopo Invio si svuota e resta a
 *     fuoco, così si incolonnano dieci righe senza toccare il mouse.
 *
 * Chi lo usa: RigheDocumento (riga per riga e in testata), PreventivoNuovoPage,
 * AcquistoNuovoPage, AcquistoDettaglioPage.
 *
 * Entrambi accettano un `ref` con {@link ManiglieSelettore}: `focus()` è come
 * si passa il fuoco da un campo al successivo.
 */

interface PropsComuni {
  autoFocus?: boolean
  disabilitato?: boolean
  segnaposto?: string
  /** Fuori catalogo non si vende: default `true`. */
  soloAttivi?: boolean
  massimo?: number
  id?: string
  className?: string
  etichettaAria?: string
}

function useCercaArticoli(soloAttivi: boolean) {
  return useCallback(
    (q: string) => api.listaArticoli({ q: q || undefined, soloAttivi }),
    [soloAttivi],
  )
}

/** Riga dell'elenco: codice e nome a sinistra, prezzo e disponibilità a destra. */
function VoceArticolo({ a }: { a: Articolo }) {
  const disp = disponibile(a)
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">
          <span className="tabular text-ink-soft">{a.codice}</span> — {a.nome}
        </span>
        {a.descrizione && (
          <span className="mt-0.5 block truncate text-xs text-ink-mute">{a.descrizione}</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="tabular block text-sm text-ink">{formatEuro(a.prezzo_listino_cents)}</span>
        <span
          className={`tabular block text-xs ${disp > 0 ? 'text-ink-mute' : 'text-danger'}`}
          title={disp > 0 ? 'Disponibile' : 'Nessuna disponibilità: si può comunque preventivare'}
        >
          {disp > 0 ? formatQuantita(disp, a.unita_misura) : 'non disponibile'}
        </span>
      </span>
    </>
  )
}

/** Selettore singolo: tiene la scelta finché non la si toglie. */
const SelettoreArticolo = forwardRef<
  ManiglieSelettore,
  PropsComuni & {
    valore: Articolo | null
    /** `null` = la riga torna libera, digitata a mano. */
    onScegli: (articolo: Articolo | null) => void
    /**
     * Cosa scrivere nel campo quando l'articolo scelto non è (più) a catalogo:
     * lo snapshot sulla riga resta leggibile invece di sparire.
     */
    etichettaValore?: string | null
  }
>(function SelettoreArticolo(
  {
    valore,
    onScegli,
    etichettaValore,
    autoFocus,
    disabilitato,
    segnaposto = 'Cerca un articolo…',
    soloAttivi = true,
    massimo = 8,
    id,
    className,
    etichettaAria = 'Articolo',
  },
  ref,
) {
  const cerca = useCercaArticoli(soloAttivi)
  return (
    <SelettoreRicerca<Articolo>
      ref={ref}
      cerca={cerca}
      chiave={(a) => a.id}
      riga={(a) => <VoceArticolo a={a} />}
      onScegli={onScegli}
      scelto={valore ? `${valore.codice} — ${valore.nome}` : (etichettaValore ?? null)}
      onPulisci={() => onScegli(null)}
      segnaposto={segnaposto}
      autoFocus={autoFocus}
      disabilitato={disabilitato}
      etichettaAria={etichettaAria}
      massimo={massimo}
      id={id}
      className={className}
      nessunRisultato="Nessun articolo con questo nome o codice."
    />
  )
})

export default SelettoreArticolo

/**
 * Campo che aggiunge una riga e si rimette a fuoco da solo.
 * È il ciclo «Invio → riga aggiunta → di nuovo pronto» su cui si regge la
 * creazione rapida di un documento.
 */
export const AggiungiArticolo = forwardRef<
  ManiglieSelettore,
  PropsComuni & { onAggiungi: (articolo: Articolo) => void }
>(function AggiungiArticolo(
  {
    onAggiungi,
    autoFocus,
    disabilitato,
    segnaposto = 'Aggiungi un articolo: codice o nome, poi Invio…',
    soloAttivi = true,
    massimo = 8,
    id,
    className,
    etichettaAria = 'Aggiungi un articolo',
  },
  ref,
) {
  const cerca = useCercaArticoli(soloAttivi)
  return (
    <SelettoreRicerca<Articolo>
      ref={ref}
      cerca={cerca}
      chiave={(a) => a.id}
      riga={(a) => <VoceArticolo a={a} />}
      onScegli={onAggiungi}
      mantieniFuoco
      segnaposto={segnaposto}
      autoFocus={autoFocus}
      disabilitato={disabilitato}
      etichettaAria={etichettaAria}
      massimo={massimo}
      id={id}
      className={className}
      nessunRisultato="Nessun articolo con questo nome o codice."
      notaElenco="Prezzo di listino e disponibilità. Invio aggiunge la riga."
    />
  )
})
