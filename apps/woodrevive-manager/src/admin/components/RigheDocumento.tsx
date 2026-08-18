import { Plus, Trash2 } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

import { costoRiferimentoCents, type Articolo, type RigaBase } from '../domain'
import {
  SIMBOLO_UM,
  centsAInput,
  euroACents,
  formatEuro,
  formatPercentuale,
  formatQuantita,
} from '../lib/format'
import { nuovoId } from '../lib/id'
import { imponibileRiga, totaliDocumento } from '../lib/money'
import { inputAMilli, milliAInput } from '../lib/qty'
import SelettoreArticolo, { AggiungiArticolo } from './SelettoreArticolo'
import type { ManiglieSelettore } from './SelettoreRicerca'

/**
 * Editor delle righe di un documento di vendita, condiviso da preventivo e
 * ordine: le due entità hanno righe con la stessa forma (`RigaBase`) e l'ordine
 * aggiunge solo la quantità evasa, che entra come colonna in più.
 *
 * I totali si calcolano qui a ogni battuta con `totaliDocumento`, gli stessi
 * conti che rifarà l'API al salvataggio: chi digita vede subito il totale che
 * finirà sul documento.
 *
 * Accanto all'imponibile di ogni riga c'è il MARGINE, in sola lettura. Chi
 * compra e rivende vive di quello: vedere il prezzo senza il costo significa
 * concedere sconti al buio. Dove il costo non si sa — riga libera, articolo mai
 * caricato e senza prezzo d'acquisto — si scrive «—», mai zero.
 *
 * ── Due cose che rendono immediato comporre un documento ──────────────────
 *
 * 1. IL CICLO DA TASTIERA. In testata c'è un campo di ricerca articolo: tre
 *    lettere e Invio aggiungono la riga con prezzo di listino, unità di misura,
 *    IVA ed essenza già dentro, e il fuoco passa sulla quantità; Invio nella
 *    quantità chiude la riga e riporta il fuoco sulla ricerca. Si carica un
 *    preventivo di dieci righe senza toccare il mouse.
 *
 * 2. DUE FORME. Da `md:` in su resta la tabella densa di sempre. Sotto `md:`
 *    ogni riga diventa una card: prima si compilava una riga scorrendo sette
 *    colonne di lato, che su un telefono in cantiere non si fa.
 */

export interface ColonnaExtraRiga<T> {
  chiave: string
  intestazione: ReactNode
  cella: (riga: T) => ReactNode
}

/** Riga nuova, vuota. Sta qui perché la usano sia il preventivo sia l'ordine. */
export function rigaVuota(aliquotaIva = 22): RigaBase {
  return {
    id: nuovoId(),
    tipo: 'merce',
    articolo_id: null,
    codice_articolo: null,
    descrizione: '',
    lotto_id: null,
    lotto_codice: null,
    quantita_milli: 0,
    unita_misura: 'pz',
    prezzo_unitario_cents: 0,
    sconto_percentuale: 0,
    aliquota_iva: aliquotaIva,
    imponibile_cents: 0,
    essenza: null,
    patina: null,
    spessore_mm: null,
    note: null,
  }
}

/**
 * Riga di solo testo: un titolo di sezione, una condizione, una premessa.
 *
 * Senza questo tipo il pannello potrebbe mostrare documenti con prosa libera ma
 * non ricrearli, e chi ne compone uno nuovo dovrebbe
 * infilare il testo dentro la descrizione di una riga di merce a prezzo zero —
 * che poi finisce nel castelletto IVA con imponibile nullo.
 */
export function rigaTesto(): RigaBase {
  return { ...rigaVuota(0), tipo: 'descrizione', unita_misura: 'corpo' }
}

/**
 * Snapshot che l'articolo scritto congela sulla riga. Vedi domain/documenti.ts:
 * se il listino cambia domani, il preventivo firmato resta quello firmato.
 * Esportata perché la usano anche le schermate di creazione rapida.
 */
