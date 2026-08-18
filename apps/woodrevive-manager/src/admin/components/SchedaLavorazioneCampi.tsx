import { api } from '../api'
import {
  ESSENZA_LABEL,
  TIPOLOGIA_SCHEDA_LABEL,
  TIPOLOGIE_SCHEDA,
  UM_LABEL,
  type Articolo,
  type Essenza,
  type FornitoreConTotali,
  type TipologiaScheda,
  type UnitaMisura,
} from '../domain'
import { inputAMilli, milliAInput } from '../lib/qty'
import { useFetch } from '../useFetch'
import { AreaTesto, Campo, GrigliaCampi, Scelta, Testo } from './Campi'
import { CellaNumerica } from './RigheDocumento'
import { SelettoreFornitore } from './SelettoreAnagrafica'
import SelettoreArticolo from './SelettoreArticolo'
import { Card } from './Ui'

/**
 * I campi della scheda di lavorazione, condivisi fra creazione e dettaglio.
 *
 * È un form dedicato a UNA entità piatta, non un CRUD generico: la scheda non
 * ha righe né importi, quindi niente `RigheDocumento` e niente editor di righe.
 * La struttura ricalca il modulo cartaceo (mat_cliente/): testata, tipologie a
 * checkbox, specifiche del materiale, lavorazioni richieste, annotazioni.
 */

/** I campi che il form tocca: il sottoinsieme comune a Input ed entità. */
export interface ValoriScheda {
  data: string
  committente: string
  telefono: string | null
  data_consegna: string | null
  articolo_id: string | null
  fornitore_id: string | null
  tipologie: TipologiaScheda[]
  essenza: Essenza | null
  larghezza_da_mm: number | null
  larghezza_a_mm: number | null
  lunghezza_da_mm: number | null
  lunghezza_a_mm: number | null
  spessore_mm: number | null
  spazzolatura: string | null
  stucco_colore: string | null
  bordo_frontale: string | null
  finitura: string | null
  quantita_milli: number | null
  unita_misura: UnitaMisura | null
  annotazioni: string | null
}

/**
 * Cosa un articolo a catalogo suggerisce alla scheda. La precompilazione
 * scrive lo stato iniziale dei campi e nient'altro: tutto resta modificabile,
 * come le righe di un preventivo dopo la scelta dell'articolo.
 */
export function precompilaDaArticolo(a: Articolo): Partial<ValoriScheda> {
  return {
    articolo_id: a.id,
    essenza: a.essenza,
    spessore_mm: a.spessore_mm,
    larghezza_da_mm: a.larghezza_min_mm,
    larghezza_a_mm: a.larghezza_max_mm,
    lunghezza_da_mm: a.lunghezza_min_mm,
    lunghezza_a_mm: a.lunghezza_max_mm,
    unita_misura: a.unita_misura,
    // «piani» non si mappa mai da catalogo: è un impiego, non una categoria.
    tipologie:
      a.categoria === 'pavimento'
        ? ['pavimenti']
        : a.categoria === 'rivestimento'
          ? ['rivestimenti']
          : a.categoria === 'mobile'
            ? ['mobili']
            : [],
  }
}

/** Campo misura in mm interi: vuoto = non specificato, come sul cartaceo. */
function CampoMm({
  valore,
  onCambia,
  disabilitato,
  etichettaAria,
}: {
  valore: number | null
  onCambia: (v: number | null) => void
  disabilitato?: boolean
  etichettaAria: string
}) {
  return (
    <Testo
      valore={valore === null ? '' : String(valore)}
      onCambia={(v) => {
        const n = Math.round(Number(v))
        onCambia(v.trim() === '' || !Number.isFinite(n) ? null : Math.max(0, n))
      }}
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      placeholder="—"
      aria-label={etichettaAria}
      disabled={disabilitato}
    />
  )
}

