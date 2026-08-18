import { ClipboardCheck, Minus, Percent, Plus, TriangleAlert, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { AvvisoErrore, Campo, Testo } from '../components/Campi'
import DataTable from '../components/DataTable'
import type { Colonna } from '../components/DataTable'
import Filtri, { opzioniDa } from '../components/Filtri'
import type { ValoriFiltri } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import { Caricamento, Errore, KpiCard, Modale } from '../components/Ui'
import { useDatiCambiati } from '../components/eventiDati'
import {
  CATEGORIA_LABEL,
  ESSENZA_LABEL,
  STADIO_LABEL,
  UM_LABEL,
  disponibile,
  marginePercentualeArticolo,
  sottoScorta,
  valoreGiacenza,
} from '../domain'
import type { Articolo } from '../domain'
import { SIMBOLO_UM, formatEuro, formatPercentuale, formatQuantita } from '../lib/format'
import { inputAMilli, milliAInput } from '../lib/qty'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Articoli, vista di magazzino: giacenza, impegnato, disponibile, scorta — e
 * accanto il numero che conta per chi compra e rivende, il margine.
 *
 * Il listino resta la vista commerciale (prezzo d'acquisto, ricarico, form di
 * modifica); qui il margine serve a un'altra domanda: di quello che ho in
 * capannone, cosa rende e cosa è capitale fermo.
 *
 * È anche la schermata che si guarda **davanti al cliente e in magazzino**:
 * sotto `md:` la tabella diventa card e di ogni articolo restano le due cose
 * che si chiedono davvero — quanto ne ho di disponibile e quanto costa. Il
 * resto (impegnato, costo medio, margine, valore) è densità da ufficio e sotto
 * `md:` non compare.
 *
 * Accetta `?q=<testo>`: è così che si arriva qui da un link, per esempio dagli
 * articoli appena caricati con una fornitura.
 */
export default function ArticoliPage() {
  const [parametri] = useSearchParams()
  const cercato = parametri.get('q') ?? ''

  // L'oggetto si costruisce vuoto e si riempie: il ternario produrrebbe
  // `{ q?: undefined }`, che non soddisfa l'index signature di ValoriFiltri.
  const [filtri, setFiltri] = useState<ValoriFiltri>(() => {
    const iniziali: ValoriFiltri = {}
    if (cercato) iniziali.q = cercato
    return iniziali
  })
  const [rettifica, setRettifica] = useState<Articolo | null>(null)

  // Il link può cambiare mentre la pagina è già montata (dalla ricerca rapida,
  // o da due esiti di carico di fila): la ricerca deve seguirlo.
  useEffect(() => {
    if (cercato) setFiltri((f) => (f.q === cercato ? f : { ...f, q: cercato }))
  }, [cercato])

  const { dati, caricamento, errore, ricarica } = useFetch(async () => {
    const [righe, tutti] = await Promise.all([
      api.listaArticoli({
        q: filtri.q,
        stadio: filtri.stadio,
        categoria: filtri.categoria,
        essenza: filtri.essenza,
        soloSottoScorta: filtri.sottoScorta === '1',
      }),
      api.listaArticoli(),
    ])
    return { righe, tutti }
  }, [filtri.q, filtri.stadio, filtri.categoria, filtri.essenza, filtri.sottoScorta])
  useDatiCambiati(ricarica)

  const tutti = dati?.tutti ?? []
  const valoreMagazzino = tutti.reduce((t, a) => t + valoreGiacenza(a), 0)
  const inSottoScorta = tutti.filter(sottoScorta).length

  /*
   * Margine medio: media semplice sugli articoli di cui si conosce il costo.
   * Non si contano quelli senza costo come zero — un margine sconosciuto e un
   * margine nullo sono cose diverse, e mescolarli abbasserebbe la media di
   * roba che nessuno ha mai comprato.
   */
  const marginiNoti = tutti
    .map((a) => marginePercentualeArticolo(a))
    .filter((m): m is number => m != null)
  const margineMedio = marginiNoti.length
    ? marginiNoti.reduce((t, m) => t + m, 0) / marginiNoti.length
    : null

  const colonne: Colonna<Articolo>[] = [
    {
      chiave: 'codice',
      intestazione: 'Codice',
      priorita: 'solo-tabella',
      cella: (a) => <span className="tabular font-semibold text-ink">{a.codice}</span>,
      classe: 'whitespace-nowrap',
    },
    {
      chiave: 'articolo',
      intestazione: 'Articolo',
      priorita: 'principale',
      cella: (a) => (
        <div className="leading-tight">
          <div className="text-base font-semibold text-ink md:text-sm md:font-medium">
            {/* Il codice ha una colonna sua nella tabella: sulla card, dove
                quella colonna non c'è, entra nel titolo. */}
            <span className="tabular text-ink-mute md:hidden">{a.codice} · </span>
            {a.nome}
          </div>
          <div className="mt-0.5 text-xs text-ink-mute">
            {[STADIO_LABEL[a.stadio], a.ubicazione].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      chiave: 'um',
      intestazione: 'UdM',
      priorita: 'solo-tabella',
      cella: (a) => (
        <span className="text-ink-soft" title={UM_LABEL[a.unita_misura]}>
          {SIMBOLO_UM[a.unita_misura]}
        </span>
      ),
    },
    {
      chiave: 'giacenza',
      intestazione: 'Giacenza',
      allineamento: 'destra',
      priorita: 'solo-tabella',
      cella: (a) => (
        <span className="tabular text-ink">
          {formatQuantita(a.giacenza_milli, a.unita_misura, false)}
        </span>
      ),
    },
    {
      chiave: 'impegnato',
      intestazione: 'Impegnato',
      allineamento: 'destra',
      classe: 'hidden md:table-cell',
      priorita: 'solo-tabella',
      cella: (a) => (
        <span className="tabular text-ink-mute">
          {formatQuantita(a.impegnato_milli, a.unita_misura, false)}
        </span>
      ),
    },
    {
      // La domanda che si fa davanti al cliente: «ce l'hai? quanto ne hai?».
      // Sotto md: si legge grande, da md: in su torna densa come le altre.
      chiave: 'disponibile',
      intestazione: 'Disponibile',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (a) => {
        const q = disponibile(a)
        return (
          <>
            <span
              className={`tabular text-lg font-semibold md:text-sm ${q <= 0 ? 'text-danger' : 'text-ink'}`}
            >
              {formatQuantita(q, a.unita_misura, true)}
            </span>
            {sottoScorta(a) && (
              <span className="block text-xs text-warn md:hidden">sotto la scorta minima</span>
            )}
          </>
        )
      },
    },
    {
      chiave: 'scorta',
      intestazione: 'Scorta minima',
      allineamento: 'destra',
      classe: 'hidden xl:table-cell',
      priorita: 'solo-tabella',
      cella: (a) => (
        <span className="inline-flex items-center justify-end gap-2">
          {sottoScorta(a) && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-warn"
              title="Disponibilità sotto la scorta minima"
            />
          )}
          <span className="tabular text-ink-soft">
            {a.scorta_minima_milli
              ? formatQuantita(a.scorta_minima_milli, a.unita_misura, false)
              : '—'}
          </span>
        </span>
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
      intestazione: 'Prezzo',
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'secondaria',
      etichettaCard: 'Prezzo di listino',
      cella: (a) => (
        <>
          <span className="tabular text-lg font-semibold text-ink md:text-sm md:font-normal">
            {formatEuro(a.prezzo_listino_cents)}
          </span>
          <span className="block text-xs text-ink-mute md:hidden">
            al {SIMBOLO_UM[a.unita_misura]}
          </span>
        </>
      ),
    },
    {
      chiave: 'margine',
      intestazione: 'Margine %',
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'solo-tabella',
      // `—` quando il costo non si conosce: mai 0%, che vorrebbe dire
      // «venduto al costo» ed è un'informazione diversa.
      cella: (a) => {
        const m = marginePercentualeArticolo(a)
        if (m == null) return <span className="text-ink-mute">—</span>
        return (
          <span className={`tabular font-semibold ${m < 0 ? 'text-danger' : 'text-ink'}`}>
            {formatPercentuale(m)}
          </span>
        )
      },
    },
    {
      chiave: 'valore',
      intestazione: 'Valore',
      allineamento: 'destra',
      priorita: 'solo-tabella',
      cella: (a) => <span className="tabular text-ink">{formatEuro(valoreGiacenza(a))}</span>,
      classe: 'whitespace-nowrap hidden md:table-cell',
    },
    {
      chiave: 'azioni',
      intestazione: <span className="sr-only">Azioni</span>,
      allineamento: 'destra',
      priorita: 'azione',
      /*
       * `relative` non è decorazione: `.sr-only` è `position:absolute`, e senza
       * un antenato posizionato il suo contenitore diventa la pagina. Quando la
       * tabella è più larga del suo riquadro — qui succede da 1280px in su, con
       * tutte le colonne visibili — quell'elemento da 1px sfugge
       * all'`overflow-x-auto` e allarga il documento, facendo scorrere di lato
       * l'INTERA pagina. Ancorandolo alla cella resta dentro lo scorrimento.
       */
      classe: 'relative',
      cella: (a) => (
        <button
          type="button"
          className="btn-secondary w-full md:w-auto md:border-0 md:bg-transparent"
          onClick={() => setRettifica(a)}
        >
          <ClipboardCheck size={16} />
          Rettifica
        </button>
      ),
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Articoli"
        sottotitolo="Cosa c'è a magazzino: giacenza, impegnato, disponibile e quanto rende. Il listino è la vista commerciale."
      />

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          etichetta="Valore di magazzino"
          valore={formatEuro(valoreMagazzino)}
          dettaglio="Giacenze valorizzate a costo medio"
          icona={Wallet}
        />
        <KpiCard
          etichetta="Margine medio"
          valore={formatPercentuale(margineMedio)}
          dettaglio={`Su ${marginiNoti.length} articoli con costo noto, su ${tutti.length} a catalogo`}
          icona={Percent}
          tono="info"
          ritardo={0.04}
        />
        <KpiCard
          etichetta="Articoli sotto scorta"
          valore={inSottoScorta}
          dettaglio="Disponibile sotto la scorta minima"
          icona={TriangleAlert}
          tono={inSottoScorta ? 'warn' : 'ok'}
          ritardo={0.08}
        />
      </div>

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per codice, nome, ubicazione…"
        definizioni={[
          { chiave: 'stadio', etichetta: 'Stadio', tipo: 'select', opzioni: opzioniDa(STADIO_LABEL) },
          {
            chiave: 'categoria',
            etichetta: 'Categoria',
            tipo: 'select',
            opzioni: opzioniDa(CATEGORIA_LABEL),
          },
          {
            chiave: 'essenza',
            etichetta: 'Essenza',
            tipo: 'select',
            opzioni: opzioniDa(ESSENZA_LABEL),
          },
          { chiave: 'sottoScorta', etichetta: 'Solo sotto scorta', tipo: 'check' },
        ]}
      />

      {caricamento && !dati ? (
        <Caricamento etichetta="Carico gli articoli…" />
      ) : errore ? (
        <Errore messaggio={errore} onRiprova={ricarica} />
      ) : (
        <DataTable
          righe={dati?.righe ?? []}
          colonne={colonne}
          chiaveRiga={(a) => a.id}
          messaggioVuoto="Nessun articolo con questi criteri."
        />
      )}

      {rettifica && (
        <ModaleRettifica
          articolo={rettifica}
          onChiudi={() => setRettifica(null)}
          onFatto={() => {
            setRettifica(null)
            ricarica()
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Rettifica di inventario
// ---------------------------------------------------------------------------

/** Marcatore della scelta attiva negli interruttori della rettifica. */
const SCELTA_ATTIVA = 'border-brand-strong bg-tint/60 text-brand-strong'

/**
 * Le tre ragioni per cui una giacenza si corregge davvero. Sono proposte, non
 * un elenco chiuso: il campo resta libero, perché una rettifica che non si può
 * spiegare non si può nemmeno controllare.
 */
const CAUSALI_RICORRENTI = ['Conta fisica', 'Merce danneggiata', 'Errore di carico']

/**
 * L'unico modo lecito di correggere una giacenza: genera un movimento con
 * causale, non riscrive il numero.
 *
 * Due modi di dirlo, perché sono i due che capitano:
 *   - **conta fisica** — si scrive quello che si è contato e la differenza la
 *     calcola il gestionale. Fare la sottrazione a mente davanti a una catasta
 *     è il modo migliore per sbagliarla;
 *   - **differenza** — si scrive quanto è entrato o uscito, con il segno.
 */
function ModaleRettifica({
  articolo,
  onChiudi,
  onFatto,
}: {
  articolo: Articolo
  onChiudi: () => void
  onFatto: () => void
}) {
  const [modo, setModo] = useState<'conta' | 'differenza'>('conta')
  const [segno, setSegno] = useState<1 | -1>(1)
  const [quantita, setQuantita] = useState(() => milliAInput(articolo.giacenza_milli))
  const [causale, setCausale] = useState(CAUSALI_RICORRENTI[0])
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const delta =
    modo === 'conta'
      ? inputAMilli(quantita) - articolo.giacenza_milli
      : segno * Math.abs(inputAMilli(quantita))
  const nuovaGiacenza = articolo.giacenza_milli + delta

  const motivo = !causale.trim()
    ? 'Scrivi la causale: una rettifica senza motivo non si può controllare.'
    : delta === 0
      ? 'Nessuna differenza da registrare.'
      : null

  const cambiaModo = (nuovo: 'conta' | 'differenza') => {
    if (nuovo === modo) return
    setModo(nuovo)
    // I due modi vogliono due numeri diversi: tenere quello di prima
    // registrerebbe una rettifica che nessuno ha chiesto.
    setQuantita(nuovo === 'conta' ? milliAInput(articolo.giacenza_milli) : '')
  }

  const conferma = async () => {
    if (motivo) return
    setInCorso(true)
    setErrore(null)
    try {
      await api.rettificaInventario({
        articolo_id: articolo.id,
        quantita_milli: delta,
        causale: causale.trim(),
      })
      onFatto()
    } catch (e) {
      setErrore(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Modale
      titolo={`Rettifica ${articolo.codice}`}
      sottotitolo={articolo.nome}
      onChiudi={onChiudi}
      larghezza="max-w-lg"
      variante="foglio"
      piede={
        <>
          <button type="button" className="btn-secondary" onClick={onChiudi} disabled={inCorso}>
            Annulla
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={conferma}
            disabled={inCorso || Boolean(motivo)}
          >
            {inCorso ? 'Attendi…' : 'Registra rettifica'}
          </button>
        </>
      }
    >
      <AvvisoErrore messaggio={errore} />

      {/* Invio conferma: è un form vero, non un elenco di campi con un
          bottone in fondo. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void conferma()
        }}
        className="space-y-4"
      >
        <div className="flex items-baseline justify-between rounded-lg bg-tint/30 px-4 py-3 text-sm">
          <span className="text-ink-soft">Giacenza a sistema</span>
          <span className="tabular font-semibold text-ink">
            {formatQuantita(articolo.giacenza_milli, articolo.unita_misura)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`btn-secondary ${modo === 'conta' ? SCELTA_ATTIVA : ''}`}
            onClick={() => cambiaModo('conta')}
            aria-pressed={modo === 'conta'}
          >
            Conta fisica
          </button>
          <button
            type="button"
            className={`btn-secondary ${modo === 'differenza' ? SCELTA_ATTIVA : ''}`}
            onClick={() => cambiaModo('differenza')}
            aria-pressed={modo === 'differenza'}
          >
            Differenza
          </button>
        </div>

        {modo === 'conta' ? (
          <Campo
            etichetta={`Quantità contata (${SIMBOLO_UM[articolo.unita_misura]})`}
            obbligatorio
            aiuto="Scrivi quello che hai contato: la differenza la calcola il gestionale."
          >
            <Testo
              className="tabular text-right"
              valore={quantita}
              onCambia={setQuantita}
              inputMode="decimal"
              placeholder="0"
              autoFocus
              data-fuoco-iniziale
            />
          </Campo>
        ) : (
          <Campo
            etichetta={`Differenza (${SIMBOLO_UM[articolo.unita_misura]})`}
            obbligatorio
            aiuto="Più per un carico, meno per uno scarico."
          >
            <div className="flex gap-2">
              <button
                type="button"
                className={`btn-secondary px-3 ${segno === 1 ? SCELTA_ATTIVA : ''}`}
                onClick={() => setSegno(1)}
                aria-pressed={segno === 1}
                aria-label="Aumenta la giacenza"
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                className={`btn-secondary px-3 ${segno === -1 ? SCELTA_ATTIVA : ''}`}
                onClick={() => setSegno(-1)}
                aria-pressed={segno === -1}
                aria-label="Diminuisci la giacenza"
              >
                <Minus size={16} />
              </button>
              <Testo
                className="tabular text-right"
                valore={quantita}
                onCambia={setQuantita}
                inputMode="decimal"
                placeholder="0"
                autoFocus
                data-fuoco-iniziale
              />
            </div>
          </Campo>
        )}

        <Campo
          etichetta="Causale"
          obbligatorio
          aiuto="Una rettifica senza motivo non si può controllare: scrivi cosa è successo."
        >
          <div className="mb-2 flex flex-wrap gap-2">
            {CAUSALI_RICORRENTI.map((c) => (
              <button
                key={c}
                type="button"
                className={`btn-secondary px-3 text-xs ${causale === c ? SCELTA_ATTIVA : ''}`}
                onClick={() => setCausale(c)}
                aria-pressed={causale === c}
              >
                {c}
              </button>
            ))}
          </div>
          <Testo
            valore={causale}
            onCambia={setCausale}
            placeholder="Conta fisica: differenza rilevata in campata 3"
          />
        </Campo>

        <div className="flex items-baseline justify-between rounded-lg border border-line px-4 py-3 text-sm">
          <span className="text-ink-soft">Giacenza dopo la rettifica</span>
          <span className="text-right">
            <span
              className={`tabular font-semibold ${nuovaGiacenza < 0 ? 'text-danger' : 'text-ink'}`}
            >
              {formatQuantita(nuovaGiacenza, articolo.unita_misura)}
            </span>
            {delta !== 0 && (
              <span className={`tabular block text-xs ${delta < 0 ? 'text-danger' : 'text-ok'}`}>
                {delta > 0 ? '+' : '−'}
                {formatQuantita(Math.abs(delta), articolo.unita_misura)}
              </span>
            )}
          </span>
        </div>

        {motivo && <p className="text-xs text-warn">{motivo}</p>}

        {/* Il bottone vero sta nel piede della modale: questo serve solo a far
            funzionare Invio, e non deve vedersi. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          Registra rettifica
        </button>
      </form>
    </Modale>
  )
}
