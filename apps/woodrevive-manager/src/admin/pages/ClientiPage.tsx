import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { api } from '../api'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Scelta, Testo } from '../components/Campi'
import DataTable, { CellaDoppia, type Colonna } from '../components/DataTable'
import Filtri, { opzioniDa, type ValoriFiltri } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Caricamento, Conferma, Errore, Modale, Sezione } from '../components/Ui'
import {
  CANALE_LABEL,
  TIPO_CLIENTE_LABEL,
  identificativoFiscale,
  type ClienteConTotali,
  type ClienteInput,
  type ID,
} from '../domain'
import { formatEuro } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Anagrafica clienti. Le percentuali del form stanno nello stato come stringhe:
 * un campo numerico controllato che si riformatta a ogni tasto rende impossibile
 * digitare "10,5".
 */
type ModuloCliente = Omit<
  ClienteInput,
  'sconto_default_percentuale' | 'aliquota_iva_default'
> & {
  sconto_default_percentuale: string
  aliquota_iva_default: string
}

const NUOVO: ModuloCliente = {
  tipo: 'azienda',
  ragione_sociale: '',
  referente: null,
  piva: null,
  codice_fiscale: null,
  codice_sdi: null,
  pec: null,
  email: null,
  telefono: null,
  indirizzo: null,
  cap: null,
  citta: null,
  provincia: null,
  nazione: 'IT',
  consegna_indirizzo: null,
  consegna_cap: null,
  consegna_citta: null,
  consegna_provincia: null,
  canale: 'diretto',
  sconto_default_percentuale: '0',
  aliquota_iva_default: '22',
  note: null,
  attivo: true,
}

function daCliente(c: ClienteConTotali): ModuloCliente {
  return {
    tipo: c.tipo,
    ragione_sociale: c.ragione_sociale,
    referente: c.referente,
    piva: c.piva,
    codice_fiscale: c.codice_fiscale,
    codice_sdi: c.codice_sdi,
    pec: c.pec,
    email: c.email,
    telefono: c.telefono,
    indirizzo: c.indirizzo,
    cap: c.cap,
    citta: c.citta,
    provincia: c.provincia,
    nazione: c.nazione,
    consegna_indirizzo: c.consegna_indirizzo,
    consegna_cap: c.consegna_cap,
    consegna_citta: c.consegna_citta,
    consegna_provincia: c.consegna_provincia,
    canale: c.canale,
    sconto_default_percentuale: String(c.sconto_default_percentuale).replace('.', ','),
    aliquota_iva_default: String(c.aliquota_iva_default).replace('.', ','),
    note: c.note,
    attivo: c.attivo,
  }
}

