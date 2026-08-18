import { Layers } from 'lucide-react'

import type { ID, UnitaMisura, VoceLottoDisponibile } from '../domain'
import { proponiLottoFifo } from '../domain'
import { formatData, formatQuantita } from '../lib/format'

/**
 * Selettore della partita di prelievo per una riga di DDT.
 *
 * Mostra il residuo di ogni partita accanto al codice: senza quel numero
 * l'operatore sceglierebbe a memoria e scoprirebbe di aver sbagliato solo al
 * momento dell'emissione. Se la partita scelta non basta per la quantità della
 * riga lo dice subito — è lo stesso controllo che farà `emettiDdt`, anticipato.
 *
 * In più rispetto alla versione che stava dentro DdtDettaglioPage: marca la
 * partita PROPOSTA dal FIFO (la più vecchia con residuo sufficiente) e, se la
 * riga non ha ancora una provenienza, offre un comando per accettarla con un
 * tocco. Non la sceglie da sola: la proposta arriva già scritta sulla riga da
 * `creaDdtDaOrdine(ordineId, lottiProposti)`, qui si tratta solo di cambiarla.
 *
 * La regola della proposta è `proponiLottoFifo` in `domain/magazzino.ts`: qui
 * si applica solo come ripiego, quando il chiamante non passa `propostoId`.
 *
 * Perché una `<select>` nativa e non il typeahead degli articoli: le partite di
 * un articolo sono poche (tre, cinque) e in magazzino, con una mano occupata,
 * la ruota nativa del telefono è il comando più veloce che esista.
 *
 * Chi lo usa: DdtDettaglioPage (tabella da `md:` in su e card sotto).
 */

export default function SelettoreLotto({
  valore,
  codiceValore,
  disponibili,
  quantitaRichiestaMilli,
  unitaMisura,
  onScegli,
  propostoId,
  disabilitato,
  className = '',
}: {
  /** Lotto attualmente sulla riga. */
  valore: ID | null
  /** Codice congelato sulla riga: serve se la partita non ha più residuo. */
  codiceValore: string | null
  /** Partite con residuo per QUESTO articolo, in ordine FIFO. */
  disponibili: VoceLottoDisponibile[]
  quantitaRichiestaMilli: number
  unitaMisura: UnitaMisura
  /** `null` = nessuna partita dichiarata (la tracciabilità si perde: sconsigliato). */
  onScegli: (lotto: VoceLottoDisponibile | null) => void
  /** Partita proposta dal FIFO. Se non arriva, la calcola questo componente. */
  propostoId?: ID | null
  disabilitato?: boolean
  className?: string
}) {
  const scelto = disponibili.find((l) => l.lotto_id === valore)
  const insufficiente = Boolean(scelto && quantitaRichiestaMilli > scelto.residuo_milli)

  const propostoCalcolato = proponiLottoFifo(disponibili, quantitaRichiestaMilli)
  const proposto =
    propostoId !== undefined
      ? (disponibili.find((l) => l.lotto_id === propostoId) ?? null)
      : propostoCalcolato

  return (
    <div className={`min-w-[13rem] ${className}`}>
      <select
        className="input w-full px-2 py-1.5"
        value={valore ?? ''}
        disabled={disabilitato}
        aria-label="Lotto di prelievo"
        onChange={(e) => {
          const lotto = disponibili.find((l) => l.lotto_id === e.target.value)
          onScegli(lotto ?? null)
        }}
      >
        <option value="">Senza partita dichiarata</option>
        {/* La partita già scritta sulla riga resta scegliibile anche se non ha
            più residuo: toglierla dalla lista la cancellerebbe in silenzio. */}
        {valore && !scelto && <option value={valore}>{codiceValore ?? 'Partita esaurita'}</option>}
        {disponibili.map((l) => (
          <option key={l.lotto_id} value={l.lotto_id}>
            {l.codice} — {l.descrizione} · {formatQuantita(l.residuo_milli, unitaMisura)}
            {l.lotto_id === proposto?.lotto_id ? ' · proposta' : ''}
          </option>
        ))}
      </select>

      {scelto?.provenienza && (
        <p className="mt-1 truncate text-xs text-ink-mute">{scelto.provenienza}</p>
      )}

      {scelto && !insufficiente && (
        <p className="tabular mt-0.5 text-xs text-ink-mute">
          Restano {formatQuantita(scelto.residuo_milli, unitaMisura)}
          {scelto.data_acquisto ? ` · partita del ${formatData(scelto.data_acquisto)}` : ''}
        </p>
      )}

      {insufficiente && (
        <p className="mt-1 text-xs text-warn">
          Restano {formatQuantita(scelto!.residuo_milli, unitaMisura)}: non bastano. Scegli
          un’altra partita o dividi la riga.
        </p>
      )}

      {/* Nessuna provenienza sulla riga: il movimento nascerebbe senza origine e
          la tracciabilità si perderebbe in silenzio. Un tocco per rimediare. */}
      {!valore && proposto && !disabilitato && (
        <button
          type="button"
          className="btn-ghost mt-1 h-auto min-h-0 px-2 py-1 text-xs"
          onClick={() => onScegli(proposto)}
        >
          <Layers size={13} />
          Usa {proposto.codice} — la più vecchia con disponibilità
        </button>
      )}

      {!disponibili.length && !valore && (
        <p className="mt-1 text-xs text-ink-mute">
          Nessuna partita con residuo per questo articolo.
        </p>
      )}
    </div>
  )
}