export function snapshotDaArticolo(a: Articolo): Partial<RigaBase> {
  return {
    articolo_id: a.id,
    codice_articolo: a.codice,
    descrizione: a.nome,
    unita_misura: a.unita_misura,
    prezzo_unitario_cents: a.prezzo_listino_cents,
    aliquota_iva: a.aliquota_iva,
    essenza: a.essenza,
    patina: a.patina,
    spessore_mm: a.spessore_mm,
  }
}

/** Percentuali: si riusa il parser delle quantità, che accetta "10,5" e "10.5". */
const percentualeDaInput = (testo: string): number => inputAMilli(testo) / 1000
const percentualeAInput = (valore: number): string => String(valore).replace('.', ',')

// ---------------------------------------------------------------------------
// Margine
// ---------------------------------------------------------------------------

/**
 * Margine della riga in centesimi: imponibile meno il costo della merce.
 *
 * `null` quando il costo non è noto (riga libera, o articolo senza costo medio
 * né prezzo d'acquisto): un margine sconosciuto e un margine nullo sono cose
 * diverse, e mostrarli uguali fa firmare sconti che non ci sono.
 */
export function margineRiga(r: RigaBase, a: Articolo | undefined): number | null {
  if (!a) return null
  const costo = costoRiferimentoCents(a)
  if (!costo) return null
  const imponibile = imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, r.sconto_percentuale)
  return imponibile - Math.round((r.quantita_milli * costo) / 1000)
}

/**
 * Margine dell'intero documento: somma dei margini di riga calcolabili, meno la
 * quota di sconto generale che grava su quelle stesse righe.
 *
 * Le righe senza costo restano fuori e vengono contate a parte: sommare zero al
 * posto di «non lo so» farebbe sembrare il documento meno redditizio di quanto è.
 */
export function margineDocumento(
  righe: RigaBase[],
  articoli: Articolo[],
  scontoGeneralePercentuale: number,
): { margine_cents: number | null; righe_senza_costo: number } {
  const perId = new Map(articoli.map((a) => [a.id, a]))
  let margine: number | null = null
  let imponibileNoto = 0
  let senzaCosto = 0

  for (const r of righe) {
    const m = margineRiga(r, r.articolo_id ? perId.get(r.articolo_id) : undefined)
    if (m == null) {
      senzaCosto++
      continue
    }
    margine = (margine ?? 0) + m
    imponibileNoto += imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, r.sconto_percentuale)
  }

  if (margine == null) return { margine_cents: null, righe_senza_costo: senzaCosto }
  const quotaSconto = Math.round((imponibileNoto * scontoGeneralePercentuale) / 100)
  return { margine_cents: margine - quotaSconto, righe_senza_costo: senzaCosto }
}

