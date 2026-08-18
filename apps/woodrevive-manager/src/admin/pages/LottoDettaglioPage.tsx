import { Pencil, Printer, Sprout } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../api'
import type { VoceGiacenzaLotto } from '../api'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import { AreaTesto, AvvisoErrore, Campo, GrigliaCampi, Scelta, Testo } from '../components/Campi'
import { QuantitaFirmata, TONO_MOVIMENTO } from '../components/CelleMagazzino'
import DataTable from '../components/DataTable'
import type { Colonna } from '../components/DataTable'
import { opzioniDa } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Card, Caricamento, Dato, Errore, Modale, StatoVuoto } from '../components/Ui'
import {
  ESSENZA_LABEL,
  ORIGINE_LABEL,
  PATINA_LABEL,
  QUALITA_LABEL,
  STATO_LOTTO_LABEL,
  TIPO_MOVIMENTO_LABEL,
  TONO_LOTTO,
  TRANSIZIONI_LOTTO,
  prossimiStati,
} from '../domain'
import type {
  Essenza,
  Lotto,
  LottoInput,
  MovimentoMagazzino,
  Patina,
  Qualita,
  StatoLotto,
} from '../domain'
import { centsAInput, euroACents, formatData, formatEuro, formatQuantita } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Scheda del lotto: la pagina che risponde alla domanda del cliente — «da che
 * edificio viene il legno di casa mia?».
 *
 * È la ragione per cui il lotto esiste. Wood Revive non lavora il legno: quello
 * che vende in più rispetto a un magazzino qualunque è la storia del materiale,
 * e questa scheda è il posto dove quella storia sta scritta e verificabile.
 *
 * Verificabile, non dichiarata: il «contenuto della partita» non è un campo
 * compilato a mano, è la somma dei movimenti che portano insieme articolo e
 * lotto. Se di quell'articolo non è mai entrato niente da questo lotto, qui non
 * compare — e il DDT che lo dichiarasse verrebbe rifiutato all'emissione.
 *
 * È anche la schermata che si **mostra al cliente dal telefono**, in cantiere o
 * in showroom: per questo la storia, il contenuto e la discendenza si leggono
 * impilati sotto `md:` e non come tabelle da scorrere di lato.
 */
