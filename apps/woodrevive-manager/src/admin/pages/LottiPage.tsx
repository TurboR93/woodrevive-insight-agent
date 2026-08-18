import { Plus } from 'lucide-react'
import { useState } from 'react'

import { api } from '../api'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Scelta, Testo } from '../components/Campi'
import DataTable from '../components/DataTable'
import type { Colonna } from '../components/DataTable'
import Filtri, { opzioniDa } from '../components/Filtri'
import type { ValoriFiltri } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Caricamento, Errore, Modale } from '../components/Ui'
import { useDatiCambiati } from '../components/eventiDati'
import {
  ESSENZA_LABEL,
  PATINA_LABEL,
  QUALITA_LABEL,
  STATO_LOTTO_LABEL,
  TONO_LOTTO,
} from '../domain'
import type { Essenza, ID, Lotto, LottoInput, Patina, Qualita } from '../domain'
import { euroACents, formatData, formatEuro, oggiISO } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Elenco dei lotti — le **partite d'acquisto**.
 *
 * Il lotto non è una fase di lavorazione: è da dove viene il materiale. Serve
 * perché la provenienza («le tavole del fienile di Cordignano») è parte di ciò
 * che Wood Revive vende, e un cliente che fra cinque anni chiede da dove viene
 * il suo pavimento deve ottenere risposta.
 *
 * Le quantità NON stanno sul lotto: stanno sugli articoli caricati con quella
 * partita. Qui si mostra quanto è costata e quanto ne resta a valore — il
 * dettaglio articolo per articolo sta nella scheda.
 *
 * È una delle due schermate che si guardano **in magazzino e davanti al
 * cliente**: sotto `md:` la tabella diventa card e di ogni partita restano le
 * due cose che si chiedono davvero — da dove viene e quanto ne resta. Costo,
 * fornitore e qualità sono densità da ufficio e sotto `md:` non compaiono.
 */