/** "10,5" → 10.5 · vuoto o illeggibile → 0 */
function numero(v: string): number {
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function aInput(m: ModuloCliente): ClienteInput {
  return {
    ...m,
    ragione_sociale: m.ragione_sociale.trim(),
    sconto_default_percentuale: numero(m.sconto_default_percentuale),
    aliquota_iva_default: numero(m.aliquota_iva_default),
  }
}

export default function ClientiPage() {
  const [filtri, setFiltri] = useState<ValoriFiltri>({})
  const { dati, caricamento, errore, ricarica } = useFetch(
    () => api.listaClienti({ q: filtri.q, tipo: filtri.tipo, canale: filtri.canale }),
    [JSON.stringify(filtri)],
  )

  const [modulo, setModulo] = useState<ModuloCliente | null>(null)
  const [idModifica, setIdModifica] = useState<ID | null>(null)
  const [erroreForm, setErroreForm] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const [daEliminare, setDaEliminare] = useState<ClienteConTotali | null>(null)
  const [erroreEliminazione, setErroreEliminazione] = useState<string | null>(null)

  const apriNuovo = () => {
    setIdModifica(null)
    setErroreForm(null)
    setModulo(NUOVO)
  }

  const apriModifica = (c: ClienteConTotali) => {
    setIdModifica(c.id)
    setErroreForm(null)
    setModulo(daCliente(c))
  }

  const chiudi = () => {
    setModulo(null)
    setIdModifica(null)
    setErroreForm(null)
  }

  const imposta = (parziale: Partial<ModuloCliente>) =>
    setModulo((m) => (m ? { ...m, ...parziale } : m))

  const salva = async () => {
    if (!modulo) return
    setInCorso(true)
    setErroreForm(null)
    try {
      if (idModifica) await api.aggiornaCliente(idModifica, aInput(modulo))
      else await api.creaCliente(aInput(modulo))
      chiudi()
      ricarica()
    } catch (e) {
      setErroreForm(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  const elimina = async () => {
    if (!daEliminare) return
    setInCorso(true)
    setErroreEliminazione(null)
    try {
      await api.eliminaCliente(daEliminare.id)
      setDaEliminare(null)
      ricarica()
    } catch (e) {
      // 409: il cliente ha documenti collegati. Il messaggio dell'API spiega quali.
      setErroreEliminazione(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  /*
   * Sotto `md:` queste colonne diventano card impilate: la `priorita` dice cosa
   * fa da titolo, cosa scende in coppia etichetta/valore e cosa sparisce
   * perché su un telefono è rumore. Le colonne che qui sono già nascoste da
   * `hidden lg:table-cell` non hanno motivo di ricomparire in una card larga
   * 390px: quelle diventano `solo-tabella`.
   */
  const colonne: Colonna<ClienteConTotali>[] = [
    {
      chiave: 'cliente',
      intestazione: 'Cliente',
      priorita: 'principale',
      cella: (c) => (
        <CellaDoppia
          principale={
            <span className="flex flex-wrap items-center gap-2">
              {c.ragione_sociale}
              {!c.attivo && <StatoBadge etichetta="Non attivo" tono="neutro" />}
            </span>
          }
          secondario={`${c.codice} · ${identificativoFiscale(c)}`}
        />
      ),
    },
    {
      chiave: 'tipo',
      intestazione: 'Tipo',
      priorita: 'secondaria',
      cella: (c) => (
        <StatoBadge etichetta={TIPO_CLIENTE_LABEL[c.tipo]} tono={c.tipo === 'azienda' ? 'info' : 'neutro'} />
      ),
    },
    {
      chiave: 'contatti',
      intestazione: 'Contatti',
      classe: 'hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (c) => <CellaDoppia principale={c.email ?? '—'} secondario={c.telefono} />,
    },
    {
      chiave: 'citta',
      intestazione: 'Città',
      priorita: 'secondaria',
      cella: (c) => (c.citta ? `${c.citta}${c.provincia ? ` (${c.provincia})` : ''}` : '—'),
    },
    {
      chiave: 'canale',
      intestazione: 'Canale',
      classe: 'hidden md:table-cell',
      priorita: 'solo-tabella',
      cella: (c) => <span className="text-ink-soft">{CANALE_LABEL[c.canale]}</span>,
    },
    {
      chiave: 'ordini',
      intestazione: 'Ordini aperti',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (c) => (c.ordini_aperti ? c.ordini_aperti : <span className="text-ink-mute">—</span>),
    },
    {
      chiave: 'fatturato',
      intestazione: 'Fatturato',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (c) => formatEuro(c.fatturato_cents),
    },
    {
      chiave: 'azioni',
      intestazione: <span className="sr-only">Azioni</span>,
      allineamento: 'destra',
      classe: 'w-24',
      priorita: 'azione',
      cella: (c) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="btn-ghost"
            aria-label={`Modifica ${c.ragione_sociale}`}
            onClick={(e) => {
              e.stopPropagation()
              apriModifica(c)
            }}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="btn-ghost"
            aria-label={`Elimina ${c.ragione_sociale}`}
            onClick={(e) => {
              e.stopPropagation()
              setErroreEliminazione(null)
              setDaEliminare(c)
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Clienti"
        sottotitolo="Aziende e privati a cui Wood Revive vende il proprio materiale."
        azioni={
          <button type="button" className="btn-primary" onClick={apriNuovo}>
            <Plus size={16} />
            Nuovo cliente
          </button>
        }
      />

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per nome, codice, città, P.IVA…"
        definizioni={[
          { chiave: 'tipo', etichetta: 'Tipo', tipo: 'select', opzioni: opzioniDa(TIPO_CLIENTE_LABEL) },
          { chiave: 'canale', etichetta: 'Canale', tipo: 'select', opzioni: opzioniDa(CANALE_LABEL) },
        ]}
      />

      {caricamento && !dati ? (
        <Caricamento />
      ) : errore ? (
        <Errore messaggio={errore} onRiprova={ricarica} />
      ) : (
        <DataTable
          righe={dati ?? []}
          colonne={colonne}
          chiaveRiga={(c) => c.id}
          linkRiga={(c) => `/clienti/${c.id}`}
          classeRiga={(c) => (c.attivo ? '' : 'opacity-60')}
          messaggioVuoto="Nessun cliente con questi filtri."
        />
      )}

      {modulo && (
        <Modale
          titolo={idModifica ? 'Modifica cliente' : 'Nuovo cliente'}
          sottotitolo={
            idModifica ? undefined : 'Il codice viene assegnato automaticamente al salvataggio.'
          }
          onChiudi={chiudi}
          larghezza="max-w-3xl"
          piede={
            <>
              <button type="button" className="btn-secondary" onClick={chiudi} disabled={inCorso}>
                Annulla
              </button>
              <button type="button" className="btn-primary" onClick={salva} disabled={inCorso}>
                {inCorso ? 'Salvataggio…' : 'Salva'}
              </button>
            </>
          }
        >
          <AvvisoErrore messaggio={erroreForm} />

          <div className="flex flex-col gap-5">
            <Sezione titolo="Anagrafica">
              <GrigliaCampi>
                <Campo etichetta="Tipo" obbligatorio>
                  <Scelta
                    valore={modulo.tipo}
                    onCambia={(v) => imposta({ tipo: v })}
                    opzioni={opzioniDa(TIPO_CLIENTE_LABEL)}
                  />
                </Campo>
                <Campo
                  etichetta={modulo.tipo === 'privato' ? 'Nome e cognome' : 'Ragione sociale'}
                  obbligatorio
                >
                  <Testo
                    valore={modulo.ragione_sociale}
                    onCambia={(v) => imposta({ ragione_sociale: v })}
                  />
                </Campo>
                <Campo etichetta="Referente">
                  <Testo
                    valore={modulo.referente ?? ''}
                    onCambia={(v) => imposta({ referente: v || null })}
                    placeholder="Persona da contattare"
                  />
                </Campo>
                {/* P.IVA e codice fiscale restano entrambi nello stato: cambiando tipo
                    non si perde il dato già inserito. */}
                {modulo.tipo === 'azienda' ? (
                  <Campo etichetta="Partita IVA" obbligatorio>
                    <Testo
                      valore={modulo.piva ?? ''}
                      onCambia={(v) => imposta({ piva: v || null })}
                    />
                  </Campo>
                ) : (
                  <Campo etichetta="Codice fiscale" obbligatorio>
                    <Testo
                      valore={modulo.codice_fiscale ?? ''}
                      onCambia={(v) => imposta({ codice_fiscale: v || null })}
                    />
                  </Campo>
                )}
                <Campo etichetta="Codice SDI" aiuto="Fatturazione elettronica: sette caratteri.">
                  <Testo
                    valore={modulo.codice_sdi ?? ''}
                    onCambia={(v) => imposta({ codice_sdi: v || null })}
                  />
                </Campo>
                <Campo etichetta="PEC">
                  <Testo
                    valore={modulo.pec ?? ''}
                    onCambia={(v) => imposta({ pec: v || null })}
                    type="email"
                  />
                </Campo>
              </GrigliaCampi>
            </Sezione>

            <Sezione titolo="Contatti">
              <GrigliaCampi>
                <Campo etichetta="Email">
                  <Testo
                    valore={modulo.email ?? ''}
                    onCambia={(v) => imposta({ email: v || null })}
                    type="email"
                  />
                </Campo>
                <Campo etichetta="Telefono">
                  <Testo
                    valore={modulo.telefono ?? ''}
                    onCambia={(v) => imposta({ telefono: v || null })}
                  />
                </Campo>
              </GrigliaCampi>
            </Sezione>

            <Sezione titolo="Sede">
              <GrigliaCampi>
                <Campo etichetta="Indirizzo" className="md:col-span-2">
                  <Testo
                    valore={modulo.indirizzo ?? ''}
                    onCambia={(v) => imposta({ indirizzo: v || null })}
                  />
                </Campo>
                <Campo etichetta="CAP">
                  <Testo valore={modulo.cap ?? ''} onCambia={(v) => imposta({ cap: v || null })} />
                </Campo>
                <Campo etichetta="Città">
                  <Testo
                    valore={modulo.citta ?? ''}
                    onCambia={(v) => imposta({ citta: v || null })}
                  />
                </Campo>
                <Campo etichetta="Provincia">
                  <Testo
                    valore={modulo.provincia ?? ''}
                    onCambia={(v) => imposta({ provincia: v || null })}
                    maxLength={2}
                    placeholder="TV"
                  />
                </Campo>
              </GrigliaCampi>
            </Sezione>

            <Sezione titolo="Sede di consegna">
              <p className="mb-3 text-xs text-ink-mute">
                Compilala solo se la merce va consegnata altrove — un cantiere, per esempio.
                Se resta vuota si consegna alla sede.
              </p>
              <GrigliaCampi>
                <Campo etichetta="Indirizzo di consegna" className="md:col-span-2">
                  <Testo
                    valore={modulo.consegna_indirizzo ?? ''}
                    onCambia={(v) => imposta({ consegna_indirizzo: v || null })}
                  />
                </Campo>
                <Campo etichetta="CAP">
                  <Testo
                    valore={modulo.consegna_cap ?? ''}
                    onCambia={(v) => imposta({ consegna_cap: v || null })}
                  />
                </Campo>
                <Campo etichetta="Città">
                  <Testo
                    valore={modulo.consegna_citta ?? ''}
                    onCambia={(v) => imposta({ consegna_citta: v || null })}
                  />
                </Campo>
                <Campo etichetta="Provincia">
                  <Testo
                    valore={modulo.consegna_provincia ?? ''}
                    onCambia={(v) => imposta({ consegna_provincia: v || null })}
                    maxLength={2}
                  />
                </Campo>
              </GrigliaCampi>
            </Sezione>

            <Sezione titolo="Condizioni commerciali">
              <GrigliaCampi colonne={3}>
                <Campo etichetta="Canale">
                  <Scelta
                    valore={modulo.canale}
                    onCambia={(v) => imposta({ canale: v })}
                    opzioni={opzioniDa(CANALE_LABEL)}
                  />
                </Campo>
                <Campo etichetta="Sconto default %" aiuto="Proposto sui nuovi preventivi.">
                  <Testo
                    valore={modulo.sconto_default_percentuale}
                    onCambia={(v) => imposta({ sconto_default_percentuale: v })}
                    inputMode="decimal"
                  />
                </Campo>
                <Campo etichetta="Aliquota IVA default" aiuto="10% ristrutturazioni, 22% ordinaria.">
                  <Testo
                    valore={modulo.aliquota_iva_default}
                    onCambia={(v) => imposta({ aliquota_iva_default: v })}
                    inputMode="decimal"
                  />
                </Campo>
              </GrigliaCampi>
            </Sezione>

            <Sezione titolo="Altro">
              <Campo etichetta="Note">
                <AreaTesto
                  valore={modulo.note ?? ''}
                  onCambia={(v) => imposta({ note: v || null })}
                  righe={3}
                />
              </Campo>
              <label className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={modulo.attivo}
                  onChange={(e) => imposta({ attivo: e.target.checked })}
                  className="h-4 w-4 rounded border-line text-brand focus:ring-brand/40"
                />
                Cliente attivo
              </label>
            </Sezione>
          </div>
        </Modale>
      )}

      {daEliminare && (
        <Conferma
          titolo="Eliminare il cliente?"
          distruttiva
          etichettaConferma="Elimina"
          inCorso={inCorso}
          onAnnulla={() => {
            setDaEliminare(null)
            setErroreEliminazione(null)
          }}
          onConferma={elimina}
          messaggio={
            <>
              <AvvisoErrore messaggio={erroreEliminazione} />
              <p>
                <strong>{daEliminare.ragione_sociale}</strong> verrà rimosso dall’anagrafica.
                L’operazione non si annulla.
              </p>
            </>
          }
        />
      )}
    </>
  )
}
