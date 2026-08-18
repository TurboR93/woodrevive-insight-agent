import { forwardRef, useCallback } from 'react'

import { api } from '../api'
import {
  TIPO_FORNITORE_LABEL,
  type ClienteConTotali,
  type FornitoreConTotali,
} from '../domain'
import { formatPercentuale } from '../lib/format'
import SelettoreRicerca, { type ManiglieSelettore } from './SelettoreRicerca'

/**
 * Ricerca di un cliente o di un fornitore da tastiera: tre lettere della
 * ragione sociale, del codice o della città, poi Invio.
 *
 * Sostituisce le `<select>` con tutta l'anagrafica dentro e, soprattutto, lo
 * schermo «Carico i clienti…» che oggi copre l'intero form finché la lista non
 * è arrivata: qui il campo c'è subito, e si interroga solo quello che serve —
 * `api.listaClienti` e `api.listaFornitori` filtrano già su `q`.
 *
 * Il valore è l'OGGETTO, non l'id: chi sceglie un cliente ha quasi sempre
 * bisogno anche del suo sconto di default, dell'aliquota e dell'indirizzo di
 * consegna, e farglielo ricaricare sarebbe una chiamata in più per un dato che
 * il selettore ha già in mano. Quando il cliente arriva da fuori (per esempio
 * `/preventivi/nuovo?cliente=<id>`), la pagina lo risolve una volta con
 * `api.cliente(id)` e lo passa qui dentro.
 *
 * Chi lo usa: PreventivoNuovoPage, PreventivoDettaglioPage, FormIncasso,
 * AcquistoNuovoPage, AcquistoDettaglioPage, filtro cliente di IncassiPage.
 */

interface PropsComuni {
  autoFocus?: boolean
  disabilitato?: boolean
  segnaposto?: string
  massimo?: number
  id?: string
  className?: string
  etichettaAria?: string
  /** Se `false` la X non compare: la scelta è obbligatoria. Default `true`. */
  cancellabile?: boolean
}

/** Riga comune: ragione sociale sopra, codice e città sotto, nota a destra. */
function VoceAnagrafica({
  ragioneSociale,
  codice,
  citta,
  provincia,
  nota,
}: {
  ragioneSociale: string
  codice: string
  citta: string | null
  provincia: string | null
  nota?: string | null
}) {
  const luogo = [citta, provincia ? `(${provincia})` : null].filter(Boolean).join(' ')
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">{ragioneSociale}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-mute">
          <span className="tabular">{codice}</span>
          {luogo && ` · ${luogo}`}
        </span>
      </span>
      {nota && <span className="shrink-0 text-right text-xs text-ink-mute">{nota}</span>}
    </>
  )
}

export const SelettoreCliente = forwardRef<
  ManiglieSelettore,
  PropsComuni & {
    valore: ClienteConTotali | null
    onScegli: (cliente: ClienteConTotali | null) => void
  }
>(function SelettoreCliente(
  {
    valore,
    onScegli,
    autoFocus,
    disabilitato,
    segnaposto = 'Cerca un cliente…',
    massimo = 8,
    id,
    className,
    etichettaAria = 'Cliente',
    cancellabile = true,
  },
  ref,
) {
  const cerca = useCallback((q: string) => api.listaClienti({ q: q || undefined }), [])
  return (
    <SelettoreRicerca<ClienteConTotali>
      ref={ref}
      cerca={cerca}
      chiave={(c) => c.id}
      riga={(c) => (
        <VoceAnagrafica
          ragioneSociale={c.ragione_sociale}
          codice={c.codice}
          citta={c.citta}
          provincia={c.provincia}
          nota={
            c.sconto_default_percentuale > 0
              ? `sconto ${formatPercentuale(c.sconto_default_percentuale, 0)}`
              : null
          }
        />
      )}
      onScegli={onScegli}
      scelto={valore ? valore.ragione_sociale : null}
      onPulisci={cancellabile ? () => onScegli(null) : undefined}
      segnaposto={segnaposto}
      autoFocus={autoFocus}
      disabilitato={disabilitato}
      etichettaAria={etichettaAria}
      massimo={massimo}
      id={id}
      className={className}
      nessunRisultato="Nessun cliente con questo nome, codice o città."
    />
  )
})

export const SelettoreFornitore = forwardRef<
  ManiglieSelettore,
  PropsComuni & {
    valore: FornitoreConTotali | null
    onScegli: (fornitore: FornitoreConTotali | null) => void
  }
>(function SelettoreFornitore(
  {
    valore,
    onScegli,
    autoFocus,
    disabilitato,
    segnaposto = 'Cerca un fornitore…',
    massimo = 8,
    id,
    className,
    etichettaAria = 'Fornitore',
    cancellabile = true,
  },
  ref,
) {
  const cerca = useCallback((q: string) => api.listaFornitori({ q: q || undefined }), [])
  return (
    <SelettoreRicerca<FornitoreConTotali>
      ref={ref}
      cerca={cerca}
      chiave={(f) => f.id}
      riga={(f) => (
        <VoceAnagrafica
          ragioneSociale={f.ragione_sociale}
          codice={f.codice}
          citta={f.citta}
          provincia={f.provincia}
          nota={TIPO_FORNITORE_LABEL[f.tipo]}
        />
      )}
      onScegli={onScegli}
      scelto={valore ? valore.ragione_sociale : null}
      onPulisci={cancellabile ? () => onScegli(null) : undefined}
      segnaposto={segnaposto}
      autoFocus={autoFocus}
      disabilitato={disabilitato}
      etichettaAria={etichettaAria}
      massimo={massimo}
      id={id}
      className={className}
      nessunRisultato="Nessun fornitore con questo nome, codice o città."
    />
  )
})