export default function LottiPage() {
  const [filtri, setFiltri] = useState<ValoriFiltri>({})
  const [nuovo, setNuovo] = useState(false)

  const { dati, caricamento, errore, ricarica } = useFetch(async () => {
    const [lotti, fornitori] = await Promise.all([
      api.listaLotti({
        q: filtri.q,
        stato: filtri.stato,
        essenza: filtri.essenza,
        patina: filtri.patina,
      }),
      api.listaFornitori(),
    ])
    /*
     * Il valore residuo si deriva dalle coppie (articolo, lotto): il lotto non
     * porta nessuna quantità propria. Una chiamata per partita è accettabile
     * con questi numeri; con un backend vero diventerà un solo aggregato.
     */
    const giacenze = await Promise.all(lotti.map((l) => api.giacenzePerLotto(l.id)))
    const residuo = new Map<ID, number>(
      lotti.map((l, i) => [
        l.id,
        giacenze[i].reduce((t, v) => t + v.valore_residuo_cents, 0),
      ]),
    )
    const nomiFornitori = new Map<ID, string>(fornitori.map((f) => [f.id, f.ragione_sociale]))
    return { lotti, residuo, nomiFornitori }
  }, [filtri.q, filtri.stato, filtri.essenza, filtri.patina])
  // Una fornitura appena caricata fa nascere una partita: la lista la deve
  // vedere senza che nessuno ricarichi la pagina.
  useDatiCambiati(ricarica)

  const colonne: Colonna<Lotto>[] = [
    {
      chiave: 'codice',
      intestazione: 'Codice',
      priorita: 'solo-tabella',
      cella: (l) => <span className="tabular font-semibold text-ink">{l.codice}</span>,
      classe: 'whitespace-nowrap',
    },
    {
      // Sulla card è il titolo, e la provenienza sta dentro il titolo invece
      // che in una riga di dettaglio: è l'informazione per cui la partita
      // esiste, non una postilla.
      chiave: 'lotto',
      intestazione: 'Lotto',
      priorita: 'principale',
      cella: (l) => (
        <div className="leading-tight">
          <div className="text-base font-semibold text-ink md:text-sm md:font-medium">
            {/* Il codice ha una colonna sua nella tabella: sulla card, dove
                quella colonna non c'è, entra nel titolo. */}
            <span className="tabular text-ink-mute md:hidden">{l.codice} · </span>
            {l.descrizione}
          </div>
          <div className="mt-0.5 text-sm text-ink-soft md:text-xs md:text-ink-mute">
            {provenienza(l)}
          </div>
        </div>
      ),
    },
    {
      chiave: 'materiale',
      intestazione: 'Essenza / patina',
      priorita: 'secondaria',
      cella: (l) => (
        <div className="leading-tight">
          <div className="text-ink">{ESSENZA_LABEL[l.essenza]}</div>
          <div className="mt-0.5 text-xs text-ink-mute">{PATINA_LABEL[l.patina]}</div>
        </div>
      ),
    },
    {
      chiave: 'qualita',
      intestazione: 'Qualità',
      priorita: 'solo-tabella',
      // La sigla basta in tabella; la dicitura estesa sta nel titolo, come per
      // l'unità di misura nel listino.
      cella: (l) => (
        <span className="text-ink-soft" title={QUALITA_LABEL[l.qualita]}>
          {l.qualita}
        </span>
      ),
    },
    {
      chiave: 'fornitore',
      intestazione: 'Fornitore',
      classe: 'hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (l) => (
        <span className="text-ink-soft">
          {(l.fornitore_id && dati?.nomiFornitori.get(l.fornitore_id)) || '—'}
        </span>
      ),
    },
    {
      chiave: 'data',
      intestazione: 'Data acquisto',
      priorita: 'secondaria',
      etichettaCard: 'Comprata il',
      cella: (l) => <span className="tabular text-ink-soft">{formatData(l.data_acquisto)}</span>,
      classe: 'whitespace-nowrap hidden md:table-cell',
    },
    {
      chiave: 'costo',
      intestazione: 'Costo partita',
      allineamento: 'destra',
      priorita: 'solo-tabella',
      cella: (l) => <span className="tabular text-ink">{formatEuro(l.costo_acquisto_cents)}</span>,
      classe: 'whitespace-nowrap',
    },
    {
      // L'altra domanda del magazzino: quanto ne resta. Sotto md: si legge
      // grande, da md: in su torna densa come le altre colonne.
      chiave: 'residuo',
      intestazione: 'Valore residuo',
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'secondaria',
      etichettaCard: 'Ne resta',
      cella: (l) => {
        const v = dati?.residuo.get(l.id) ?? 0
        return (
          <span
            className={`tabular text-lg font-semibold md:text-sm ${v > 0 ? 'text-ink' : 'text-ink-mute'}`}
          >
            {formatEuro(v)}
          </span>
        )
      },
    },
    {
      chiave: 'stato',
      intestazione: 'Stato',
      priorita: 'secondaria',
      cella: (l) => <StatoBadge etichetta={STATO_LOTTO_LABEL[l.stato]} tono={TONO_LOTTO[l.stato]} />,
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Lotti"
        sottotitolo="Le partite d’acquisto: da chi sono state comprate, da quale edificio vengono e quanto ne resta."
        azioni={
          <button type="button" className="btn-primary" onClick={() => setNuovo(true)}>
            <Plus size={16} />
            Nuovo lotto
          </button>
        }
      />

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per codice, descrizione, edificio…"
        definizioni={[
          { chiave: 'stato', etichetta: 'Stato', tipo: 'select', opzioni: opzioniDa(STATO_LOTTO_LABEL) },
          { chiave: 'essenza', etichetta: 'Essenza', tipo: 'select', opzioni: opzioniDa(ESSENZA_LABEL) },
          { chiave: 'patina', etichetta: 'Patina', tipo: 'select', opzioni: opzioniDa(PATINA_LABEL) },
        ]}
      />

      {caricamento && !dati ? (
        <Caricamento etichetta="Carico i lotti…" />
      ) : errore ? (
        <Errore messaggio={errore} onRiprova={ricarica} />
      ) : (
        <DataTable
          righe={dati?.lotti ?? []}
          colonne={colonne}
          chiaveRiga={(l) => l.id}
          linkRiga={(l) => `/lotti/${l.id}`}
          messaggioVuoto="Nessun lotto con questi criteri."
        />
      )}

      {nuovo && (
        <ModaleNuovoLotto
          onChiudi={() => setNuovo(false)}
          onSalvato={() => {
            setNuovo(false)
            ricarica()
          }}
        />
      )}
    </>
  )
}

/** "Fienile ottocentesco — Cordignano (TV)" */
function provenienza(l: Lotto): string {
  const luogo = [l.provenienza_localita, l.provenienza_provincia ? `(${l.provenienza_provincia})` : null]
    .filter(Boolean)
    .join(' ')
  return [l.provenienza_edificio, luogo].filter(Boolean).join(' — ') || 'Provenienza non registrata'
}

// ---------------------------------------------------------------------------
// Nuovo lotto
// ---------------------------------------------------------------------------

/**
 * Censire una partita a mano non carica niente a magazzino: la merce entra con
 * la ricezione dell'acquisto o con una rettifica di inventario. Qui si registra
 * solo da dove viene e quanto è costata.
 */
