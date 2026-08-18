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
  ESSENZA_LABEL,
  TIPO_FORNITORE_LABEL,
  type Essenza,
  type FornitoreConTotali,
  type FornitoreInput,
  type ID,
} from '../domain'
import { formatData, formatEuro } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Anagrafica fornitori: da qui arriva il legno antico già lavorato. Non esiste
 * una scheda di dettaglio — quel che conta di un fornitore (quante partite ha
 * conferito, quanto gli è stato pagato, quando è arrivata l'ultima) sta già in
 * questa lista, e le partite hanno la loro pagina.
 */
const NUOVO: FornitoreInput = {
  ragione_sociale: '',
  tipo: 'demolitore',
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
  essenze_tipiche: [],
  note: null,
  attivo: true,
}

function daFornitore(f: FornitoreConTotali): FornitoreInput {
  return {
    ragione_sociale: f.ragione_sociale,
    tipo: f.tipo,
    referente: f.referente,
    piva: f.piva,
    codice_fiscale: f.codice_fiscale,
    codice_sdi: f.codice_sdi,
    pec: f.pec,
    email: f.email,
    telefono: f.telefono,
    indirizzo: f.indirizzo,
    cap: f.cap,
    citta: f.citta,
    provincia: f.provincia,
    nazione: f.nazione,
    essenze_tipiche: [...f.essenze_tipiche],
    note: f.note,
    attivo: f.attivo,
  }
}

export default function FornitoriPage() {
  const [filtri, setFiltri] = useState<ValoriFiltri>({})
  const { dati, caricamento, errore, ricarica } = useFetch(
    () => api.listaFornitori({ q: filtri.q, tipo: filtri.tipo }),
    [JSON.stringify(filtri)],
  )

  const [modulo, setModulo] = useState<FornitoreInput | null>(null)
  const [idModifica, setIdModifica] = useState<ID | null>(null)
  const [erroreForm, setErroreForm] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const [daEliminare, setDaEliminare] = useState<FornitoreConTotali | null>(null)
  const [erroreEliminazione, setErroreEliminazione] = useState<string | null>(null)

  const apriNuovo = () => {
    setIdModifica(null)
    setErroreForm(null)
    setModulo(NUOVO)
  }

  const apriModifica = (f: FornitoreConTotali) => {
    setIdModifica(f.id)
    setErroreForm(null)
    setModulo(daFornitore(f))
  }

  const chiudi = () => {
    setModulo(null)
    setIdModifica(null)
    setErroreForm(null)
  }

  const imposta = (parziale: Partial<FornitoreInput>) =>
    setModulo((m) => (m ? { ...m, ...parziale } : m))

  const alternaEssenza = (e: Essenza) =>
    setModulo((m) =>
      m
        ? {
            ...m,
            essenze_tipiche: m.essenze_tipiche.includes(e)
              ? m.essenze_tipiche.filter((x) => x !== e)
              : [...m.essenze_tipiche, e],
          }
        : m,
    )

  const salva = async () => {
    if (!modulo) return
    setInCorso(true)
    setErroreForm(null)
    const input: FornitoreInput = { ...modulo, ragione_sociale: modulo.ragione_sociale.trim() }
    try {
      if (idModifica) await api.aggiornaFornitore(idModifica, input)
      else await api.creaFornitore(input)
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
      await api.eliminaFornitore(daEliminare.id)
      setDaEliminare(null)
      ricarica()
    } catch (e) {
      // 409: ha già conferito lotti o ordini di acquisto.
      setErroreEliminazione(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  /*
   * Sotto `md:` le colonne diventano card impilate (vedi `priorita` in
   * DataTable): il fornitore fa da titolo, i numeri scendono in coppie
   * etichetta/valore, e ciò che è già nascosto sul monitor stretto non torna
   * su uno schermo da 390px.
   */
  const colonne: Colonna<FornitoreConTotali>[] = [
    {
      chiave: 'fornitore',
      intestazione: 'Fornitore',
      priorita: 'principale',
      cella: (f) => (
        <CellaDoppia
          principale={
            <span className="flex flex-wrap items-center gap-2">
              {f.ragione_sociale}
              {!f.attivo && <StatoBadge etichetta="Non attivo" tono="neutro" />}
            </span>
          }
          secondario={[f.codice, f.piva ? `P.IVA ${f.piva}` : null].filter(Boolean).join(' · ')}
        />
      ),
    },
    {
      chiave: 'tipo',
      intestazione: 'Tipo',
      priorita: 'secondaria',
      cella: (f) => <StatoBadge etichetta={TIPO_FORNITORE_LABEL[f.tipo]} tono="neutro" />,
    },
    {
      chiave: 'contatti',
      intestazione: 'Contatti',
      classe: 'hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (f) => <CellaDoppia principale={f.email ?? '—'} secondario={f.telefono} />,
    },
    {
      chiave: 'citta',
      intestazione: 'Città',
      priorita: 'secondaria',
      cella: (f) => (f.citta ? `${f.citta}${f.provincia ? ` (${f.provincia})` : ''}` : '—'),
    },
    {
      chiave: 'lotti',
      intestazione: 'Lotti conferiti',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (f) => (f.lotti_conferiti ? f.lotti_conferiti : <span className="text-ink-mute">—</span>),
    },
    {
      chiave: 'speso',
      intestazione: 'Speso',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (f) =>
        f.speso_cents ? (
          <span className="tabular text-ink">{formatEuro(f.speso_cents)}</span>
        ) : (
          <span className="text-ink-mute">—</span>
        ),
    },
    {
      chiave: 'ultimo',
      intestazione: 'Ultimo acquisto',
      allineamento: 'destra',
      classe: 'hidden sm:table-cell',
      priorita: 'secondaria',
      cella: (f) =>
        f.ultimo_acquisto ? (
          <span className="tabular text-ink-soft">{formatData(f.ultimo_acquisto)}</span>
        ) : (
          <span className="text-ink-mute">—</span>
        ),
    },
    {
      chiave: 'azioni',
      intestazione: <span className="sr-only">Azioni</span>,
      allineamento: 'destra',
      classe: 'w-24',
      priorita: 'azione',
      cella: (f) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="btn-ghost"
            aria-label={`Modifica ${f.ragione_sociale}`}
            onClick={() => apriModifica(f)}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="btn-ghost"
            aria-label={`Elimina ${f.ragione_sociale}`}
            onClick={() => {
              setErroreEliminazione(null)
              setDaEliminare(f)
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
        titolo="Fornitori"
        sottotitolo="Demolitori, recuperanti, segherie e commercianti: da qui arrivano le partite di legno antico."
        azioni={
          <button type="button" className="btn-primary" onClick={apriNuovo}>
            <Plus size={16} />
            Nuovo fornitore
          </button>
        }
      />

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per nome, codice, città, P.IVA…"
        definizioni={[
          { chiave: 'tipo', etichetta: 'Tipo', tipo: 'select', opzioni: opzioniDa(TIPO_FORNITORE_LABEL) },
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
          chiaveRiga={(f) => f.id}
          classeRiga={(f) => (f.attivo ? '' : 'opacity-60')}
          messaggioVuoto="Nessun fornitore con questi filtri."
        />
      )}

      {modulo && (
        <Modale
          titolo={idModifica ? 'Modifica fornitore' : 'Nuovo fornitore'}
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
                <Campo etichetta="Ragione sociale" obbligatorio>
                  <Testo
                    valore={modulo.ragione_sociale}
                    onCambia={(v) => imposta({ ragione_sociale: v })}
                  />
                </Campo>
                <Campo etichetta="Tipo" obbligatorio>
                  <Scelta
                    valore={modulo.tipo}
                    onCambia={(v) => imposta({ tipo: v })}
                    opzioni={opzioniDa(TIPO_FORNITORE_LABEL)}
                  />
                </Campo>
                <Campo etichetta="Referente">
                  <Testo
                    valore={modulo.referente ?? ''}
                    onCambia={(v) => imposta({ referente: v || null })}
                  />
                </Campo>
                <Campo etichetta="Partita IVA">
                  <Testo valore={modulo.piva ?? ''} onCambia={(v) => imposta({ piva: v || null })} />
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

            <Sezione titolo="Essenze tipiche">
              <p className="mb-3 text-xs text-ink-mute">
                Che legno procura di solito: serve a sapere chi chiamare quando serve una partita.
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {(Object.keys(ESSENZA_LABEL) as Essenza[]).map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      checked={modulo.essenze_tipiche.includes(e)}
                      onChange={() => alternaEssenza(e)}
                      className="h-4 w-4 rounded border-line text-brand focus:ring-brand/40"
                    />
                    {ESSENZA_LABEL[e]}
                  </label>
                ))}
              </div>
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
                Fornitore attivo
              </label>
            </Sezione>
          </div>
        </Modale>
      )}

      {daEliminare && (
        <Conferma
          titolo="Eliminare il fornitore?"
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