export default function SchedaLavorazioneCampi({
  valori,
  imposta,
  fornitore,
  onFornitore,
  disabilitato = false,
}: {
  valori: ValoriScheda
  imposta: (patch: Partial<ValoriScheda>) => void
  /** Il fornitore risolto, per il selettore. Le pagine lo tengono in stato. */
  fornitore: FornitoreConTotali | null
  onFornitore: (f: FornitoreConTotali | null) => void
  disabilitato?: boolean
}) {
  // L'articolo di provenienza si risolve qui: serve solo per mostrare nel
  // selettore cosa ha precompilato la scheda, e sparisce se è stato eliminato.
  const { dati: articolo } = useFetch(
    () => (valori.articolo_id ? api.articolo(valori.articolo_id) : Promise.resolve(null)),
    [valori.articolo_id],
  )

  const alternaTipologia = (t: TipologiaScheda) =>
    imposta({
      tipologie: valori.tipologie.includes(t)
        ? valori.tipologie.filter((x) => x !== t)
        : [...valori.tipologie, t],
    })

  return (
    <>
      {/* ── Testata: il riquadro in alto del modulo ───────────────────────── */}
      <Card titolo="Committente e consegna" className="mb-4">
        <GrigliaCampi colonne={2}>
          <Campo
            etichetta="Committente"
            obbligatorio
            aiuto="Chi ha chiesto il materiale. È un nome scritto, non un collegamento: può non essere in anagrafica."
          >
            <Testo
              valore={valori.committente}
              onCambia={(v) => imposta({ committente: v })}
              placeholder="Impresa, studio o privato"
              disabled={disabilitato}
            />
          </Campo>

          <Campo etichetta="Telefono" aiuto="Il recapito che il fornitore chiama per chiarire.">
            <Testo
              valore={valori.telefono ?? ''}
              // Si conserva il testo grezzo (gli spazi di «351 371 8645» devono
              // restare mentre si digita); null solo quando è vuoto o tutto spazi.
              onCambia={(v) => imposta({ telefono: v.trim() ? v : null })}
              type="tel"
              disabled={disabilitato}
            />
          </Campo>

          <Campo etichetta="Data">
            <Testo
              valore={valori.data}
              onCambia={(v) => imposta({ data: v })}
              type="date"
              disabled={disabilitato}
            />
          </Campo>

          <Campo etichetta="Consegna richiesta">
            <Testo
              valore={valori.data_consegna ?? ''}
              onCambia={(v) => imposta({ data_consegna: v || null })}
              type="date"
              disabled={disabilitato}
            />
          </Campo>

          <Campo
            etichetta="Fornitore"
            className="md:col-span-2"
            aiuto="A chi va la scheda. Si può lasciare vuoto e stampare lo stesso, se il fornitore non è ancora deciso."
          >
            <SelettoreFornitore
              valore={fornitore}
              onScegli={onFornitore}
              disabilitato={disabilitato}
            />
          </Campo>
        </GrigliaCampi>
      </Card>

      {/* ── Tipologie: le checkbox del modulo ─────────────────────────────── */}
      <Card titolo="Tipologia" className="mb-4">
        <p className="mb-3 text-xs text-ink-mute">
          A cosa è destinato il materiale. Si può segnare più di una voce.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {TIPOLOGIE_SCHEDA.map((t) => (
            <label key={t} className="flex min-h-[2.75rem] cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={valori.tipologie.includes(t)}
                onChange={() => alternaTipologia(t)}
                disabled={disabilitato}
              />
              <span className="text-sm text-ink">{TIPOLOGIA_SCHEDA_LABEL[t]}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* ── Specifiche del materiale ──────────────────────────────────────── */}
      <Card titolo="Specifiche del materiale" className="mb-4">
        <GrigliaCampi colonne={2}>
          <Campo
            etichetta="Precompila da un articolo"
            className="md:col-span-2"
            aiuto="Essenza, spessore e forbici di misura arrivano dal catalogo. Poi si corregge tutto a mano."
          >
            <SelettoreArticolo
              valore={articolo ?? null}
              onScegli={(a) =>
                a ? imposta(precompilaDaArticolo(a)) : imposta({ articolo_id: null })
              }
              disabilitato={disabilitato}
            />
          </Campo>

          <Campo etichetta="Essenza">
            <Scelta<Essenza>
              valore={valori.essenza ?? ''}
              // `|| null`: l'opzione vuota della select produce '', che non è
              // un'Essenza e non deve finire persistita (pattern di ListinoPage).
              onCambia={(v) => imposta({ essenza: v || null })}
              opzioni={Object.entries(ESSENZA_LABEL).map(([valore, etichetta]) => ({
                valore: valore as Essenza,
                etichetta,
              }))}
              vuoto="Non specificata"
              disabled={disabilitato}
            />
          </Campo>

          <Campo etichetta="Spessore (mm)">
            <CampoMm
              valore={valori.spessore_mm}
              onCambia={(v) => imposta({ spessore_mm: v })}
              disabilitato={disabilitato}
              etichettaAria="Spessore in millimetri"
            />
          </Campo>

          <Campo etichetta="Larghezza da / a (mm)">
            <div className="grid grid-cols-2 gap-2">
              <CampoMm
                valore={valori.larghezza_da_mm}
                onCambia={(v) => imposta({ larghezza_da_mm: v })}
                disabilitato={disabilitato}
                etichettaAria="Larghezza minima in millimetri"
              />
              <CampoMm
                valore={valori.larghezza_a_mm}
                onCambia={(v) => imposta({ larghezza_a_mm: v })}
                disabilitato={disabilitato}
                etichettaAria="Larghezza massima in millimetri"
              />
            </div>
          </Campo>

          <Campo etichetta="Lunghezza da / a (mm)">
            <div className="grid grid-cols-2 gap-2">
              <CampoMm
                valore={valori.lunghezza_da_mm}
                onCambia={(v) => imposta({ lunghezza_da_mm: v })}
                disabilitato={disabilitato}
                etichettaAria="Lunghezza minima in millimetri"
              />
              <CampoMm
                valore={valori.lunghezza_a_mm}
                onCambia={(v) => imposta({ lunghezza_a_mm: v })}
                disabilitato={disabilitato}
                etichettaAria="Lunghezza massima in millimetri"
              />
            </div>
          </Campo>

          <Campo etichetta="Quantità" aiuto="Facoltativa: sul modulo cartaceo sta nelle annotazioni.">
            <div className="grid grid-cols-2 gap-2">
              {/* CellaNumerica e non Testo: tiene la bozza locale mentre si
                  digita, altrimenti il round-trip coi millesimi mangia la
                  virgola e «12,5» diventa 125. Vedi il commento in
                  RigheDocumento. */}
              <CellaNumerica
                etichetta="Quantità"
                classe="w-full text-left"
                valore={valori.quantita_milli === null ? '' : milliAInput(valori.quantita_milli)}
                onCambia={(v) => {
                  const milli = inputAMilli(v)
                  imposta({ quantita_milli: v.trim() === '' || milli <= 0 ? null : milli })
                }}
                disabilitato={disabilitato}
              />
              <Scelta<UnitaMisura>
                valore={valori.unita_misura ?? ''}
                onCambia={(v) => imposta({ unita_misura: v || null })}
                opzioni={Object.entries(UM_LABEL).map(([valore, etichetta]) => ({
                  valore: valore as UnitaMisura,
                  etichetta,
                }))}
                vuoto="Unità"
                aria-label="Unità di misura"
                disabled={disabilitato}
              />
            </div>
          </Campo>
        </GrigliaCampi>
      </Card>

      {/* ── Lavorazioni richieste al fornitore: testo libero, come sul modulo ─ */}
      <Card titolo="Lavorazioni richieste" className="mb-4">
        <p className="mb-3 text-xs text-ink-mute">
          Le esegue il fornitore prima della consegna. Testo libero: si scrive quello che si
          direbbe al telefono.
        </p>
        <GrigliaCampi colonne={2}>
          <Campo etichetta="Spazzolatura">
            <Testo
              valore={valori.spazzolatura ?? ''}
              onCambia={(v) => imposta({ spazzolatura: v.trim() ? v : null })}
              placeholder="Es. leggera, a grana fine — o «nessuna»"
              disabled={disabilitato}
            />
          </Campo>
          <Campo etichetta="Stucco colore">
            <Testo
              valore={valori.stucco_colore ?? ''}
              onCambia={(v) => imposta({ stucco_colore: v.trim() ? v : null })}
              placeholder="Es. bruno scuro, solo sui nodi passanti"
              disabled={disabilitato}
            />
          </Campo>
          <Campo etichetta="Bordo frontale">
            <Testo
              valore={valori.bordo_frontale ?? ''}
              onCambia={(v) => imposta({ bordo_frontale: v.trim() ? v : null })}
              placeholder="Es. maschio-femmina, bisellato"
              disabled={disabilitato}
            />
          </Campo>
          <Campo etichetta="Finitura">
            <Testo
              valore={valori.finitura ?? ''}
              onCambia={(v) => imposta({ finitura: v.trim() ? v : null })}
              placeholder="Es. per saponato, olio naturale"
              disabled={disabilitato}
            />
          </Campo>
        </GrigliaCampi>
      </Card>

      {/* ── Annotazioni ───────────────────────────────────────────────────── */}
      <Card titolo="Annotazioni" className="mb-4">
        <AreaTesto
          valore={valori.annotazioni ?? ''}
          onCambia={(v) => imposta({ annotazioni: v.trim() ? v : null })}
          righe={4}
          placeholder="Tolleranze, percentuali di lunghezza, essiccazione: tutto quello che il modulo dice in fondo."
          aria-label="Annotazioni"
          disabled={disabilitato}
        />
      </Card>
    </>
  )
}
