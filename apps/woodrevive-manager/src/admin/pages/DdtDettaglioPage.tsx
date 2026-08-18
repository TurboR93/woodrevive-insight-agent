import {
  ChevronDown,
  ChevronUp,
  FileDown,
  MapPin,
  PackageCheck,
  ShoppingCart,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../api'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Scelta, Testo } from '../components/Campi'
import FormIncasso from '../components/FormIncasso'
import IntestazionePagina from '../components/IntestazionePagina'
import { CellaNumerica } from '../components/RigheDocumento'
import SelettoreLotto from '../components/SelettoreLotto'
import StatoBadge from '../components/StatoBadge'
import { Caricamento, Conferma, Errore } from '../components/Ui'
import { notificaDatiCambiati } from '../components/eventiDati'
import {
  CAUSALE_LABEL,
  CAUSALI_SELEZIONABILI,
  etichettaCausale,
  STATO_DDT_LABEL,
  TONO_DDT,
  TRANSIZIONI_DDT,
  TRASPORTO_LABEL,
  prossimiStati,
  type CausaleTrasporto,
  type DDT,
  type ID,
  type RigaDDT,
  type StatoDDT,
  type TrasportoACura,
  type VoceLottoDisponibile,
} from '../domain'
import { SIMBOLO_UM, formatData, formatEuro, formatQuantita } from '../lib/format'
import { inputAMilli, milliAInput } from '../lib/qty'
import { messaggioDi, useFetch } from '../useFetch'

/** Partite da cui si può davvero prelevare un articolo, con il loro residuo. */
type LottiPerArticolo = Record<ID, VoceLottoDisponibile[]>

/**
 * Il documento di trasporto: si compila in magazzino, col camion che aspetta.
 *
 * Tre cose lo rendono un'azione da due tocchi invece che da sei:
 *   - la partita di prelievo arriva GIÀ PROPOSTA dall'ordine (FIFO, la più
 *     vecchia con disponibilità): chi consegna conferma, non sceglie;
 *   - «Emetti DDT» SALVA prima di aprire la conferma. Prima si poteva scegliere
 *     la partita, premere «Emetti» senza salvare, e il DDT usciva con la
 *     partita vecchia: il magazzino si scaricava dalla catasta sbagliata e
 *     nessuno se ne accorgeva;
 *   - dopo l'emissione la pagina propone il passo dopo — l'incasso — con il
 *     residuo dell'ordine già scritto nel campo.
 *
 * Sotto `md:` le righe sono card, i dati di trasporto si aprono solo se
 * servono, e il comando di emissione sta in fondo, in zona pollice, con il
 * riepilogo di quanto sta uscendo appena sopra.
 */
export default function DdtDettaglioPage() {
  const { id = '' } = useParams()

  const { dati, caricamento, errore, ricarica } = useFetch(() => api.ddt(id), [id])

  /*
   * Il selettore di lotto non elenca tutte le partite: elenca quelle che hanno
   * ancora disponibilità DI QUELL'ARTICOLO. È il punto in cui la tracciabilità
   * smette di essere una dichiarazione — un DDT che indica il fienile di
   * Cordignano deve poter essere verificato, e l'emissione lo verifica davvero
   * (`emettiDdt` rifiuta la riga se la partita non ha capienza).
   *
   * Si chiede un elenco per articolo distinto, non uno per riga: due righe
   * dello stesso articolo condividono le stesse partite.
   */
  const chiaveArticoli = [...new Set((dati?.righe ?? []).map((r) => r.articolo_id))].sort().join(',')
  const { dati: lottiPerArticolo } = useFetch<LottiPerArticolo>(async () => {
    const ids = chiaveArticoli ? chiaveArticoli.split(',') : []
    const coppie = await Promise.all(
      ids.map(async (idArticolo) => [idArticolo, await api.lottiDisponibiliPerArticolo(idArticolo)] as const),
    )
    return Object.fromEntries(coppie)
  }, [chiaveArticoli])

  /*
   * L'ordine di origine serve a due cose, e sono le due cose che tolgono un
   * viaggio a chi consegna: l'indirizzo di cantiere scritto sull'ordine, e il
   * residuo da incassare da proporre appena la merce è uscita.
   */
  const ordineId = dati?.ordine_id ?? ''
  const { dati: ordine, ricarica: ricaricaOrdine } = useFetch(
    () => (ordineId ? api.ordine(ordineId) : Promise.resolve(null)),
    [ordineId],
  )

  const [bozza, setBozza] = useState<DDT | null>(null)
  /**
   * L'ultima versione confermata dal server, e il metro di «modifiche non
   * salvate». Non può essere `dati` di `useFetch`: quella copia resta ferma
   * alla prima lettura, quindi dopo un «Salva DDT» il documento risultava
   * modificato per sempre — il comando restava nella barra e ogni emissione
   * rifaceva un salvataggio già fatto. Stesso accorgimento di
   * PreventivoDettaglioPage e OrdineDettaglioPage.
   */
  const [salvato, setSalvato] = useState<DDT | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [confermaEmissione, setConfermaEmissione] = useState(false)
  const [appenaEmesso, setAppenaEmesso] = useState(false)
  const [formIncasso, setFormIncasso] = useState(false)
  const [datiTrasportoAperti, setDatiTrasportoAperti] = useState(false)

  /** Una risposta del server vale per entrambe: è la nuova verità. */
  const arrivaDalServer = (d: DDT) => {
    setBozza(d)
    setSalvato(d)
  }

  useEffect(() => {
    setBozza(dati)
    setSalvato(dati)
  }, [dati])

  if (errore) return <Errore messaggio={errore} onRiprova={ricarica} />
  // Il DDT inesistente torna 404 dall'API e finisce in `errore`: qui manca solo
  // l'istante fra la risposta e la copia di lavoro.
  if (caricamento || !bozza || !salvato) return <Caricamento />

  const soloLettura = bozza.stato !== 'bozza'
  const modificato = JSON.stringify(bozza) !== JSON.stringify(salvato)
  const imposta = (patch: Partial<DDT>) => setBozza({ ...bozza, ...patch })
  const aggiornaRiga = (indice: number, patch: Partial<RigaDDT>) =>
    imposta({ righe: bozza.righe.map((r, i) => (i === indice ? { ...r, ...patch } : r)) })

  // Quello che sta per uscire, mentre lo si compila. Stessa regola del layer
  // dati: la somma delle righe se c'è, altrimenti il totale scritto a mano.
  const colliInUscita = bozza.righe.reduce((t, r) => t + r.colli, 0) || bozza.colli_totali
  const pesoInUscita =
    bozza.righe.reduce((t, r) => t + r.peso_kg_milli, 0) || bozza.peso_totale_kg_milli

  /**
   * Le partite fra cui scegliere per una riga.
   *
   * `lottiDisponibiliPerArticolo` restituisce solo quelle che hanno ancora
   * residuo di quell'articolo. Ma una bozza può essere stata preparata giorni
   * fa, e nel frattempo un altro DDT può aver svuotato la catasta: la partita
   * resta scritta sulla riga e sparisce dall'elenco. Senza il caso qui sotto
   * quella riga sembrerebbe a posto — il selettore ne mostrerebbe il codice e
   * nient'altro, il controllo di capienza non avrebbe un residuo da confrontare
   * e «Emetti» resterebbe acceso fino al 400 del server, dopo una conferma che
   * annuncia un'operazione irreversibile.
   *
   * Quindi la partita esaurita si rimette in elenco con il suo zero: il
   * selettore dice «restano 0: non bastano» e la riga entra fra le scoperte,
   * che è esattamente ciò che `emettiDdt` dirà.
   */
  const disponibiliDi = (r: RigaDDT): VoceLottoDisponibile[] => {
    // Una riga senza articolo non preleva da nessuna partita: è testo, o merce
    // descritta a mano. Non ha partite fra cui scegliere.
    const elenco = (r.articolo_id ? lottiPerArticolo?.[r.articolo_id] : undefined) ?? []
    // Finché l'elenco non è arrivato non si accusa nessuna riga: `null` più
    // avanti significa «capienza da verificare», non «capienza mancante».
    if (!lottiPerArticolo || !r.lotto_id) return elenco
    if (elenco.some((l: VoceLottoDisponibile) => l.lotto_id === r.lotto_id)) return elenco
    return [
      ...elenco,
      {
        lotto_id: r.lotto_id,
        codice: r.lotto_codice ?? 'Partita esaurita',
        descrizione: 'niente più di quest’articolo',
        provenienza: null,
        residuo_milli: 0,
      },
    ]
  }

  /** Residuo della partita scritta sulla riga; `null` se non ce n'è una da verificare. */
  const residuoDellaPartita = (r: RigaDDT) =>
    disponibiliDi(r).find((l) => l.lotto_id === r.lotto_id)?.residuo_milli ?? null

  const righeSenzaPartita = bozza.righe.filter((r) => !r.lotto_id)
  const righeScoperte = bozza.righe.filter((r) => {
    const residuo = residuoDellaPartita(r)
    return residuo != null && r.quantita_milli > residuo
  })

  const residuoOrdine = Math.max(0, ordine?.residuo_cents ?? 0)

  const salvaOra = async (): Promise<DDT> => {
    const risposta = await api.aggiornaDdt(id, {
      data_trasporto: bozza.data_trasporto,
      ora_trasporto: bozza.ora_trasporto,
      causale: bozza.causale,
      trasporto_a_cura_di: bozza.trasporto_a_cura_di,
      vettore: bozza.vettore,
      aspetto_beni: bozza.aspetto_beni,
      colli_totali: bozza.colli_totali,
      peso_totale_kg_milli: bozza.peso_totale_kg_milli,
      destinazione_indirizzo: bozza.destinazione_indirizzo,
      destinazione_cap: bozza.destinazione_cap,
      destinazione_citta: bozza.destinazione_citta,
      destinazione_provincia: bozza.destinazione_provincia,
      valorizzato: bozza.valorizzato,
      righe: bozza.righe,
      note: bozza.note,
    })
    arrivaDalServer(risposta)
    return risposta
  }

  const salva = async () => {
    setInCorso(true)
    setAvviso(null)
    try {
      await salvaOra()
    } catch (e) {
      setAvviso(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  /**
   * ⚠️ Si salva PRIMA di chiedere conferma, non dopo.
   *
   * `emettiDdt` legge la copia sul server: la partita scelta e non salvata non
   * esisterebbe per lui, e la merce uscirebbe da un'altra catasta. Prima la
   * conferma lo diceva a parole («ci sono modifiche non salvate»); ora non c'è
   * più niente da dire, perché non può più succedere.
   */
  const preparaEmissione = async () => {
    setInCorso(true)
    setAvviso(null)
    try {
      if (modificato) await salvaOra()
      setConfermaEmissione(true)
    } catch (e) {
      setAvviso(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  const emetti = async () => {
    setInCorso(true)
    setAvviso(null)
    try {
      arrivaDalServer(await api.emettiDdt(id))
      setConfermaEmissione(false)
      setAppenaEmesso(true)
      ricaricaOrdine() // l'ordine è appena diventato evaso, in tutto o in parte
      notificaDatiCambiati()
    } catch (e) {
      setAvviso(messaggioDi(e))
      setConfermaEmissione(false)
    } finally {
      setInCorso(false)
    }
  }

  const cambiaStato = async (stato: StatoDDT) => {
    setAvviso(null)
    try {
      arrivaDalServer(await api.cambiaStatoDdt(id, stato))
      notificaDatiCambiati()
    } catch (e) {
      setAvviso(messaggioDi(e))
    }
  }

  /**
   * Il generatore vive in `documents/` e si carica al volo, così jsPDF non pesa
   * sul primo caricamento del pannello. Se il modulo manca o fallisce, la pagina
   * lo dice e resta in piedi.
   */
  const scaricaPdf = async () => {
    setAvviso(null)
    try {
      const cliente = await api.cliente(bozza.cliente_id)
      const { generaDdtPdf } = await import('../documents/ddtPdf')
      await generaDdtPdf(bozza, cliente)
    } catch (e) {
      setAvviso(`PDF non ancora disponibile: ${messaggioDi(e)}`)
    }
  }

  // --- azioni della pagina -------------------------------------------------
  const motivoEmissione = !bozza.righe.length
    ? 'Un DDT senza righe non si emette.'
    : righeScoperte.length
      ? `${righeScoperte.length === 1 ? 'Una riga chiede' : `${righeScoperte.length} righe chiedono`} più di quanto resta nella partita scelta: cambia partita o dividi la riga.`
      : undefined

  const azioni: AzionePagina[] = []

  if (!soloLettura) {
    azioni.push({
      chiave: 'emetti',
      etichetta: 'Emetti DDT',
      etichettaBreve: 'Emetti',
      icona: PackageCheck,
      tono: 'primario',
      onClick: () => void preparaEmissione(),
      disabilitata: inCorso || Boolean(motivoEmissione),
      motivo: motivoEmissione,
      inCorso,
    })
    if (modificato) {
      azioni.push({
        chiave: 'salva',
        etichetta: 'Salva DDT',
        etichettaBreve: 'Salva',
        onClick: () => void salva(),
        disabilitata: inCorso,
      })
    }
  }

  // Emesso: la merce è uscita, la domanda dopo è se i soldi entrano.
  if (soloLettura && residuoOrdine > 0 && bozza.stato !== 'annullato') {
    azioni.push({
      chiave: 'incasso',
      etichetta: `Registra incasso — ${formatEuro(residuoOrdine)}`,
      etichettaBreve: 'Incassa',
      icona: Wallet,
      tono: 'primario',
      onClick: () => setFormIncasso(true),
    })
  }

  for (const s of prossimiStati(TRANSIZIONI_DDT, bozza.stato).filter((x) => x !== 'emesso')) {
    azioni.push({
      chiave: `stato-${s}`,
      etichetta: `Segna come ${STATO_DDT_LABEL[s].toLowerCase()}`,
      etichettaBreve: STATO_DDT_LABEL[s],
      onClick: () => void cambiaStato(s),
      disabilitata: inCorso,
    })
  }

  azioni.push({
    chiave: 'pdf',
    etichetta: 'Scarica PDF',
    icona: FileDown,
    // In magazzino non si stampa: si carica il camion. Il PDF resta in ufficio.
    soloDesktop: true,
    onClick: () => void scaricaPdf(),
  })

  // --- destinazione: l'ordine può indicare un cantiere ---------------------
  const indirizzoOrdine = ordine?.indirizzo_consegna?.trim() ?? ''
  const destinazioneScritta = [bozza.destinazione_indirizzo, bozza.destinazione_citta]
    .filter(Boolean)
    .join(', ')
  const proponiIndirizzoOrdine =
    !soloLettura &&
    Boolean(indirizzoOrdine) &&
    indirizzoOrdine !== destinazioneScritta &&
    indirizzoOrdine !== (bozza.destinazione_indirizzo ?? '')

  return (
    <>
      <IntestazionePagina
        titolo={`DDT ${bozza.numero}`}
        sottotitolo={`${bozza.cliente_nome} — trasporto del ${formatData(bozza.data_trasporto)}`}
        indietro={{ a: '/ddt', label: 'Tutti i DDT' }}
        azioni={
          <>
            <StatoBadge etichetta={STATO_DDT_LABEL[bozza.stato]} tono={TONO_DDT[bozza.stato]} />
            <BarraAzioni azioni={azioni} />
          </>
        }
      />

      <AvvisoErrore messaggio={avviso} />

      {/* La catena non finisce con la merce sul camion: finisce quando i soldi
          sono entrati. Il passo dopo si propone qui, senza tornare a una lista. */}
      {appenaEmesso && (
        <section className="mb-4 rounded-lg border border-ok/30 bg-ok/8 px-4 py-3">
          <p className="text-sm font-semibold text-ok">
            DDT {bozza.numero} emesso: la merce è uscita dal magazzino.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {residuoOrdine > 0
              ? `Restano ${formatEuro(residuoOrdine)} da incassare sull’ordine ${bozza.ordine_numero ?? ''}.`
              : 'L’ordine collegato è già saldato: non c’è altro da fare.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {residuoOrdine > 0 && (
              <button type="button" className="btn-primary" onClick={() => setFormIncasso(true)}>
                <Wallet size={16} />
                Registra incasso
              </button>
            )}
            {bozza.ordine_id && (
              <Link to={`/ordini/${bozza.ordine_id}`} className="btn-secondary">
                <ShoppingCart size={16} />
                Torna all’ordine
              </Link>
            )}
          </div>
        </section>
      )}

      {soloLettura && !appenaEmesso && (
        <p className="mb-4 rounded-lg border border-info/30 bg-info/8 px-3 py-2 text-sm text-ink-soft">
          DDT {STATO_DDT_LABEL[bozza.stato].toLowerCase()}: i dati di trasporto non si modificano più. Per
          correggerlo si emette un DDT di reso.
        </p>
      )}

      {/* Sul telefono comanda la merce: le righe stanno in cima e i dati di
          trasporto si aprono solo se c'è da cambiarli. Sul monitor l'ordine
          torna quello di sempre, perché si vede tutto insieme. */}
      <div className="flex flex-col gap-4">
        <section className="card order-2 md:order-1">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left md:hidden"
            onClick={() => setDatiTrasportoAperti((v) => !v)}
            aria-expanded={datiTrasportoAperti}
          >
            <span>
              <span className="font-display text-base text-ink">Dati di trasporto</span>
              <span className="mt-0.5 block text-xs text-ink-mute">
                {etichettaCausale(bozza)} · {TRASPORTO_LABEL[bozza.trasporto_a_cura_di]}
                {bozza.vettore ? ` · ${bozza.vettore}` : ''}
              </span>
            </span>
            {datiTrasportoAperti ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>

          <div className={`${datiTrasportoAperti ? 'block' : 'hidden'} px-5 pb-5 pt-1 md:block md:py-5`}>
            <GrigliaCampi colonne={3}>
              <Campo etichetta="Data trasporto">
                <Testo
                  valore={bozza.data_trasporto}
                  onCambia={(v) => imposta({ data_trasporto: v })}
                  type="date"
                  disabled={soloLettura}
                />
              </Campo>

              <Campo etichetta="Ora trasporto">
                <Testo
                  valore={bozza.ora_trasporto ?? ''}
                  onCambia={(v) => imposta({ ora_trasporto: v || null })}
                  type="time"
                  disabled={soloLettura}
                />
              </Campo>

              <Campo etichetta="Causale del trasporto">
                {/* Solo le causali selezionabili: conto vendita, conto lavorazione
                    e conto installazione esistono nello storico importato e non
                    devono poter tornare su un documento nuovo. */}
                <Scelta<CausaleTrasporto>
                  valore={bozza.causale ?? 'vendita'}
                  onCambia={(v) => imposta({ causale: v })}
                  disabled={soloLettura}
                  opzioni={CAUSALI_SELEZIONABILI.map((c) => ({
                    valore: c,
                    etichetta: CAUSALE_LABEL[c],
                  }))}
                />
              </Campo>

              <Campo etichetta="Trasporto a cura di">
                <Scelta<TrasportoACura>
                  valore={bozza.trasporto_a_cura_di}
                  onCambia={(v) => imposta({ trasporto_a_cura_di: v })}
                  disabled={soloLettura}
                  opzioni={(Object.keys(TRASPORTO_LABEL) as TrasportoACura[]).map((t) => ({
                    valore: t,
                    etichetta: TRASPORTO_LABEL[t],
                  }))}
                />
              </Campo>

              <Campo etichetta="Vettore" aiuto="Proposto dall’ultima consegna a questo cliente.">
                <Testo
                  valore={bozza.vettore ?? ''}
                  onCambia={(v) => imposta({ vettore: v || null })}
                  disabled={soloLettura}
                  placeholder="Ragione sociale del trasportatore"
                />
              </Campo>

              <Campo etichetta="Aspetto dei beni">
                <Testo
                  valore={bozza.aspetto_beni}
                  onCambia={(v) => imposta({ aspetto_beni: v })}
                  disabled={soloLettura}
                  placeholder="Bancali"
                />
              </Campo>

              <Campo etichetta="Colli totali" aiuto="Se le righe hanno i colli, il totale si ricalcola dalla loro somma.">
                <CellaNumerica
                  etichetta="Colli totali"
                  valore={String(bozza.colli_totali)}
                  onCambia={(t) => imposta({ colli_totali: Math.max(0, Math.round(Number(t) || 0)) })}
                  classe="w-full"
                  disabilitato={soloLettura}
                />
              </Campo>

              <Campo etichetta="Peso totale (kg)">
                <CellaNumerica
                  etichetta="Peso totale in chilogrammi"
                  valore={milliAInput(bozza.peso_totale_kg_milli)}
                  onCambia={(t) => imposta({ peso_totale_kg_milli: inputAMilli(t) })}
                  classe="w-full"
                  disabilitato={soloLettura}
                />
              </Campo>

              <div>
                <span className="label mb-1">Valorizzazione</span>
                <label className="flex min-h-[2.75rem] items-center gap-2 text-sm text-ink md:min-h-0 md:py-2">
                  <input
                    type="checkbox"
                    checked={bozza.valorizzato}
                    onChange={(e) => imposta({ valorizzato: e.target.checked })}
                    disabled={soloLettura}
                    className="h-4 w-4 rounded border-line text-brand focus:ring-brand/40"
                  />
                  DDT valorizzato
                </label>
                <span className="mt-1 block text-xs text-ink-mute">
                  Se disattivo, il PDF non stampa i prezzi.
                </span>
              </div>

              <Campo etichetta="Destinazione — indirizzo" className="md:col-span-2">
                <Testo
                  valore={bozza.destinazione_indirizzo ?? ''}
                  onCambia={(v) => imposta({ destinazione_indirizzo: v || null })}
                  disabled={soloLettura}
                />
              </Campo>

              <Campo etichetta="CAP">
                <Testo
                  valore={bozza.destinazione_cap ?? ''}
                  onCambia={(v) => imposta({ destinazione_cap: v || null })}
                  disabled={soloLettura}
                />
              </Campo>

              <Campo etichetta="Città">
                <Testo
                  valore={bozza.destinazione_citta ?? ''}
                  onCambia={(v) => imposta({ destinazione_citta: v || null })}
                  disabled={soloLettura}
                />
              </Campo>

              <Campo etichetta="Provincia">
                <Testo
                  valore={bozza.destinazione_provincia ?? ''}
                  onCambia={(v) => imposta({ destinazione_provincia: v.toUpperCase() || null })}
                  maxLength={2}
                  disabled={soloLettura}
                />
              </Campo>

              <Campo etichetta="Ordine di origine">
                <p className="pt-2 text-sm">
                  {bozza.ordine_id ? (
                    <Link to={`/ordini/${bozza.ordine_id}`} className="text-brand-strong hover:underline">
                      {bozza.ordine_numero}
                    </Link>
                  ) : (
                    <span className="text-ink-mute">Nessuno</span>
                  )}
                </p>
              </Campo>

              <Campo etichetta="Note" className="md:col-span-3">
                <AreaTesto
                  valore={bozza.note ?? ''}
                  onCambia={(v) => imposta({ note: v || null })}
                  righe={2}
                  disabled={soloLettura}
                />
              </Campo>
            </GrigliaCampi>

            {/* La destinazione nasce dall'anagrafica del cliente. Se sull'ordine
                c'è scritto un cantiere, quello vince — ma lo decide chi consegna,
                con un tocco, non un'automazione che sovrascrive in silenzio. */}
            {proponiIndirizzoOrdine && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info/8 px-3 py-2">
                <p className="text-sm text-ink-soft">
                  <MapPin size={14} className="mr-1 inline align-[-2px]" />
                  L’ordine indica un altro luogo di consegna: «{indirizzoOrdine}»
                </p>
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => imposta({ destinazione_indirizzo: indirizzoOrdine })}
                >
                  Usa questo indirizzo
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── merce in viaggio ──────────────────────────────────────────── */}
        <section className="card order-1 md:order-2">
          <header className="border-b border-line px-4 py-3">
            <h2 className="font-display text-base text-ink">Merce in viaggio</h2>
            <p className="mt-0.5 text-xs text-ink-mute">
              {bozza.righe.length} {bozza.righe.length === 1 ? 'riga' : 'righe'} · la partita è già
              proposta: la più vecchia con disponibilità.
            </p>
          </header>

          {!bozza.righe.length && (
            <p className="px-4 py-8 text-center text-sm text-ink-mute">
              Nessuna riga: un DDT senza righe non si emette.
            </p>
          )}

          {/* ── da md: in su — la tabella densa ─────────────────────────── */}
          {Boolean(bozza.righe.length) && (
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-tint/25 text-xs uppercase tracking-wide text-ink-mute">
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Articolo</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Lotto di prelievo</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Quantità</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Colli</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Peso (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {bozza.righe.map((r, i) => (
                    <tr key={r.id} className="border-b border-line/60 last:border-0">
                      <td className="px-3 py-2">
                        <div className="leading-tight">
                          <div className="font-medium text-ink">{r.descrizione}</div>
                          {r.codice_articolo && (
                            <div className="mt-0.5 text-xs text-ink-mute">{r.codice_articolo}</div>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        {soloLettura ? (
                          <span className="text-ink-soft">{r.lotto_codice ?? '—'}</span>
                        ) : (
                          <SelettoreLotto
                            valore={r.lotto_id}
                            codiceValore={r.lotto_codice}
                            disponibili={disponibiliDi(r)}
                            quantitaRichiestaMilli={r.quantita_milli}
                            unitaMisura={r.unita_misura}
                            onScegli={(l) =>
                              aggiornaRiga(i, {
                                lotto_id: l?.lotto_id ?? null,
                                lotto_codice: l?.codice ?? null,
                              })
                            }
                          />
                        )}
                      </td>

                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {soloLettura ? (
                            <span className="tabular">{formatQuantita(r.quantita_milli, r.unita_misura)}</span>
                          ) : (
                            <>
                              <CellaNumerica
                                etichetta="Quantità"
                                valore={milliAInput(r.quantita_milli)}
                                onCambia={(t) => aggiornaRiga(i, { quantita_milli: inputAMilli(t) })}
                                classe="w-20"
                              />
                              <span className="text-xs text-ink-mute">{SIMBOLO_UM[r.unita_misura]}</span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 text-right">
                        {soloLettura ? (
                          <span className="tabular">{r.colli || '—'}</span>
                        ) : (
                          <CellaNumerica
                            etichetta="Colli della riga"
                            valore={String(r.colli)}
                            onCambia={(t) => aggiornaRiga(i, { colli: Math.max(0, Math.round(Number(t) || 0)) })}
                            classe="w-16"
                          />
                        )}
                      </td>

                      <td className="px-3 py-2 text-right">
                        {soloLettura ? (
                          <span className="tabular">
                            {r.peso_kg_milli ? formatQuantita(r.peso_kg_milli, 'kg') : '—'}
                          </span>
                        ) : (
                          <CellaNumerica
                            etichetta="Peso della riga in chilogrammi"
                            valore={milliAInput(r.peso_kg_milli)}
                            onCambia={(t) => aggiornaRiga(i, { peso_kg_milli: inputAMilli(t) })}
                            classe="w-20"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── sotto md: — una riga per card, campi grandi ──────────────── */}
          <ul className="divide-y divide-line md:hidden">
            {bozza.righe.map((r, i) => (
              <li key={r.id} className="px-4 py-4">
                <p className="font-medium leading-tight text-ink">{r.descrizione}</p>
                {r.codice_articolo && (
                  <p className="mt-0.5 text-xs text-ink-mute">{r.codice_articolo}</p>
                )}

                <div className="mt-3">
                  <span className="label mb-1">Quantità</span>
                  {soloLettura ? (
                    <p className="tabular text-sm text-ink">
                      {formatQuantita(r.quantita_milli, r.unita_misura)}
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CellaNumerica
                        etichetta="Quantità"
                        valore={milliAInput(r.quantita_milli)}
                        onCambia={(t) => aggiornaRiga(i, { quantita_milli: inputAMilli(t) })}
                        classe="w-full text-lg"
                      />
                      <span className="shrink-0 text-sm text-ink-mute">
                        {SIMBOLO_UM[r.unita_misura]}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <span className="label mb-1">Partita di prelievo</span>
                  {soloLettura ? (
                    <p className="text-sm text-ink-soft">{r.lotto_codice ?? '—'}</p>
                  ) : (
                    <SelettoreLotto
                      valore={r.lotto_id}
                      codiceValore={r.lotto_codice}
                      disponibili={disponibiliDi(r)}
                      quantitaRichiestaMilli={r.quantita_milli}
                      unitaMisura={r.unita_misura}
                      className="w-full min-w-0"
                      onScegli={(l) =>
                        aggiornaRiga(i, {
                          lotto_id: l?.lotto_id ?? null,
                          lotto_codice: l?.codice ?? null,
                        })
                      }
                    />
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <span className="label mb-1">Colli</span>
                    {soloLettura ? (
                      <p className="tabular text-sm text-ink">{r.colli || '—'}</p>
                    ) : (
                      <CellaNumerica
                        etichetta="Colli della riga"
                        valore={String(r.colli)}
                        onCambia={(t) => aggiornaRiga(i, { colli: Math.max(0, Math.round(Number(t) || 0)) })}
                        classe="w-full text-lg"
                      />
                    )}
                  </div>
                  <div>
                    <span className="label mb-1">Peso (kg)</span>
                    {soloLettura ? (
                      <p className="tabular text-sm text-ink">
                        {r.peso_kg_milli ? formatQuantita(r.peso_kg_milli, 'kg') : '—'}
                      </p>
                    ) : (
                      <CellaNumerica
                        etichetta="Peso della riga in chilogrammi"
                        valore={milliAInput(r.peso_kg_milli)}
                        onCambia={(t) => aggiornaRiga(i, { peso_kg_milli: inputAMilli(t) })}
                        classe="w-full text-lg"
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {!soloLettura && (
            <p className="border-t border-line px-4 py-3 text-xs text-ink-mute">
              Il lotto di prelievo è la provenienza che il cliente si porta a casa: si sceglie solo fra
              le partite che hanno ancora quell’articolo, e l’emissione rifiuta la riga se la partita
              non ha capienza.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
            <span className="text-ink-mute">
              {colliInUscita} colli · {formatQuantita(pesoInUscita, 'kg')}
            </span>
            {bozza.valorizzato ? (
              <span className="tabular text-ink">
                Imponibile {formatEuro(salvato.imponibile_cents)} · IVA {formatEuro(salvato.iva_cents)} ·{' '}
                <span className="font-semibold">Totale {formatEuro(salvato.totale_cents)}</span>
              </span>
            ) : (
              <span className="text-ink-mute">DDT non valorizzato: il PDF non riporta i prezzi.</span>
            )}
          </div>
        </section>
      </div>

      {/* Riepilogo di quanto sta uscendo, appena sopra il comando che lo fa
          uscire. Solo sul telefono: sul monitor è già tutto sotto gli occhi. */}
      {!soloLettura && Boolean(bozza.righe.length) && (
        <div className="sopra-barra-azioni sticky z-20 mt-3 md:hidden">
          <div className="card px-4 py-2.5">
            <p className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-mute">In uscita</span>
              <span className="tabular font-medium text-ink">
                {bozza.righe.length} {bozza.righe.length === 1 ? 'riga' : 'righe'} · {colliInUscita}{' '}
                colli · {formatQuantita(pesoInUscita, 'kg')}
              </span>
            </p>
            {Boolean(righeSenzaPartita.length) && (
              <p className="mt-1 text-xs text-warn">
                {righeSenzaPartita.length}{' '}
                {righeSenzaPartita.length === 1 ? 'riga senza partita' : 'righe senza partita'}: la
                provenienza non finirà sul documento.
              </p>
            )}
          </div>
        </div>
      )}

      {formIncasso && (
        <FormIncasso
          clienteIniziale={bozza.cliente_id}
          clienteNome={bozza.cliente_nome}
          ordineIniziale={bozza.ordine_id ?? undefined}
          ordineNumero={bozza.ordine_numero ?? undefined}
          importoInizialeCents={residuoOrdine}
          residuoCents={residuoOrdine}
          bloccaCliente
          onChiudi={() => setFormIncasso(false)}
          onSalvato={() => {
            setFormIncasso(false)
            ricaricaOrdine()
            notificaDatiCambiati()
          }}
        />
      )}

      {confermaEmissione && (
        <Conferma
          titolo="Emettere il DDT?"
          messaggio={
            <>
              <p>
                Escono <strong>{bozza.righe.length}</strong>{' '}
                {bozza.righe.length === 1 ? 'riga' : 'righe'} per {colliInUscita} colli e{' '}
                {formatQuantita(pesoInUscita, 'kg')}. Il magazzino si scarica adesso, partita per
                partita, e <strong>non si torna indietro</strong>: per correggere un DDT emesso si
                emette un DDT di reso.
              </p>

              <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                {bozza.righe.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="text-ink">{r.descrizione}</span>
                      <span className="block text-xs text-ink-mute">
                        {r.lotto_codice ? (
                          `da ${r.lotto_codice}`
                        ) : (
                          <span className="text-warn">senza partita dichiarata</span>
                        )}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-ink">
                      {formatQuantita(r.quantita_milli, r.unita_misura)}
                    </span>
                  </li>
                ))}
              </ul>

              {Boolean(righeSenzaPartita.length) && (
                <p className="mt-3 text-warn">
                  {righeSenzaPartita.length === 1
                    ? 'Una riga esce senza partita'
                    : `${righeSenzaPartita.length} righe escono senza partita`}
                  : il movimento nasce senza provenienza e la tracciabilità si perde. Chiudi, scegli
                  la partita proposta e riprova.
                </p>
              )}

              {bozza.ordine_id && (
                <p className="mt-3 text-ink-mute">
                  L’ordine {bozza.ordine_numero} passerà a evaso o evaso in parte, secondo quanto
                  resta da consegnare.
                </p>
              )}
            </>
          }
          etichettaConferma="Emetti DDT"
          distruttiva
          inCorso={inCorso}
          onConferma={() => void emetti()}
          onAnnulla={() => setConfermaEmissione(false)}
        />
      )}
    </>
  )
}
