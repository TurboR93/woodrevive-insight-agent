import { Hourglass, PackageCheck, Truck, Wallet, Warehouse } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { api, type Riepilogo } from '../api'
import { brandConfig } from '../brand.config'
import AzioniRapide from '../components/AzioniRapide'
import GraficoMensile from '../components/GraficoMensile'
import IntestazionePagina from '../components/IntestazionePagina'
import { Card, Caricamento, Errore, KpiCard } from '../components/Ui'
import { useDatiCambiati } from '../components/eventiDati'
import type { ID, Lotto, StatoOrdineAcquisto } from '../domain'
import { formatEuro, formatPercentuale, formatData, giorniTra, oggiISO } from '../lib/format'
import { useFetch } from '../useFetch'

/**
 * La plancia. Non è un cruscotto di indicatori: è la schermata che si apre la
 * mattina, e deve rispondere in un colpo d'occhio a cinque domande operative —
 *
 *   1. cosa devo incassare      → scadenzario, i più in ritardo per primi
 *   2. cosa devo consegnare     → ordini confermati con la data promessa
 *   3. cosa sta arrivando       → ordini di acquisto ordinati e non ancora ricevuti
 *   4. quanto vale il magazzino → capitale fermo a costo medio
 *   5. cosa è fermo da troppo   → le partite vecchie che non si smaltiscono
 *
 * Ogni riquadro porta dove si agisce, e ogni riga porta al documento: da qui
 * non si legge soltanto, si parte.
 *
 * Quello che NON sta più qui: il mix delle essenze e i totali dell'anno in
 * cima. Sono letture da fine mese, non da ogni mattina — l'andamento resta in
 * fondo, sotto la riga di lavoro, dove non ruba lo sguardo alle cinque
 * domande.
 */

/** Da quanti giorni una partita è ferma perché valga la pena farla notare. */
const GIORNI_FERMO = 365

/** Quante righe per riquadro: oltre non è più un colpo d'occhio. */
const RIGHE_PER_RIQUADRO = 5

/**
 * Ordinato ma non ancora in cortile. `bozza` non c'è: un ordine non spedito
 * non sta arrivando, e annunciarlo come merce in viaggio è un modo di
 * contare due volte.
 */
const STATI_IN_ARRIVO: StatoOrdineAcquisto[] = ['inviato', 'confermato', 'ricevuto_parziale']