export default function RigheDocumento<T extends RigaBase>({
  righe,
  onCambia,
  articoli,
  scontoGenerale,
  soloLettura = false,
  creaRiga,
  colonneExtra = [],
  autoFocusRicerca = false,
}: {
  righe: T[]
  onCambia: (righe: T[]) => void
  /** Serve al margine: gli articoli scelti dalla ricerca si aggiungono da soli. */
  articoli: Articolo[]
  scontoGenerale: number
  soloLettura?: boolean
  /** Se manca, non si possono aggiungere righe. */
  creaRiga?: () => T
  colonneExtra?: Array<ColonnaExtraRiga<T>>
  /** Il fuoco parte dalla ricerca articolo: per le schermate di creazione. */
  autoFocusRicerca?: boolean
}) {
  // Il cast è inevitabile: la patch è espressa su `RigaBase`, che è la parte di
  // riga che questo editor conosce; i campi in più di `T` restano intatti.
  const aggiorna = (indice: number, patch: Partial<RigaBase>) =>
    onCambia(righe.map((r, i) => (i === indice ? ({ ...r, ...patch } as T) : r)))

  const rifRicerca = useRef<ManiglieSelettore>(null)
  /**
   * Riga appena nata: la sua quantità prende il fuoco al montaggio.
   * La quantità è disegnata due volte — nella tabella e nella card — ma solo
   * una delle due è visibile alla volta, e `focus()` su un elemento nascosto
   * non fa niente: prende il fuoco quella giusta senza doverlo decidere qui.
   */
  const [rigaNuova, setRigaNuova] = useState<string | null>(null)
  /**
   * Articoli scelti dalla ricerca che non erano nell'elenco ricevuto: senza
   * questo il margine della riga appena aggiunta resterebbe «—» fino al
   * ricaricamento della pagina.
   */
  const [scelti, setScelti] = useState<Articolo[]>([])

  const perId = new Map([...articoli, ...scelti].map((a) => [a.id, a]))
  const margini = margineDocumento(righe, [...articoli, ...scelti], scontoGenerale)

  const ricorda = (a: Articolo) => {
    if (perId.has(a.id)) return
    setScelti((s) => [...s, a])
  }

  /** Scegliere l'articolo congela lo snapshot sulla riga. */
  const applicaArticolo = (indice: number, a: Articolo | null) => {
    if (!a) {
      aggiorna(indice, { articolo_id: null, codice_articolo: null })
      return
    }
    ricorda(a)
    aggiorna(indice, snapshotDaArticolo(a))
  }

  /** Il ciclo: l'articolo entra come riga nuova e il fuoco va sulla quantità. */
  const aggiungiDaRicerca = (a: Articolo) => {
    if (!creaRiga) return
    ricorda(a)
    const nuova = { ...creaRiga(), ...snapshotDaArticolo(a) } as T
    setRigaNuova(nuova.id)
    onCambia([...righe, nuova])
  }

  const totali = totaliDocumento(
    righe.map((r) => ({
      imponibile_cents: imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, r.sconto_percentuale),
      aliquota_iva: r.aliquota_iva,
    })),
    scontoGenerale,
  )

  const colonne = 7 + colonneExtra.length + (soloLettura ? 0 : 1)
  const modificabile = !soloLettura && Boolean(creaRiga)

  /** Invio nella quantità: la riga è finita, si torna a cercare la prossima. */
  const tornaAllaRicerca = () => rifRicerca.current?.focus()

  return (
    <section className="card">
      <header className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base text-ink">Righe del documento</h2>
          {modificabile && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onCambia([...righe, creaRiga!()])}
            >
              <Plus size={15} />
              Riga libera
            </button>
          )}
        </div>

        {modificabile && (
          <div className="mt-3">
            <AggiungiArticolo
              ref={rifRicerca}
              autoFocus={autoFocusRicerca}
              onAggiungi={aggiungiDaRicerca}
            />
            <p className="mt-1 text-xs text-ink-mute">
              Invio aggiunge la riga con prezzo, unità di misura e IVA già compilati; Invio nella
              quantità torna qui.
            </p>
          </div>
        )}
      </header>

      {/* ── da md: in su — la tabella densa ─────────────────────────────── */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-tint/25 text-xs uppercase tracking-wide text-ink-mute">
              <th scope="col" className="px-3 py-2 text-left font-semibold">Articolo</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Descrizione</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Quantità</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Prezzo</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Sconto</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">IVA</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Imponibile</th>
              {colonneExtra.map((c) => (
                <th key={c.chiave} scope="col" className="px-3 py-2 text-right font-semibold">
                  {c.intestazione}
                </th>
              ))}
              {!soloLettura && <th scope="col" className="w-10 px-3 py-2" />}
            </tr>
          </thead>

          <tbody>
            {!righe.length && (
              <tr>
                <td colSpan={colonne} className="px-3 py-8 text-center text-sm text-ink-mute">
                  Nessuna riga. {soloLettura ? '' : 'Cerca un articolo qui sopra per cominciare.'}
                </td>
              </tr>
            )}

            {righe.map((r, i) => (
              <tr key={r.id} className="border-b border-line/60 last:border-0 align-top">
                <td className="min-w-[14rem] px-3 py-2">
                  {soloLettura ? (
                    <span className="text-ink-soft">{r.codice_articolo ?? 'Riga libera'}</span>
                  ) : (
                    <SelettoreArticolo
                      valore={r.articolo_id ? (perId.get(r.articolo_id) ?? null) : null}
                      etichettaValore={r.codice_articolo}
                      onScegli={(a) => applicaArticolo(i, a)}
                      segnaposto="Riga libera"
                    />
                  )}
                </td>

                <td className="px-3 py-2">
                  {soloLettura ? (
                    <span className="text-ink">{r.descrizione || '—'}</span>
                  ) : (
                    <input
                      className="input min-w-[14rem] px-2 py-1.5"
                      value={r.descrizione}
                      onChange={(e) => aggiorna(i, { descrizione: e.target.value })}
                      placeholder="Descrizione stampata sul documento"
                      aria-label="Descrizione"
                    />
                  )}
                </td>

                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {soloLettura ? (
                      <span className="tabular">
                        {formatQuantita(r.quantita_milli, r.unita_misura, false)}
                      </span>
                    ) : (
                      <CellaNumerica
                        etichetta="Quantità"
                        valore={milliAInput(r.quantita_milli)}
                        onCambia={(t) => aggiorna(i, { quantita_milli: inputAMilli(t) })}
                        classe="w-20"
                        autoFocus={r.id === rigaNuova}
                        onInvio={tornaAllaRicerca}
                      />
                    )}
                    <span className="text-xs text-ink-mute">{SIMBOLO_UM[r.unita_misura]}</span>
                  </div>
                </td>

                <td className="px-3 py-2 text-right">
                  {soloLettura ? (
                    <span className="tabular">{formatEuro(r.prezzo_unitario_cents)}</span>
                  ) : (
                    <CellaNumerica
                      etichetta="Prezzo unitario"
                      valore={centsAInput(r.prezzo_unitario_cents)}
                      onCambia={(t) => aggiorna(i, { prezzo_unitario_cents: euroACents(t) })}
                      classe="w-24"
                    />
                  )}
                </td>

                <td className="px-3 py-2 text-right">
                  {soloLettura ? (
                    <span className="tabular">{percentualeAInput(r.sconto_percentuale)}%</span>
                  ) : (
                    <CellaNumerica
                      etichetta="Sconto percentuale"
                      valore={percentualeAInput(r.sconto_percentuale)}
                      onCambia={(t) => aggiorna(i, { sconto_percentuale: percentualeDaInput(t) })}
                      classe="w-16"
                    />
                  )}
                </td>

                <td className="px-3 py-2 text-right">
                  {soloLettura ? (
                    <span className="tabular">{percentualeAInput(r.aliquota_iva)}%</span>
                  ) : (
                    <CellaNumerica
                      etichetta="Aliquota IVA"
                      valore={percentualeAInput(r.aliquota_iva)}
                      onCambia={(t) => aggiorna(i, { aliquota_iva: percentualeDaInput(t) })}
                      classe="w-16"
                    />
                  )}
                </td>

                <td className="tabular px-3 py-2 text-right font-medium text-ink">
                  {formatEuro(
                    imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, r.sconto_percentuale),
                  )}
                  <MargineDiRiga riga={r} articolo={r.articolo_id ? perId.get(r.articolo_id) : undefined} />
                </td>

                {colonneExtra.map((c) => (
                  <td key={c.chiave} className="tabular px-3 py-2 text-right text-ink-soft">
                    {c.cella(r)}
                  </td>
                ))}

                {!soloLettura && (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="btn-ghost px-2 py-1"
                      onClick={() => onCambia(righe.filter((_, j) => j !== i))}
                      aria-label={`Elimina la riga ${i + 1}`}
                      title="Elimina la riga"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── sotto md: — una card per riga ───────────────────────────────── */}
      <div className="divide-y divide-line/60 md:hidden">
        {!righe.length && (
          <p className="px-4 py-8 text-center text-sm text-ink-mute">
            Nessuna riga. {soloLettura ? '' : 'Cerca un articolo qui sopra per cominciare.'}
          </p>
        )}

        {righe.map((r, i) => (
          <article key={r.id} className="px-4 py-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {soloLettura ? (
                  <p className="font-medium text-ink">{r.codice_articolo ?? 'Riga libera'}</p>
                ) : (
                  <SelettoreArticolo
                    valore={r.articolo_id ? (perId.get(r.articolo_id) ?? null) : null}
                    etichettaValore={r.codice_articolo}
                    onScegli={(a) => applicaArticolo(i, a)}
                    segnaposto="Riga libera"
                  />
                )}
              </div>
              {!soloLettura && (
                <button
                  type="button"
                  className="btn-icona btn-ghost shrink-0"
                  onClick={() => onCambia(righe.filter((_, j) => j !== i))}
                  aria-label={`Elimina la riga ${i + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div className="mt-2">
              {soloLettura ? (
                <p className="text-sm text-ink">{r.descrizione || '—'}</p>
              ) : (
                <input
                  className="input"
                  value={r.descrizione}
                  onChange={(e) => aggiorna(i, { descrizione: e.target.value })}
                  placeholder="Descrizione stampata sul documento"
                  aria-label="Descrizione"
                />
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <CampoCard etichetta={`Quantità (${SIMBOLO_UM[r.unita_misura]})`}>
                {soloLettura ? (
                  <span className="tabular text-sm text-ink">
                    {formatQuantita(r.quantita_milli, r.unita_misura)}
                  </span>
                ) : (
                  <CellaNumerica
                    etichetta="Quantità"
                    valore={milliAInput(r.quantita_milli)}
                    onCambia={(t) => aggiorna(i, { quantita_milli: inputAMilli(t) })}
                    classe="w-full"
                    autoFocus={r.id === rigaNuova}
                    onInvio={tornaAllaRicerca}
                  />
                )}
              </CampoCard>

              <CampoCard etichetta="Prezzo unitario">
                {soloLettura ? (
                  <span className="tabular text-sm text-ink">{formatEuro(r.prezzo_unitario_cents)}</span>
                ) : (
                  <CellaNumerica
                    etichetta="Prezzo unitario"
                    valore={centsAInput(r.prezzo_unitario_cents)}
                    onCambia={(t) => aggiorna(i, { prezzo_unitario_cents: euroACents(t) })}
                    classe="w-full"
                  />
                )}
              </CampoCard>

              <CampoCard etichetta="Sconto %">
                {soloLettura ? (
                  <span className="tabular text-sm text-ink">
                    {percentualeAInput(r.sconto_percentuale)}%
                  </span>
                ) : (
                  <CellaNumerica
                    etichetta="Sconto percentuale"
                    valore={percentualeAInput(r.sconto_percentuale)}
                    onCambia={(t) => aggiorna(i, { sconto_percentuale: percentualeDaInput(t) })}
                    classe="w-full"
                  />
                )}
              </CampoCard>

              <CampoCard etichetta="IVA %">
                {soloLettura ? (
                  <span className="tabular text-sm text-ink">
                    {percentualeAInput(r.aliquota_iva)}%
                  </span>
                ) : (
                  <CellaNumerica
                    etichetta="Aliquota IVA"
                    valore={percentualeAInput(r.aliquota_iva)}
                    onCambia={(t) => aggiorna(i, { aliquota_iva: percentualeDaInput(t) })}
                    classe="w-full"
                  />
                )}
              </CampoCard>
            </div>

            {Boolean(colonneExtra.length) && (
              <dl className="mt-3 grid grid-cols-2 gap-3">
                {colonneExtra.map((c) => (
                  <div key={c.chiave}>
                    <dt className="label">{c.intestazione}</dt>
                    <dd className="tabular mt-0.5 text-sm text-ink-soft">{c.cella(r)}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-2">
              <span className="label">Imponibile</span>
              <span className="tabular text-right font-semibold text-ink">
                {formatEuro(
                  imponibileRiga(r.quantita_milli, r.prezzo_unitario_cents, r.sconto_percentuale),
                )}
                <MargineDiRiga riga={r} articolo={r.articolo_id ? perId.get(r.articolo_id) : undefined} />
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="border-t border-line px-4 py-4">
        <dl className="ml-auto w-full max-w-sm space-y-1.5 text-sm">
          <VoceTotale etichetta="Imponibile lordo" valore={formatEuro(totali.imponibile_lordo_cents)} />
          {totali.sconto_generale_cents > 0 && (
            <VoceTotale
              etichetta={`Sconto generale ${percentualeAInput(scontoGenerale)}%`}
              valore={`− ${formatEuro(totali.sconto_generale_cents)}`}
            />
          )}
          <VoceTotale etichetta="Imponibile" valore={formatEuro(totali.imponibile_cents)} />

          {totali.riepilogo_iva.map((v) => (
            <VoceTotale
              key={v.aliquota}
              etichetta={`IVA ${percentualeAInput(v.aliquota)}% su ${formatEuro(v.imponibile_cents)}`}
              valore={formatEuro(v.iva_cents)}
              sottile
            />
          ))}

          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
            <dt className="font-semibold text-ink">Totale documento</dt>
            <dd className="tabular text-lg font-semibold text-ink">{formatEuro(totali.totale_cents)}</dd>
          </div>

          {/* Il margine sta sotto il totale e in piccolo: è un numero interno,
              non finisce sul documento che legge il cliente. */}
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
            <dt className="text-xs text-ink-mute">
              Margine stimato
              {margini.righe_senza_costo > 0 &&
                ` · ${margini.righe_senza_costo} ${
                  margini.righe_senza_costo === 1 ? 'riga senza costo' : 'righe senza costo'
                }`}
            </dt>
            <dd className="tabular text-xs text-ink-mute">
              {margini.margine_cents == null ? '—' : formatEuro(margini.margine_cents)}
              {margini.margine_cents != null && totali.imponibile_cents > 0 && (
                <> · {formatPercentuale((margini.margine_cents / totali.imponibile_cents) * 100, 1)}</>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

/** Etichetta e campo dentro la card di riga. */
function CampoCard({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1">{etichetta}</span>
      {children}
    </label>
  )
}

/** Margine della riga sotto l'imponibile: piccolo, grigio, mai in evidenza. */
function MargineDiRiga({ riga, articolo }: { riga: RigaBase; articolo: Articolo | undefined }) {
  const margine = margineRiga(riga, articolo)
  const imponibile = imponibileRiga(
    riga.quantita_milli,
    riga.prezzo_unitario_cents,
    riga.sconto_percentuale,
  )
  return (
    <span className="mt-0.5 block text-xs font-normal text-ink-mute">
      {margine == null ? (
        'margine —'
      ) : (
        <>
          margine {formatEuro(margine)}
          {imponibile > 0 && ` · ${formatPercentuale((margine / imponibile) * 100, 0)}`}
        </>
      )}
    </span>
  )
}

function VoceTotale({
  etichetta,
  valore,
  sottile,
}: {
  etichetta: string
  valore: string
  sottile?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={sottile ? 'text-xs text-ink-mute' : 'text-ink-soft'}>{etichetta}</dt>
      <dd className={`tabular ${sottile ? 'text-xs text-ink-mute' : 'text-ink'}`}>{valore}</dd>
    </div>
  )
}

/**
 * Campo numerico di una cella. Tiene una bozza di testo finché ha il fuoco:
 * senza, chi digita "12," vedrebbe sparire la virgola, perché il valore
 * riformattato tornerebbe indietro come "12". Il modello si aggiorna comunque a
 * ogni battuta, così i totali restano in tempo reale.
 *
 * Il contenuto si seleziona da solo quando il campo prende il fuoco: sulle
 * quantità si sovrascrive quasi sempre, e accodarsi a un numero già scritto è
 * l'errore che nessuno si accorge di aver fatto.
 */
export function CellaNumerica({
  valore,
  onCambia,
  etichetta,
  classe = 'w-24',
  disabilitato,
  onInvio,
  autoFocus,
}: {
  valore: string
  onCambia: (testo: string) => void
  etichetta: string
  classe?: string
  disabilitato?: boolean
  /** Invio nel campo: chiude la riga e riporta il fuoco dove serve. */
  onInvio?: () => void
  autoFocus?: boolean
}) {
  const [bozza, setBozza] = useState<string | null>(null)
  return (
    <input
      className={`input tabular px-2 py-1.5 text-right ${classe}`}
      value={bozza ?? valore}
      inputMode="decimal"
      disabled={disabilitato}
      aria-label={etichetta}
      autoFocus={autoFocus}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setBozza(e.target.value)
        onCambia(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !onInvio) return
        // Non deve inviare il form che c'è intorno: chiude la riga e basta.
        e.preventDefault()
        setBozza(null)
        onInvio()
      }}
      onBlur={() => setBozza(null)}
    />
  )
}
