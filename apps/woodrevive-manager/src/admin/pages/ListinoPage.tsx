import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'

import { api } from '../api'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Scelta, Testo } from '../components/Campi'
import DataTable, { CellaDoppia, type Colonna } from '../components/DataTable'
import Filtri, { opzioniDa, type ValoriFiltri } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Caricamento, Errore, Modale, Sezione } from '../components/Ui'
import {
  CATEGORIA_LABEL,
  ESSENZA_LABEL,
  PATINA_LABEL,
  STADIO_LABEL,
  UM_LABEL,
  marginePercentualeArticolo,
  ricaricoPercentuale,
  type Articolo,
  type ArticoloInput,
  type CategoriaArticolo,
  type Essenza,
  type ID,
  type Patina,
  type Stadio,
  type UnitaMisura,
} from '../domain'
import {
  SIMBOLO_UM,
  centsAInput,
  euroACents,
  formatEuro,
  formatMm,
  formatPercentuale,
} from '../lib/format'
import { inputAMilli, milliAInput } from '../lib/qty'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Listino: la vista **commerciale** degli articoli — a quanto si compra, a
 * quanto si rivende e quanto ci resta in mezzo. Le giacenze e i movimenti
 * stanno in Magazzino: qui non compaiono apposta, perché chi fa un preventivo
 * guarda prezzi, non catasta.
 *
 * Margine e ricarico sono due numeri diversi e servono a due interlocutori
 * diversi: il margine è sul prezzo di vendita ed è quello che si difende con il
 * cliente, il ricarico è sul costo ed è quello con cui si tratta col fornitore.
 * Su 100 € di costo e 160 € di prezzo: margine 37,5%, ricarico 60%.
 *
 * I valori numerici vivono nel modulo come stringhe e si convertono al
 * salvataggio: un campo controllato che si riformatta a ogni tasto non lascia
 * digitare "89,5".
 */
interface ModuloArticolo {
  nome: string
  descrizione: string
  stadio: Stadio
  categoria: CategoriaArticolo
  essenza: Essenza | null
  patina: Patina | null
  spessore_mm: string
  larghezza_min_mm: string
  larghezza_max_mm: string
  lunghezza_min_mm: string
  lunghezza_max_mm: string
  unita_misura: UnitaMisura
  mc_per_unita: string
  prezzo_acquisto: string
  prezzo: string
  aliquota_iva: string
  scorta_minima: string
  ubicazione: string
  attivo: boolean
  note: string
}

const NUOVO: ModuloArticolo = {
  nome: '',
  descrizione: '',
  stadio: 'finito',
  categoria: 'tavola',
  essenza: null,
  patina: null,
  spessore_mm: '',
  larghezza_min_mm: '',
  larghezza_max_mm: '',
  lunghezza_min_mm: '',
  lunghezza_max_mm: '',
  unita_misura: 'mq',
  mc_per_unita: '',
  prezzo_acquisto: '',
  prezzo: '',
  aliquota_iva: '22',
  scorta_minima: '',
  ubicazione: '',
  attivo: true,
  note: '',
}

/** Millimetri e altri interi: vuoto o illeggibile → null. */
function intero(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'))
  return v.trim() && Number.isFinite(n) ? Math.round(n) : null
}