export default function PanoramicaPage() {
  const { dati, caricamento, errore, ricarica } = useFetch(async () => {
    const [r, scadenze, acquisti, lotti] = await Promise.all([
      api.riepilogo(),
      api.scadenzario(),
      api.listaAcquisti(),
      api.listaLotti(),
    ])

    const inArrivo = acquisti
      .filter((a) => STATI_IN_ARRIVO.includes(a.stato))
      .sort((a, b) =>
        (a.data_consegna_prevista ?? '9999').localeCompare(b.data_consegna_prevista ?? '9999'),
      )

    /*
     * Le partite ferme da troppo. Si filtra PRIMA per anzianità — che è un
     * campo del lotto e non costa niente — e solo sulle sopravvissute si
     * chiede il residuo: senza questo sarebbe una chiamata per ogni partita
     * mai comprata, a ogni apertura della panoramica.
     *
     * ⚠️ Resta comunque una N+1 che il backend dovrà chiudere: qui servirebbe
     * un `riepilogo` che porti con sé le partite ferme, o un endpoint suo. La
     * pagina è scritta perché quel giorno cambi solo questo blocco.
     */
    const oggi = oggiISO()
    const vecchie = lotti.filter(
      (l) => l.stato === 'disponibile' && giorniTra(l.data_acquisto, oggi) > GIORNI_FERMO,
    )
    const residui = await Promise.all(vecchie.map((l) => api.giacenzePerLotto(l.id)))
    const ferme = vecchie
      .map((lotto, i) => ({
        lotto,
        giorni: giorniTra(lotto.data_acquisto, oggi),
        valore_cents: residui[i].reduce((t, v) => t + v.valore_residuo_cents, 0),
      }))
      .filter((f) => f.valore_cents > 0)
      .sort((a, b) => b.giorni - a.giorni)

    return { r, scadenze, inArrivo, ferme }
  }, [])
  // Un incasso registrato dalle azioni rapide o una fornitura caricata
  // cambiano quattro dei cinque numeri: la plancia non deve restare indietro.
  useDatiCambiati(ricarica)

  return (
    <>
      <IntestazionePagina
        titolo="Panoramica"
        sottotitolo={`${brandConfig.payoff}. Cosa incassare, cosa consegnare, cosa sta arrivando.`}
      />

      {/* Le tre cose che si fanno ogni giorno, prima di ogni numero: la
          plancia serve a partire, non solo a guardare. */}
      <AzioniRapide variante="estesa" className="mb-6" />

      {errore && <Errore messaggio={errore} onRiprova={ricarica} />}
      {!errore && caricamento && !dati && <Caricamento />}
      {!errore && dati && (
        <Contenuto
          r={dati.r}
          scadenze={dati.scadenze}
          inArrivo={dati.inArrivo}
          ferme={dati.ferme}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

type Scadenza = Awaited<ReturnType<typeof api.scadenzario>>[number]
type Acquisto = Awaited<ReturnType<typeof api.listaAcquisti>>[number]
interface PartitaFerma {
  lotto: Lotto
  giorni: number
  valore_cents: number
}

function Contenuto({
  r,
  scadenze,
  inArrivo,
  ferme,
}: {
  r: Riepilogo
  scadenze: Scadenza[]
  inArrivo: Acquisto[]
  ferme: PartitaFerma[]
}) {
  const valoreInArrivo = inArrivo.reduce((t, a) => t + daRicevereCents(a), 0)
  const valoreFermo = ferme.reduce((t, f) => t + f.valore_cents, 0)

  return (
    <>
      {/*
        Le cinque risposte. Cinque colonne solo da `2xl:` in su: più stretti di
        così i riquadri troncano l'importo (`24.026,6…`), e un numero tagliato
        a metà non è un colpo d'occhio — è un motivo per aprire un'altra
        pagina, cioè esattamente quello che questa schermata deve evitare.
       */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {/*
          Il numero che un commerciante guarda per primo: il fatturato è una
          promessa, l'incasso è un fatto.
         */}
        <Link to="/incassi" className="block">
          <KpiCard
            etichetta="Da incassare"
            valore={formatEuro(r.da_incassare_cents)}
            dettaglio={
              r.scaduto_cents > 0
                ? `${formatEuro(r.scaduto_cents)} già scaduti`
                : 'Nessuna scadenza superata'
            }
            icona={Wallet}
            tono={r.scaduto_cents > 0 ? 'danger' : 'brand'}
            ritardo={0}
          />
        </Link>

        <Link to="/ordini" className="block">
          <KpiCard
            etichetta="Da consegnare"
            valore={formatEuro(r.valore_ordini_aperti_cents)}
            dettaglio={`${r.ordini_aperti} ${r.ordini_aperti === 1 ? 'ordine aperto' : 'ordini aperti'}`}
            icona={Truck}
            tono="ok"
            ritardo={0.04}
          />
        </Link>

        {/*
          Imponibile delle sole righe non ancora entrate: un ordine ricevuto a
          metà conta per la metà che manca, non per intero.
         */}
        <Link to="/acquisti" className="block">
          <KpiCard
            etichetta="In arrivo"
            valore={formatEuro(valoreInArrivo)}
            dettaglio={
              inArrivo.length
                ? `${inArrivo.length} ${inArrivo.length === 1 ? 'fornitura ordinata' : 'forniture ordinate'}`
                : 'Nessuna fornitura in viaggio'
            }
            icona={PackageCheck}
            tono="info"
            ritardo={0.08}
          />
        </Link>

        {/*
          Il capitale fermo: merce comprata e non ancora rivenduta, valorizzata
          al costo medio.
         */}
        <Link to="/articoli" className="block">
          <KpiCard
            etichetta="Valore di magazzino"
            valore={formatEuro(r.valore_magazzino_cents)}
            dettaglio={
              r.articoli_sotto_scorta > 0
                ? `${r.articoli_sotto_scorta} ${r.articoli_sotto_scorta === 1 ? 'articolo' : 'articoli'} sotto scorta`
                : 'Giacenze a costo medio'
            }
            icona={Warehouse}
            tono={r.articoli_sotto_scorta > 0 ? 'warn' : 'brand'}
            ritardo={0.12}
          />
        </Link>

        {/*
          L'anzianità si conta dalla data d'acquisto della partita: è il
          numero che dice se il capitale gira o se è diventato una catasta.
         */}
        <Link to="/lotti" className="block">
          <KpiCard
            etichetta="Fermo da oltre un anno"
            valore={formatEuro(r.valore_fermo_oltre_anno_cents)}
            dettaglio={
              r.giacenza_media_giorni != null
                ? `${r.giacenza_media_giorni} giorni in media`
                : 'Nessuna merce a magazzino'
            }
            icona={Hourglass}
            tono={r.valore_fermo_oltre_anno_cents > 0 ? 'warn' : 'ok'}
            ritardo={0.16}
          />
        </Link>
      </div>

      {/* --- la riga di lavoro --------------------------------------------- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card titolo="Da incassare" azioni={<Tutti a="/incassi" />}>
          <Elenco
            voci={scadenze.slice(0, RIGHE_PER_RIQUADRO).map((v) => ({
              chiave: v.chiave,
              // Le voci storiche vengono dalle scadenze: nessun ordine da aprire.
              a: v.ordine_id ? `/ordini/${v.ordine_id}` : '/incassi',
              titolo: v.cliente_nome,
              nota: `${v.numero} · ${scadenza(v.data_scadenza_saldo)}`,
              notaTono: v.scaduto ? 'danger' : 'neutro',
              valore: formatEuro(v.residuo_cents),
            }))}
            vuoto="Nessun residuo da incassare: tutto saldato."
          />
        </Card>

        <Card titolo="Da consegnare" azioni={<Tutti a="/ordini" />}>
          <Elenco
            voci={r.consegne_previste.slice(0, RIGHE_PER_RIQUADRO).map((c) => ({
              chiave: c.id,
              a: `/ordini/${c.id}`,
              titolo: c.cliente,
              nota: `${c.numero} · ${scadenza(c.data)}`,
              notaTono: c.data && giorniTra(oggiISO(), c.data) < 0 ? 'danger' : 'neutro',
              valore: formatData(c.data),
            }))}
            vuoto="Nessuna consegna in programma."
          />
        </Card>

        <Card titolo="In arrivo" azioni={<Tutti a="/acquisti" />}>
          <Elenco
            voci={inArrivo.slice(0, RIGHE_PER_RIQUADRO).map((a) => ({
              chiave: a.id,
              a: `/acquisti/${a.id}`,
              titolo: a.fornitore_nome,
              nota: `${a.numero} · ${scadenza(a.data_consegna_prevista)}`,
              valore: formatEuro(daRicevereCents(a)),
            }))}
            vuoto="Nessuna fornitura ordinata e non ancora ricevuta."
          />
        </Card>
      </div>

      {/* --- il capitale che non gira -------------------------------------- */}
      <section className="mt-4">
        <Card
          titolo="Fermo da troppo tempo"
          azioni={<Tutti a="/lotti" etichetta="Tutte le partite" />}
        >
          {ferme.length ? (
            <>
              <Elenco
                voci={ferme.slice(0, RIGHE_PER_RIQUADRO).map((f) => ({
                  chiave: f.lotto.id,
                  a: `/lotti/${f.lotto.id}`,
                  titolo: `${f.lotto.codice} — ${f.lotto.descrizione}`,
                  nota: `${provenienza(f.lotto)} · ferma da ${f.giorni} giorni`,
                  notaTono: 'warn',
                  valore: formatEuro(f.valore_cents),
                }))}
              />
              <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-mute">
                {formatEuro(valoreFermo)} comprati da più di un anno e ancora in capannone. Non è
                un errore: è capitale che non gira, e sapere quale partita lo trattiene è il primo
                passo per farla uscire.
              </p>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-ink-mute">
              Nessuna partita disponibile ferma da più di un anno: il magazzino gira.
            </p>
          )}
        </Card>
      </section>

      {/* --- sotto la riga di lavoro: come va l'anno ----------------------- */}
      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg text-ink">Come va l’anno</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card titolo="Andamento a dodici mesi" className="lg:col-span-2">
            <GraficoMensile dati={r.mesi} />
            <p className="mt-3 text-xs text-ink-mute">
              Venduto: imponibile dei DDT emessi nel mese. Acquistato: imponibile degli ordini di
              acquisto ricevuti, trasporto compreso.
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <Sintesi
              etichetta="Venduto quest’anno"
              valore={formatEuro(r.venduto_anno_cents)}
              nota="Imponibile dei DDT di vendita"
            />
            <Sintesi
              etichetta="Margine medio"
              valore={formatPercentuale(r.margine_medio_percentuale, 1)}
              nota={`${formatEuro(r.marginalita_venduto_cents)} sul venduto`}
            />
            <Sintesi
              etichetta="Incassato quest’anno"
              valore={formatEuro(r.incassato_anno_cents)}
              nota="Acconti, saldi e note di credito"
            />
          </div>
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pezzi locali
// ---------------------------------------------------------------------------

/**
 * Link «vedi tutti» nella testata di un riquadro. Bersaglio pieno sotto `md:`
 * e compatto sopra, come ogni comando del pannello: da solo il testo sarebbe
 * alto 20px, impossibile da centrare col pollice.
 */
function Tutti({ a, etichetta = 'Vedi tutti' }: { a: string; etichetta?: string }) {
  return (
    <Link
      to={a}
      className="-mr-2 inline-flex min-h-[2.75rem] items-center px-2 text-sm text-brand-strong transition-colors hover:text-ink md:mr-0 md:min-h-0 md:px-0"
    >
      {etichetta}
    </Link>
  )
}

interface Voce {
  chiave: ID
  a: string
  titolo: string
  nota: string
  notaTono?: 'neutro' | 'warn' | 'danger'
  valore: string
}

const TONO_NOTA = {
  neutro: 'text-ink-mute',
  warn: 'text-warn',
  danger: 'text-danger',
} as const

/**
 * Le righe di un riquadro. Sono link, non testo: da qui si va al documento.
 * Bersaglio pieno a 44px anche sul telefono, dove questa è la lista con cui si
 * fanno i solleciti in piedi.
 */
function Elenco({ voci, vuoto = 'Niente da mostrare.' }: { voci: Voce[]; vuoto?: string }) {
  if (!voci.length) return <p className="py-6 text-center text-sm text-ink-mute">{vuoto}</p>

  return (
    <ul className="divide-y divide-line">
      {voci.map((v) => (
        <li key={v.chiave}>
          <Link
            to={v.a}
            className="-mx-2 flex min-h-[2.75rem] items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-tint/30"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink">{v.titolo}</span>
              <span className={`mt-0.5 block truncate text-xs ${TONO_NOTA[v.notaTono ?? 'neutro']}`}>
                {v.nota}
              </span>
            </span>
            <span className="tabular shrink-0 text-sm font-semibold text-ink">{v.valore}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Quanto vale la merce ancora da ricevere di un ordine di acquisto:
 * l'imponibile delle righe che non hanno ancora una partita.
 *
 * `lotto_id` sulla riga si valorizza ALLA RICEZIONE, quindi una riga senza
 * partita è una riga non arrivata. È così che un ordine ricevuto a metà pesa
 * qui solo per la metà che manca, invece di gonfiare la merce in viaggio con
 * roba già in capannone.
 */
function daRicevereCents(a: Acquisto): number {
  return a.righe.filter((r) => r.lotto_id == null).reduce((t, r) => t + r.imponibile_cents, 0)
}

/** "Fienile ottocentesco — Cordignano (TV)" */
function provenienza(l: Lotto): string {
  const luogo = [
    l.provenienza_localita,
    l.provenienza_provincia ? `(${l.provenienza_provincia})` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return [l.provenienza_edificio, luogo].filter(Boolean).join(' — ') || 'Provenienza non registrata'
}

/** "Fra 5 giorni", "Oggi", "In ritardo di 3 giorni". */
function scadenza(data: string | null): string {
  if (!data) return 'Data da concordare'
  const giorni = giorniTra(oggiISO(), data)
  if (giorni === 0) return 'Oggi'
  if (giorni === 1) return 'Domani'
  if (giorni > 0) return `Fra ${giorni} giorni`
  const ritardo = Math.abs(giorni)
  return `In ritardo di ${ritardo} ${ritardo === 1 ? 'giorno' : 'giorni'}`
}

/** Card compatta dei totali dell'anno: etichetta, numero, nota. */
function Sintesi({
  etichetta,
  valore,
  nota,
}: {
  etichetta: string
  valore: ReactNode
  nota?: string
}) {
  return (
    <div className="card px-4 py-3">
      <p className="label truncate">{etichetta}</p>
      <p className="tabular mt-1 text-lg font-semibold text-ink">{valore}</p>
      {nota && <p className="mt-0.5 truncate text-xs text-ink-mute">{nota}</p>}
    </div>
  )
}