export default function LottoDettaglioPage() {
  const { id = '' } = useParams()
  const [modifica, setModifica] = useState(false)

  const { dati, caricamento, errore, ricarica } = useFetch(async () => {
    const lotto = await api.lotto(id)
    const [contenuto, discendenza, movimenti, fornitori] = await Promise.all([
      api.giacenzePerLotto(id),
      api.discendenzaLotto(id),
      api.listaMovimenti({ lotto_id: id }),
      api.listaFornitori(),
    ])
    const acquisto = lotto.ordine_acquisto_id
      ? await api.acquisto(lotto.ordine_acquisto_id).catch(() => null)
      : null
    return { lotto, contenuto, discendenza, movimenti, fornitori, acquisto }
  }, [id])

  if (caricamento) return <Caricamento etichetta="Carico la scheda del lotto…" />
  if (errore) return <Errore messaggio={errore} onRiprova={ricarica} />
  if (!dati) return <Caricamento etichetta="Carico la scheda del lotto…" />

  const { lotto, contenuto, discendenza, movimenti, fornitori, acquisto } = dati
  const fornitore = fornitori.find((f) => f.id === lotto.fornitore_id)?.ragione_sociale ?? null
  const valoreResiduo = contenuto.reduce((t, v) => t + v.valore_residuo_cents, 0)

  const colonneContenuto: Colonna<VoceGiacenzaLotto>[] = [
    {
      chiave: 'articolo',
      intestazione: 'Articolo',
      priorita: 'principale',
      cella: (v) => (
        <span className="text-ink">
          <span className="tabular text-ink-mute">{v.codice}</span> {v.nome}
        </span>
      ),
    },
    {
      chiave: 'caricato',
      intestazione: 'Entrato con la partita',
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'secondaria',
      etichettaCard: 'Entrato',
      cella: (v) => (
        <span className="tabular text-ink-soft">
          {formatQuantita(v.caricato_milli, v.unita_misura)}
        </span>
      ),
    },
    {
      // La domanda del cliente davanti alla catasta: quanto ne è rimasto.
      chiave: 'residuo',
      intestazione: 'Residuo',
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'secondaria',
      etichettaCard: 'Ne resta',
      cella: (v) => (
        <span
          className={`tabular text-lg font-semibold md:text-sm ${v.residuo_milli > 0 ? 'text-ink' : 'text-ink-mute'}`}
        >
          {formatQuantita(v.residuo_milli, v.unita_misura)}
        </span>
      ),
    },
    {
      // Quanto capitale è ancora fermo su questa riga: è un numero interno,
      // e sul telefono si mostra la scheda al cliente.
      chiave: 'valore',
      intestazione: 'Valore residuo',
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'solo-tabella',
      cella: (v) => <span className="tabular text-ink">{formatEuro(v.valore_residuo_cents)}</span>,
    },
  ]

  const colonneMovimenti: Colonna<MovimentoMagazzino>[] = [
    {
      chiave: 'data',
      intestazione: 'Data',
      priorita: 'secondaria',
      cella: (m) => <span className="tabular">{formatData(m.data)}</span>,
      classe: 'whitespace-nowrap',
    },
    {
      chiave: 'tipo',
      intestazione: 'Tipo',
      priorita: 'principale',
      cella: (m) => (
        <StatoBadge etichetta={TIPO_MOVIMENTO_LABEL[m.tipo]} tono={TONO_MOVIMENTO[m.tipo]} />
      ),
    },
    {
      chiave: 'origine',
      intestazione: 'Origine',
      priorita: 'solo-tabella',
      cella: (m) => ORIGINE_LABEL[m.origine],
    },
    {
      chiave: 'quantita',
      intestazione: 'Quantità',
      allineamento: 'destra',
      priorita: 'secondaria',
      cella: (m) => <QuantitaFirmata movimento={m} />,
      classe: 'whitespace-nowrap',
    },
    {
      chiave: 'valore',
      intestazione: 'Valore',
      allineamento: 'destra',
      priorita: 'solo-tabella',
      cella: (m) => <span className="tabular">{formatEuro(m.valore_totale_cents)}</span>,
      classe: 'whitespace-nowrap',
    },
    {
      chiave: 'causale',
      intestazione: 'Causale',
      priorita: 'secondaria',
      cella: (m) => <span className="text-ink-soft">{m.causale}</span>,
    },
  ]

  /*
   * Stampare la scheda è un gesto da ufficio: sul telefono non esiste una
   * stampante e il comando sprecherebbe metà della barra in fondo. Modifica
   * invece resta a portata di pollice — capita di correggere la provenienza
   * davanti alla catasta, che è il momento in cui la si ricorda.
   */
  const azioni: AzionePagina[] = [
    {
      chiave: 'stampa',
      etichetta: 'Stampa scheda',
      icona: Printer,
      tono: 'secondario',
      soloDesktop: true,
      onClick: () => window.print(),
    },
    {
      chiave: 'modifica',
      etichetta: 'Modifica',
      icona: Pencil,
      tono: 'primario',
      onClick: () => setModifica(true),
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo={`${lotto.codice} — ${lotto.descrizione}`}
        sottotitolo={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatoBadge etichetta={STATO_LOTTO_LABEL[lotto.stato]} tono={TONO_LOTTO[lotto.stato]} />
            <span>
              {ESSENZA_LABEL[lotto.essenza]} · {PATINA_LABEL[lotto.patina]} · qualità {lotto.qualita}
            </span>
          </span>
        }
        indietro={{ a: '/lotti', label: 'Tutti i lotti' }}
        azioni={<BarraAzioni azioni={azioni} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card titolo="Provenienza e storia">
          {/* Le note storiche stanno in cima e in evidenza: sono il testo che
              si racconta al cliente, non una postilla da mettere in fondo. */}
          <div className="rounded-lg bg-tint/40 px-4 py-3">
            <p className="label mb-1">La storia di questa partita</p>
            <p className="text-sm leading-relaxed text-ink">
              {lotto.note_storiche ?? 'Nessuna storia registrata: è il dato che vale di più, vale la pena scriverlo.'}
            </p>
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dato etichetta="Edificio">{lotto.provenienza_edificio}</Dato>
            <Dato etichetta="Località">
              {[lotto.provenienza_localita, lotto.provenienza_provincia ? `(${lotto.provenienza_provincia})` : null]
                .filter(Boolean)
                .join(' ') || null}
            </Dato>
            <Dato etichetta="Anno di costruzione stimato">
              {lotto.anno_costruzione_stimato ? (
                <span className="tabular">~{lotto.anno_costruzione_stimato}</span>
              ) : null}
            </Dato>
            <Dato etichetta="Ubicazione in magazzino">{lotto.ubicazione}</Dato>
            <Dato etichetta="Essenza">{ESSENZA_LABEL[lotto.essenza]}</Dato>
            <Dato etichetta="Patina">{PATINA_LABEL[lotto.patina]}</Dato>
            <Dato etichetta="Qualità">{QUALITA_LABEL[lotto.qualita]}</Dato>
            <Dato etichetta="Note interne">{lotto.note}</Dato>
          </dl>
        </Card>

        <Card titolo="Acquisto">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Le due uscite dalla scheda. Sotto md: sono bersagli da 44px:
                si aprono col pollice, in piedi davanti alla catasta. */}
            <Dato etichetta="Fornitore">
              {fornitore ? (
                <Link
                  to="/fornitori"
                  className="inline-flex min-h-[2.75rem] items-center text-brand-strong hover:underline md:min-h-0"
                >
                  {fornitore}
                </Link>
              ) : null}
            </Dato>
            <Dato etichetta="Ordine di acquisto">
              {acquisto ? (
                <Link
                  to={`/acquisti/${acquisto.id}`}
                  className="tabular inline-flex min-h-[2.75rem] items-center font-semibold text-brand-strong hover:underline md:min-h-0"
                >
                  {acquisto.numero}
                </Link>
              ) : null}
            </Dato>
            <Dato etichetta="Data di acquisto">
              <span className="tabular">{formatData(lotto.data_acquisto)}</span>
            </Dato>
            <Dato etichetta="Costo della partita">
              <span className="tabular">{formatEuro(lotto.costo_acquisto_cents)}</span>
            </Dato>
            <Dato etichetta="Valore ancora in magazzino">
              <span className="tabular font-semibold">{formatEuro(valoreResiduo)}</span>
            </Dato>
            <Dato etichetta="Articoli caricati">
              <span className="tabular">{contenuto.length}</span>
            </Dato>
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-mute">
            Il costo della partita comprende la quota di trasporto ripartita sulle righe della
            fornitura: è quello che finisce nel costo medio degli articoli, e quindi nel margine.
          </p>
        </Card>
      </div>

      <div className="mt-4">
        <Card titolo="Contenuto della partita">
          {contenuto.length ? (
            <>
              <DataTable
                righe={contenuto}
                colonne={colonneContenuto}
                chiaveRiga={(v) => v.articolo_id}
                messaggioVuoto="Niente entrato con questa partita."
              />
              <p className="mt-3 text-xs leading-relaxed text-ink-mute">
                Le quantità non sono scritte sul lotto: sono la somma dei movimenti che portano
                insieme articolo e partita. «Entrato» resta lì anche a partita finita — è ciò che
                permette di rispondere al cliente fra cinque anni.
              </p>
            </>
          ) : (
            <StatoVuoto
              icona={Sprout}
              titolo="Nessun carico su questa partita"
              testo="Il lotto è censito ma non è ancora entrato niente a magazzino con il suo nome: succede registrando la ricezione dell’ordine di acquisto."
            />
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card titolo="Discendenza — dov’è finito questo legno">
          {discendenza.consegne.length ? (
            /*
             * Sotto `sm:` la consegna si legge impilata — cliente e documento
             * sopra, quantità sotto in evidenza — invece di due gruppi che
             * `justify-between` manderebbe a capo in ordine sparso. È la
             * sezione che si gira verso il cliente: deve leggersi, non stare
             * in una riga sola a tutti i costi.
             */
            <ul className="space-y-2">
              {discendenza.consegne.map((c, i) => (
                <li key={`${c.ddt_id}-${i}`}>
                  <Link
                    to={`/ddt/${c.ddt_id}`}
                    className="flex min-h-[2.75rem] flex-col gap-1 rounded-lg border border-line px-4 py-3 text-sm transition-colors hover:bg-tint/30 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-ink">
                        <span className="tabular font-semibold">{c.numero}</span>
                        <span className="text-ink-soft"> · {c.cliente}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-mute">
                        <span className="tabular">{formatData(c.data)}</span> · {c.articolo}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-base font-semibold text-ink sm:text-sm">
                      {formatQuantita(c.quantita_milli, c.unita_misura)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <StatoVuoto
              icona={Sprout}
              titolo="Non è ancora uscito nulla"
              testo="Da questa partita non è stato consegnato niente a nessun cliente."
            />
          )}
        </Card>
      </div>

      <div className="mt-4">
        <h2 className="mb-3 font-display text-lg text-ink">Movimenti del lotto</h2>
        <DataTable
          righe={movimenti}
          colonne={colonneMovimenti}
          chiaveRiga={(m) => m.id}
          messaggioVuoto="Nessun movimento registrato su questo lotto."
        />
      </div>

      {modifica && (
        <ModaleModificaLotto
          lotto={lotto}
          fornitori={fornitori.map((f) => ({ id: f.id, nome: f.ragione_sociale }))}
          onChiudi={() => setModifica(false)}
          onSalvato={() => {
            setModifica(false)
            ricarica()
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Modifica del lotto
// ---------------------------------------------------------------------------

function ModaleModificaLotto({
  lotto,
  fornitori,
  onChiudi,
  onSalvato,
}: {
  lotto: Lotto
  fornitori: Array<{ id: string; nome: string }>
  onChiudi: () => void
  onSalvato: () => void
}) {
  const [descrizione, setDescrizione] = useState(lotto.descrizione)
  const [fornitoreId, setFornitoreId] = useState(lotto.fornitore_id ?? '')
  const [edificio, setEdificio] = useState(lotto.provenienza_edificio ?? '')
  const [localita, setLocalita] = useState(lotto.provenienza_localita ?? '')
  const [provincia, setProvincia] = useState(lotto.provenienza_provincia ?? '')
  const [anno, setAnno] = useState(lotto.anno_costruzione_stimato?.toString() ?? '')
  const [dataAcquisto, setDataAcquisto] = useState(lotto.data_acquisto)
  const [essenza, setEssenza] = useState<Essenza>(lotto.essenza)
  const [patina, setPatina] = useState<Patina>(lotto.patina)
  const [qualita, setQualita] = useState<Qualita>(lotto.qualita)
  const [costo, setCosto] = useState(centsAInput(lotto.costo_acquisto_cents))
  const [ubicazione, setUbicazione] = useState(lotto.ubicazione ?? '')
  const [stato, setStato] = useState<StatoLotto>(lotto.stato)
  const [noteStoriche, setNoteStoriche] = useState(lotto.note_storiche ?? '')
  const [note, setNote] = useState(lotto.note ?? '')

  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  /*
   * `disponibile` ed `esaurito` sono derivati dal residuo della partita: qui si
   * offre solo quello che la macchina a stati ammette davvero — in pratica
   * l'archiviazione e il ritorno indietro. Un select con tutti gli stati
   * lascerebbe dichiarare esaurita una partita che è ancora in cortile.
   */
  const statiAmmessi: StatoLotto[] = [lotto.stato, ...prossimiStati(TRANSIZIONI_LOTTO, lotto.stato)]
  const opzioniStato = opzioniDa(STATO_LOTTO_LABEL).filter((o) => statiAmmessi.includes(o.valore))

  const salva = async () => {
    setInCorso(true)
    setErrore(null)
    const input: LottoInput = {
      descrizione: descrizione.trim(),
      fornitore_id: fornitoreId || null,
      ordine_acquisto_id: lotto.ordine_acquisto_id,
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
      stato,
      note_storiche: noteStoriche.trim() || null,
      note: note.trim() || null,
      foto: lotto.foto,
    }
    try {
      await api.aggiornaLotto(lotto.id, input)
      onSalvato()
    } catch (e) {
      setErrore(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Modale
      titolo={`Modifica ${lotto.codice}`}
      sottotitolo="Le quantità non si toccano da qui: stanno sugli articoli caricati con questa partita."
      onChiudi={onChiudi}
      larghezza="max-w-3xl"
      variante="foglio"
      piede={
        <>
          <button type="button" className="btn-secondary" onClick={onChiudi} disabled={inCorso}>
            Annulla
          </button>
          <button type="button" className="btn-primary" onClick={salva} disabled={inCorso}>
            {inCorso ? 'Salvataggio…' : 'Salva'}
          </button>
        </>
      }
    >
      <AvvisoErrore messaggio={errore} />

      <div className="space-y-4">
        <GrigliaCampi>
          <Campo etichetta="Descrizione" obbligatorio className="md:col-span-2">
            <Testo valore={descrizione} onCambia={setDescrizione} />
          </Campo>
          <Campo etichetta="Fornitore">
            <Scelta
              valore={fornitoreId}
              onCambia={setFornitoreId}
              vuoto="— nessuno —"
              opzioni={fornitori.map((f) => ({ valore: f.id, etichetta: f.nome }))}
            />
          </Campo>
          <Campo etichetta="Data di acquisto" obbligatorio>
            <Testo valore={dataAcquisto} onCambia={setDataAcquisto} type="date" />
          </Campo>
        </GrigliaCampi>

        <GrigliaCampi colonne={3}>
          <Campo etichetta="Edificio di provenienza">
            <Testo valore={edificio} onCambia={setEdificio} />
          </Campo>
          <Campo etichetta="Località">
            <Testo valore={localita} onCambia={setLocalita} />
          </Campo>
          <Campo etichetta="Provincia">
            <Testo valore={provincia} onCambia={setProvincia} maxLength={2} />
          </Campo>
          <Campo etichetta="Anno di costruzione stimato">
            <Testo valore={anno} onCambia={setAnno} type="number" />
          </Campo>
          <Campo etichetta="Ubicazione">
            <Testo valore={ubicazione} onCambia={setUbicazione} />
          </Campo>
          <Campo
            etichetta="Stato"
            aiuto="Disponibile ed esaurito li deriva il residuo: a mano si può solo archiviare."
          >
            <Scelta valore={stato} onCambia={setStato} opzioni={opzioniStato} />
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
            aiuto="Quota di trasporto ripartita compresa."
          >
            <Testo valore={costo} onCambia={setCosto} inputMode="decimal" />
          </Campo>
          <Campo etichetta="Note interne">
            <AreaTesto valore={note} onCambia={setNote} righe={3} />
          </Campo>
          <Campo
            etichetta="Note storiche"
            className="md:col-span-2"
            aiuto="È il testo che si racconta al cliente."
          >
            <AreaTesto valore={noteStoriche} onCambia={setNoteStoriche} righe={3} />
          </Campo>
        </GrigliaCampi>
      </div>
    </Modale>
  )
}