function numero(v: string): number {
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function daArticolo(a: Articolo): ModuloArticolo {
  const mm = (v: number | null) => (v == null ? '' : String(v))
  return {
    nome: a.nome,
    descrizione: a.descrizione ?? '',
    stadio: a.stadio,
    categoria: a.categoria,
    essenza: a.essenza,
    patina: a.patina,
    spessore_mm: mm(a.spessore_mm),
    larghezza_min_mm: mm(a.larghezza_min_mm),
    larghezza_max_mm: mm(a.larghezza_max_mm),
    lunghezza_min_mm: mm(a.lunghezza_min_mm),
    lunghezza_max_mm: mm(a.lunghezza_max_mm),
    unita_misura: a.unita_misura,
    mc_per_unita: mm(a.mc_per_unita_milli),
    prezzo_acquisto: centsAInput(a.prezzo_acquisto_cents),
    prezzo: centsAInput(a.prezzo_listino_cents),
    aliquota_iva: String(a.aliquota_iva).replace('.', ','),
    scorta_minima: milliAInput(a.scorta_minima_milli),
    ubicazione: a.ubicazione ?? '',
    attivo: a.attivo,
    note: a.note ?? '',
  }
}

function aInput(m: ModuloArticolo): ArticoloInput {
  return {
    nome: m.nome.trim(),
    descrizione: m.descrizione.trim() || null,
    // Una voce creata a mano qui è legno che si tiene in magazzino. Servizi di
    // terzi e spese esistono solo fra i dati importati dal vecchio gestionale:
    // il giorno che serviranno a listino, questi due campi diventano un
    // selettore nel modulo.
    natura: 'merce',
    gestione_magazzino: true,
    stadio: m.stadio,
    categoria: m.categoria,
    essenza: m.essenza,
    patina: m.patina,
    spessore_mm: intero(m.spessore_mm),
    larghezza_min_mm: intero(m.larghezza_min_mm),
    larghezza_max_mm: intero(m.larghezza_max_mm),
    lunghezza_min_mm: intero(m.lunghezza_min_mm),
    lunghezza_max_mm: intero(m.lunghezza_max_mm),
    unita_misura: m.unita_misura,
    // Già in millesimi di m³: si digita 30 per una tavola da 30 mm venduta a m².
    mc_per_unita_milli: intero(m.mc_per_unita),
    prezzo_acquisto_cents: euroACents(m.prezzo_acquisto),
    prezzo_listino_cents: euroACents(m.prezzo),
    aliquota_iva: numero(m.aliquota_iva),
    scorta_minima_milli: inputAMilli(m.scorta_minima),
    ubicazione: m.ubicazione.trim() || null,
    attivo: m.attivo,
    note: m.note.trim() || null,
  }
}

export default function ListinoPage() {
  const [filtri, setFiltri] = useState<ValoriFiltri>({})
  const { dati, caricamento, errore, ricarica } = useFetch(
    () =>
      api.listaArticoli({
        q: filtri.q,
        stadio: filtri.stadio,
        categoria: filtri.categoria,
        essenza: filtri.essenza,
        soloAttivi: filtri.soloAttivi === '1',
      }),
    [JSON.stringify(filtri)],
  )

  const [modulo, setModulo] = useState<ModuloArticolo | null>(null)
  const [idModifica, setIdModifica] = useState<ID | null>(null)
  const [erroreForm, setErroreForm] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const apriNuovo = () => {
    setIdModifica(null)
    setErroreForm(null)
    setModulo(NUOVO)
  }

  const apriModifica = (a: Articolo) => {
    setIdModifica(a.id)
    setErroreForm(null)
    setModulo(daArticolo(a))
  }

  const chiudi = () => {
    setModulo(null)
    setIdModifica(null)
    setErroreForm(null)
  }

  const imposta = (parziale: Partial<ModuloArticolo>) =>
    setModulo((m) => (m ? { ...m, ...parziale } : m))

  const salva = async () => {
    if (!modulo) return
    setInCorso(true)
    setErroreForm(null)
    try {
      if (idModifica) await api.aggiornaArticolo(idModifica, aInput(modulo))
      else await api.creaArticolo(aInput(modulo))
      chiudi()
      ricarica()
    } catch (e) {
      setErroreForm(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  /*
   * Sotto `md:` le colonne diventano card impilate (vedi `priorita` in
   * DataTable). Il listino ha undici colonne: su un telefono ne servono
   * quattro — che articolo è, a quanto lo vendo, quanto ci guadagno — e le
   * altre sono numeri da monitor, non da schermo da 390px.
   */
  const colonne: Colonna<Articolo>[] = [
    {
      chiave: 'codice',
      intestazione: 'Codice',
      classe: 'w-28',
      // Nella card il codice sta già sotto il nome, in `CellaDoppia`.
      priorita: 'solo-tabella',
      cella: (a) => <span className="text-ink-soft">{a.codice}</span>,
    },
    {
      chiave: 'articolo',
      intestazione: 'Articolo',
      priorita: 'principale',
      cella: (a) => (
        <CellaDoppia
          principale={
            <span className="flex flex-wrap items-center gap-2">
              {a.nome}
              {!a.attivo && <StatoBadge etichetta="Non attivo" tono="neutro" />}
            </span>
          }
          secondario={
            [
              a.essenza ? ESSENZA_LABEL[a.essenza] : null,
              a.patina ? PATINA_LABEL[a.patina] : null,
              a.spessore_mm ? formatMm(a.spessore_mm) : null,
            ]
              .filter(Boolean)
              .join(' · ') || null
          }
        />
      ),
    },
    {
      chiave: 'stadio',
      intestazione: 'Stadio',
      classe: 'hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (a) => <StatoBadge etichetta={STADIO_LABEL[a.stadio]} tono="neutro" />,
    },
    {
      chiave: 'categoria',
      intestazione: 'Categoria',
      classe: 'hidden md:table-cell',
      priorita: 'solo-tabella',
      cella: (a) => <span className="text-ink-soft">{CATEGORIA_LABEL[a.categoria]}</span>,
    },
    {
      chiave: 'um',
      intestazione: 'UdM',
      priorita: 'secondaria',
      cella: (a) => <span title={UM_LABEL[a.unita_misura]}>{SIMBOLO_UM[a.unita_misura]}</span>,
    },
    {
      chiave: 'acquisto',
      intestazione: 'Prezzo acquisto',
      allineamento: 'destra',
      classe: 'whitespace-nowrap hidden md:table-cell',
      priorita: 'solo-tabella',
      cella: (a) =>
        a.prezzo_acquisto_cents ? (
          <span className="tabular text-ink-soft">{formatEuro(a.prezzo_acquisto_cents)}</span>
        ) : (
          <span className="text-ink-mute">—</span>
        ),
    },
    {
      chiave: 'costo',
      intestazione: 'Costo medio',
      allineamento: 'destra',
      classe: 'whitespace-nowrap hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (a) =>
        a.costo_medio_cents ? (
          <span className="tabular text-ink-soft">{formatEuro(a.costo_medio_cents)}</span>
        ) : (
          <span className="text-ink-mute">—</span>
        ),
    },
    {
      chiave: 'prezzo',
      intestazione: 'Prezzo listino',
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'secondaria',
      cella: (a) => (
        <span className="tabular font-medium text-ink">{formatEuro(a.prezzo_listino_cents)}</span>
      ),
    },
    {
      chiave: 'iva',
      intestazione: 'IVA %',
      allineamento: 'destra',
      classe: 'hidden xl:table-cell',
      priorita: 'solo-tabella',
      cella: (a) => <span className="tabular">{formatPercentuale(a.aliquota_iva, 0)}</span>,
    },
    {
      // Margine sul prezzo di vendita. `—` quando il costo non si conosce:
      // mostrare 0% direbbe «lo vendo al costo», che è un'altra cosa.
      chiave: 'margine',
      intestazione: 'Margine %',
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'secondaria',
      cella: (a) => {
        const m = marginePercentualeArticolo(a)
        if (m == null) return <span className="text-ink-mute">—</span>
        return (
          <span className={`tabular font-medium ${m < 0 ? 'text-danger' : 'text-ink'}`}>
            {formatPercentuale(m)}
          </span>
        )
      },
    },
    {
      // Ricarico sul costo: il numero con cui si tratta con il fornitore.
      chiave: 'ricarico',
      intestazione: 'Ricarico %',
      allineamento: 'destra',
      classe: 'whitespace-nowrap hidden lg:table-cell',
      priorita: 'solo-tabella',
      cella: (a) => {
        const r = ricaricoPercentuale(a)
        if (r == null) return <span className="text-ink-mute">—</span>
        return (
          <span className={`tabular ${r < 0 ? 'text-danger' : 'text-ink-soft'}`}>
            {formatPercentuale(r)}
          </span>
        )
      },
    },
    {
      chiave: 'azioni',
      intestazione: <span className="sr-only">Azioni</span>,
      allineamento: 'destra',
      classe: 'w-16',
      priorita: 'azione',
      cella: (a) => (
        <button
          type="button"
          className="btn-ghost"
          aria-label={`Modifica ${a.nome}`}
          onClick={() => apriModifica(a)}
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Listino"
        sottotitolo="Cosa Wood Revive compra e rivende: prezzo d’acquisto, prezzo di vendita, margine e ricarico. Le giacenze stanno in Magazzino."
        azioni={
          <button type="button" className="btn-primary" onClick={apriNuovo}>
            <Plus size={16} />
            Nuovo articolo
          </button>
        }
      />

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per nome, codice, descrizione…"
        definizioni={[
          { chiave: 'stadio', etichetta: 'Stadio', tipo: 'select', opzioni: opzioniDa(STADIO_LABEL) },
          {
            chiave: 'categoria',
            etichetta: 'Categoria',
            tipo: 'select',
            opzioni: opzioniDa(CATEGORIA_LABEL),
          },
          { chiave: 'essenza', etichetta: 'Essenza', tipo: 'select', opzioni: opzioniDa(ESSENZA_LABEL) },
          { chiave: 'soloAttivi', etichetta: 'Solo attivi', tipo: 'check' },
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
          chiaveRiga={(a) => a.id}
          classeRiga={(a) => (a.attivo ? '' : 'opacity-60')}
          messaggioVuoto="Nessun articolo con questi filtri."
        />
      )}

      {modulo && (
        <Modale
          titolo={idModifica ? 'Modifica articolo' : 'Nuovo articolo'}
          sottotitolo={
            idModifica
              ? 'Giacenza e costo medio non si modificano da qui: li muovono i movimenti di magazzino.'
              : 'Il codice viene assegnato automaticamente al salvataggio.'
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
            <Sezione titolo="Articolo">
              <GrigliaCampi>
                <Campo etichetta="Nome" obbligatorio className="md:col-span-2">
                  <Testo valore={modulo.nome} onCambia={(v) => imposta({ nome: v })} />
                </Campo>
                <Campo etichetta="Descrizione" className="md:col-span-2">
                  <AreaTesto
                    valore={modulo.descrizione}
                    onCambia={(v) => imposta({ descrizione: v })}
                    righe={2}
                  />
                </Campo>
                <Campo etichetta="Stadio">
                  <Scelta
                    valore={modulo.stadio}
                    onCambia={(v) => imposta({ stadio: v })}
                    opzioni={opzioniDa(STADIO_LABEL)}
                  />
                </Campo>
                <Campo etichetta="Categoria">
                  <Scelta
                    valore={modulo.categoria}
                    onCambia={(v) => imposta({ categoria: v })}
                    opzioni={opzioniDa(CATEGORIA_LABEL)}
                  />
                </Campo>
                <Campo etichetta="Essenza">
                  <Scelta
                    valore={modulo.essenza ?? ''}
                    onCambia={(v) => imposta({ essenza: v || null })}
                    opzioni={opzioniDa(ESSENZA_LABEL)}
                    vuoto="Nessuna"
                  />
                </Campo>
                <Campo etichetta="Patina">
                  <Scelta
                    valore={modulo.patina ?? ''}
                    onCambia={(v) => imposta({ patina: v || null })}
                    opzioni={opzioniDa(PATINA_LABEL)}
                    vuoto="Nessuna"
                  />
                </Campo>
              </GrigliaCampi>
            </Sezione>

            <Sezione titolo="Misure">
              <GrigliaCampi colonne={3}>
                <Campo etichetta="Spessore (mm)">
                  <Testo
                    valore={modulo.spessore_mm}
                    onCambia={(v) => imposta({ spessore_mm: v })}
                    inputMode="numeric"
                  />
                </Campo>
                <Campo etichetta="Larghezza min (mm)">
                  <Testo
                    valore={modulo.larghezza_min_mm}
                    onCambia={(v) => imposta({ larghezza_min_mm: v })}
                    inputMode="numeric"
                  />
                </Campo>
                <Campo etichetta="Larghezza max (mm)">
                  <Testo
                    valore={modulo.larghezza_max_mm}
                    onCambia={(v) => imposta({ larghezza_max_mm: v })}
                    inputMode="numeric"
                  />
                </Campo>
                <Campo etichetta="Lunghezza min (mm)">
                  <Testo
                    valore={modulo.lunghezza_min_mm}
                    onCambia={(v) => imposta({ lunghezza_min_mm: v })}
                    inputMode="numeric"
                  />
                </Campo>
                <Campo etichetta="Lunghezza max (mm)">
                  <Testo
                    valore={modulo.lunghezza_max_mm}
                    onCambia={(v) => imposta({ lunghezza_max_mm: v })}
                    inputMode="numeric"
                  />
                </Campo>
              </GrigliaCampi>
            </Sezione>

            <Sezione titolo="Acquisto e vendita">
              <GrigliaCampi colonne={3}>
                <Campo etichetta="Unità di misura">
                  <Scelta
                    valore={modulo.unita_misura}
                    onCambia={(v) => imposta({ unita_misura: v })}
                    opzioni={opzioniDa(UM_LABEL)}
                  />
                </Campo>
                <Campo
                  etichetta="Prezzo d’acquisto (€)"
                  aiuto="Quanto costa comprarlo dal fornitore, IVA esclusa. Si aggiorna da solo all’ultima ricezione."
                >
                  <Testo
                    valore={modulo.prezzo_acquisto}
                    onCambia={(v) => imposta({ prezzo_acquisto: v })}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </Campo>
                <Campo etichetta="Prezzo di listino (€)">
                  <Testo
                    valore={modulo.prezzo}
                    onCambia={(v) => imposta({ prezzo: v })}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </Campo>
                <Campo etichetta="Aliquota IVA %">
                  <Testo
                    valore={modulo.aliquota_iva}
                    onCambia={(v) => imposta({ aliquota_iva: v })}
                    inputMode="decimal"
                  />
                </Campo>
                <Campo
                  etichetta="Metri cubi per unità"
                  aiuto="Il fornitore quota a metri cubi e il listino è a metri quadri: senza questo ponte i due prezzi non si possono accostare. Per un articolo a m² coincide con lo spessore in mm (30 mm → 30)."
                >
                  <Testo
                    valore={modulo.mc_per_unita}
                    onCambia={(v) => imposta({ mc_per_unita: v })}
                    inputMode="numeric"
                    placeholder="30"
                  />
                </Campo>
                <Campo
                  etichetta="Scorta minima"
                  aiuto={`Nell’unità dell’articolo (${SIMBOLO_UM[modulo.unita_misura]}).`}
                >
                  <Testo
                    valore={modulo.scorta_minima}
                    onCambia={(v) => imposta({ scorta_minima: v })}
                    inputMode="decimal"
                  />
                </Campo>
              </GrigliaCampi>
              <p className="mt-3 text-xs leading-relaxed text-ink-mute">
                Margine e ricarico non si scrivono: li calcola il listino dal costo medio dei
                carichi, e se l’articolo non è mai stato caricato ripiega sul prezzo d’acquisto.
                Restano vuoti finché non si conosce nessuno dei due — un margine sconosciuto non è
                un margine di zero.
              </p>
            </Sezione>

            <Sezione titolo="Altro">
              <GrigliaCampi>
                <Campo etichetta="Ubicazione">
                  <Testo
                    valore={modulo.ubicazione}
                    onCambia={(v) => imposta({ ubicazione: v })}
                    placeholder="Capannone A — campata 3"
                  />
                </Campo>
                <Campo etichetta="Note" className="md:col-span-2">
                  <AreaTesto
                    valore={modulo.note}
                    onCambia={(v) => imposta({ note: v })}
                    righe={3}
                  />
                </Campo>
              </GrigliaCampi>
              <label className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={modulo.attivo}
                  onChange={(e) => imposta({ attivo: e.target.checked })}
                  className="h-4 w-4 rounded border-line text-brand focus:ring-brand/40"
                />
                Articolo attivo a listino
              </label>
            </Sezione>
          </div>
        </Modale>
      )}
    </>
  )
}