function ModaleNuovoLotto({ onChiudi, onSalvato }: { onChiudi: () => void; onSalvato: () => void }) {
  const fornitori = useFetch(() => api.listaFornitori(), [])

  const [descrizione, setDescrizione] = useState('')
  const [fornitoreId, setFornitoreId] = useState('')
  const [edificio, setEdificio] = useState('')
  const [localita, setLocalita] = useState('')
  const [provincia, setProvincia] = useState('')
  const [anno, setAnno] = useState('')
  const [dataAcquisto, setDataAcquisto] = useState(oggiISO())
  const [essenza, setEssenza] = useState<Essenza>('abete')
  const [patina, setPatina] = useState<Patina>('prima_patina')
  const [qualita, setQualita] = useState<Qualita>('B')
  const [costo, setCosto] = useState('')
  const [ubicazione, setUbicazione] = useState('')
  const [noteStoriche, setNoteStoriche] = useState('')

  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const salva = async () => {
    setInCorso(true)
    setErrore(null)
    const input: LottoInput = {
      descrizione: descrizione.trim(),
      fornitore_id: fornitoreId || null,
      ordine_acquisto_id: null,
      provenienza_edificio: edificio.trim() || null,
      provenienza_localita: localita.trim() || null,
      provenienza_provincia: provincia.trim().toUpperCase() || null,
      anno_costruzione_stimato: anno ? Number(anno) : null,
      data_acquisto: dataAcquisto,
      essenza,
      patina,
      qualita,
      costo_acquisto_cents: euroACents(costo),
      ubicazione: ubicazione.trim() || null,
      // Lo stato lo deriva la giacenza residua della partita: si nasce
      // disponibili e si diventa esauriti quando non resta più niente.
      stato: 'disponibile',
      note_storiche: noteStoriche.trim() || null,
      note: null,
      foto: [],
    }
    try {
      await api.creaLotto(input)
      onSalvato()
    } catch (e) {
      setErrore(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Modale
      titolo="Nuovo lotto"
      sottotitolo="La provenienza è parte di ciò che il cliente compra: compilala quando la conosci."
      onChiudi={onChiudi}
      larghezza="max-w-3xl"
      variante="foglio"
      piede={
        <>
          <button type="button" className="btn-secondary" onClick={onChiudi} disabled={inCorso}>
            Annulla
          </button>
          <button type="button" className="btn-primary" onClick={salva} disabled={inCorso}>
            {inCorso ? 'Attendi…' : 'Crea lotto'}
          </button>
        </>
      }
    >
      <AvvisoErrore messaggio={errore} />

      <div className="space-y-4">
        <p className="rounded-lg bg-tint/30 px-3 py-2 text-sm leading-relaxed text-ink-soft">
          Il lotto censisce una partita: da solo non carica nulla a magazzino. La merce entra
          registrando la ricezione dell’ordine di acquisto, che collega ogni articolo a questa
          partita.
        </p>

        <GrigliaCampi>
          <Campo etichetta="Descrizione" obbligatorio className="md:col-span-2">
            <Testo
              valore={descrizione}
              onCambia={setDescrizione}
              placeholder="Fienile di Cordignano — tavolame e travi"
            />
          </Campo>
          <Campo etichetta="Fornitore">
            <Scelta
              valore={fornitoreId}
              onCambia={setFornitoreId}
              vuoto="— nessuno —"
              opzioni={(fornitori.dati ?? []).map((f) => ({
                valore: f.id,
                etichetta: f.ragione_sociale,
              }))}
            />
          </Campo>
          <Campo etichetta="Data di acquisto" obbligatorio>
            <Testo valore={dataAcquisto} onCambia={setDataAcquisto} type="date" />
          </Campo>
        </GrigliaCampi>

        <GrigliaCampi colonne={3}>
          <Campo etichetta="Edificio di provenienza">
            <Testo valore={edificio} onCambia={setEdificio} placeholder="Fienile ottocentesco" />
          </Campo>
          <Campo etichetta="Località">
            <Testo valore={localita} onCambia={setLocalita} placeholder="Cordignano" />
          </Campo>
          <Campo etichetta="Provincia">
            <Testo valore={provincia} onCambia={setProvincia} placeholder="TV" maxLength={2} />
          </Campo>
          <Campo etichetta="Anno di costruzione stimato">
            <Testo valore={anno} onCambia={setAnno} type="number" placeholder="1890" />
          </Campo>
          <Campo etichetta="Ubicazione in magazzino" className="md:col-span-2">
            <Testo valore={ubicazione} onCambia={setUbicazione} placeholder="Capannone A — campata 3" />
          </Campo>
        </GrigliaCampi>

        <GrigliaCampi colonne={3}>
          <Campo etichetta="Essenza" obbligatorio>
            <Scelta valore={essenza} onCambia={setEssenza} opzioni={opzioniDa(ESSENZA_LABEL)} />
          </Campo>
          <Campo etichetta="Patina" obbligatorio>
            <Scelta valore={patina} onCambia={setPatina} opzioni={opzioniDa(PATINA_LABEL)} />
          </Campo>
          <Campo etichetta="Qualità" obbligatorio>
            <Scelta valore={qualita} onCambia={setQualita} opzioni={opzioniDa(QUALITA_LABEL)} />
          </Campo>
        </GrigliaCampi>

        <GrigliaCampi>
          <Campo
            etichetta="Costo della partita (€)"
            aiuto="Quanto è costata tutta la fornitura, quota di trasporto compresa."
          >
            <Testo valore={costo} onCambia={setCosto} placeholder="4.960,00" inputMode="decimal" />
          </Campo>
          <Campo etichetta="Note storiche" aiuto="È il testo che si racconta al cliente.">
            <AreaTesto
              valore={noteStoriche}
              onCambia={setNoteStoriche}
              righe={3}
              placeholder="Fienile costruito attorno al 1890, tavolame esposto a sud…"
            />
          </Campo>
        </GrigliaCampi>
      </div>
    </Modale>
  )
}
