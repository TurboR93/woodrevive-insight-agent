import { FileDown, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { api } from '../api'
import { AvvisoErrore } from '../components/Campi'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import IntestazionePagina from '../components/IntestazionePagina'
import SchedaLavorazioneCampi from '../components/SchedaLavorazioneCampi'
import { SelectStato } from '../components/StatoBadge'
import { Caricamento, Conferma, Errore } from '../components/Ui'
import { notificaDatiCambiati } from '../components/eventiDati'
import {
  STATO_SCHEDA_LABEL,
  TONO_SCHEDA,
  TRANSIZIONI_SCHEDA,
  prossimiStati,
  type FornitoreConTotali,
  type SchedaLavorazione,
  type StatoScheda,
} from '../domain'
import { formatData } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Dettaglio di una scheda di lavorazione.
 *
 * Si modifica in `bozza` e anche in `inviata` — col fornitore si aggiusta al
 * telefono, e i campi sono tutti della scheda, senza join che driftano. Si
 * blocca su `chiusa` e `annullata`: una scheda superata si rifà, non si riapre.
 *
 * L'eliminazione vale solo per bozze e annullate: una scheda consegnata al
 * fornitore prima si annulla — un passaggio esplicito, non un click accidentale
 * (poi, da annullata, si può anche eliminare).
 */
export default function SchedaLavorazioneDettaglioPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const { dati, caricamento, errore, ricarica } = useFetch(() => api.scheda(id), [id])

  const [bozza, setBozza] = useState<SchedaLavorazione | null>(null)
  /** L'ultima versione confermata dal server: il metro di «modifiche non salvate». */
  const [salvato, setSalvato] = useState<SchedaLavorazione | null>(null)
  const [fornitore, setFornitore] = useState<FornitoreConTotali | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)
  const [confermaElimina, setConfermaElimina] = useState(false)
  const [erroreElimina, setErroreElimina] = useState<string | null>(null)

  /**
   * Una risposta del server è la nuova verità — anche per il selettore del
   * fornitore, che vive in uno stato suo: senza il riallineamento, un cambio
   * di stato che riporta la bozza al fornitore salvato lascerebbe il
   * selettore su quello scelto e mai salvato, e il prossimo salvataggio
   * persisterebbe un valore diverso da quello a schermo.
   */
  const arrivaDalServer = (s: SchedaLavorazione) => {
    setBozza(s)
    setSalvato(s)
    setFornitore((f) => ((f?.id ?? null) === s.fornitore_id ? f : null))
    if (s.fornitore_id) {
      void api
        .fornitore(s.fornitore_id)
        .then(setFornitore)
        .catch(() => setFornitore(null))
    }
  }

  useEffect(() => {
    setBozza(dati ?? null)
    setSalvato(dati ?? null)
  }, [dati])

  // Il selettore vuole il fornitore intero, la scheda ne porta solo l'id.
  const { dati: fornitoreRisolto } = useFetch(
    () => (dati?.fornitore_id ? api.fornitore(dati.fornitore_id) : Promise.resolve(null)),
    [dati?.fornitore_id],
  )
  useEffect(() => setFornitore(fornitoreRisolto ?? null), [fornitoreRisolto])

  if (errore) return <Errore messaggio={errore} onRiprova={ricarica} />
  if (caricamento || !bozza || !salvato) return <Caricamento />

  const soloLettura = bozza.stato === 'chiusa' || bozza.stato === 'annullata'
  const modificato = JSON.stringify(bozza) !== JSON.stringify(salvato)
  const imposta = (patch: Partial<SchedaLavorazione>) => setBozza({ ...bozza, ...patch })

  const salva = async () => {
    setInCorso(true)
    setAvviso(null)
    try {
      // Niente stato e niente ordine_id: lo stato passa dalle transizioni, e
      // un collegamento non toccato non deve riscrivere il suo snapshot.
      arrivaDalServer(
        await api.aggiornaScheda(id, {
          data: bozza.data,
          committente: bozza.committente.trim(),
          telefono: bozza.telefono,
          data_consegna: bozza.data_consegna,
          articolo_id: bozza.articolo_id,
          fornitore_id: bozza.fornitore_id,
          tipologie: bozza.tipologie,
          essenza: bozza.essenza,
          larghezza_da_mm: bozza.larghezza_da_mm,
          larghezza_a_mm: bozza.larghezza_a_mm,
          lunghezza_da_mm: bozza.lunghezza_da_mm,
          lunghezza_a_mm: bozza.lunghezza_a_mm,
          spessore_mm: bozza.spessore_mm,
          spazzolatura: bozza.spazzolatura,
          stucco_colore: bozza.stucco_colore,
          bordo_frontale: bozza.bordo_frontale,
          finitura: bozza.finitura,
          quantita_milli: bozza.quantita_milli,
          unita_misura: bozza.unita_misura,
          annotazioni: bozza.annotazioni,
        }),
      )
      notificaDatiCambiati()
    } catch (e) {
      setAvviso(messaggioDi(e))
    } finally {
      setInCorso(false)
    }
  }

  const cambiaStato = async (stato: StatoScheda) => {
    setAvviso(null)
    try {
      arrivaDalServer(await api.cambiaStatoScheda(id, stato))
      notificaDatiCambiati()
    } catch (e) {
      setAvviso(messaggioDi(e))
    }
  }

  /**
   * Il generatore vive in `documents/` e si carica al volo, così jsPDF non
   * pesa sul primo caricamento del pannello. Si stampa la BOZZA a schermo, non
   * la copia salvata: il PDF deve dire quello che si vede. E si stampa in
   * qualunque stato, anche chiusa — ristampare una specifica vecchia è il caso
   * d'uso, non un'eccezione.
   */
  const scaricaPdf = async () => {
    setAvviso(null)
    try {
      const { generaSchedaLavorazionePdf } = await import('../documents/schedaLavorazionePdf')
      await generaSchedaLavorazionePdf(bozza)
    } catch (e) {
      setAvviso(`PDF non ancora disponibile: ${messaggioDi(e)}`)
    }
  }

  const elimina = async () => {
    setInCorso(true)
    try {
      await api.eliminaScheda(id)
      notificaDatiCambiati()
      navigate('/schede-lavorazione', { replace: true })
    } catch (e) {
      setErroreElimina(messaggioDi(e))
      setConfermaElimina(false)
      setInCorso(false)
    }
  }

  const azioni: AzionePagina[] = [
    ...(modificato && !soloLettura
      ? [
          {
            chiave: 'salva',
            etichetta: 'Salva scheda',
            etichettaBreve: 'Salva',
            tono: 'primario',
            onClick: () => void salva(),
            disabilitata: inCorso,
            inCorso,
          } satisfies AzionePagina,
        ]
      : []),
    {
      chiave: 'pdf',
      etichetta: 'Scarica PDF',
      etichettaBreve: 'PDF',
      icona: FileDown,
      tono: 'secondario',
      onClick: () => void scaricaPdf(),
      // La scheda si stampa in ufficio e si consegna in mano: sul telefono
      // la barra resta ai comandi che servono davanti al materiale.
      soloDesktop: true,
    },
    {
      chiave: 'elimina',
      etichetta: 'Elimina',
      icona: Trash2,
      tono: 'pericolo',
      soloDesktop: true,
      onClick: () => {
        setErroreElimina(null)
        setConfermaElimina(true)
      },
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo={`Scheda ${bozza.numero}`}
        sottotitolo={
          <>
            {bozza.committente}
            {bozza.fornitore_nome && <> — per {bozza.fornitore_nome}</>}
            {bozza.data_consegna && <> · consegna {formatData(bozza.data_consegna)}</>}
            {bozza.ordine_numero && (
              <>
                {' '}
                · da{' '}
                {bozza.ordine_id ? (
                  <Link
                    to={`/ordini/${bozza.ordine_id}`}
                    className="underline decoration-line underline-offset-2 hover:text-brand-strong"
                  >
                    {bozza.ordine_numero}
                  </Link>
                ) : (
                  // L'ordine non c'è più, ma la scheda l'aveva dichiarato: lo
                  // snapshot resta leggibile anche senza un posto dove andare.
                  bozza.ordine_numero
                )}
              </>
            )}
          </>
        }
        indietro={{ a: '/schede-lavorazione', label: 'Tutte le schede' }}
        azioni={
          <>
            <SelectStato
              stato={bozza.stato}
              etichette={STATO_SCHEDA_LABEL}
              toni={TONO_SCHEDA}
              ammessi={prossimiStati(TRANSIZIONI_SCHEDA, bozza.stato)}
              onCambia={(s) => void cambiaStato(s)}
            />
            <BarraAzioni azioni={azioni} />
          </>
        }
      />

      <AvvisoErrore messaggio={avviso ?? erroreElimina} />

      <SchedaLavorazioneCampi
        valori={bozza}
        imposta={imposta}
        fornitore={fornitore}
        onFornitore={(f) => {
          setFornitore(f)
          // Anche il nome, per il sottotitolo e per il PDF stampato prima del
          // salvataggio: «il PDF deve dire quello che si vede». Lo snapshot
          // persistito resta comunque del layer dati, che lo ricalcola dal
          // record vivo quando si salva.
          imposta({ fornitore_id: f?.id ?? null, fornitore_nome: f?.ragione_sociale ?? null })
        }}
        disabilitato={soloLettura}
      />

      {soloLettura && (
        <p className="mt-4 text-xs text-ink-mute">
          Una scheda {STATO_SCHEDA_LABEL[bozza.stato].toLowerCase()} non si modifica: se serve una
          specifica diversa, se ne fa una nuova.
        </p>
      )}

      {confermaElimina && (
        <Conferma
          titolo="Eliminare la scheda?"
          messaggio={
            <>
              La scheda <strong>{bozza.numero}</strong> per{' '}
              <strong>{bozza.committente}</strong> sparisce dall’archivio. Se è già stata
              consegnata al fornitore, annullala invece di eliminarla.
            </>
          }
          etichettaConferma="Elimina"
          distruttiva
          inCorso={inCorso}
          onConferma={() => void elimina()}
          onAnnulla={() => setConfermaElimina(false)}
        />
      )}
    </>
  )
}
