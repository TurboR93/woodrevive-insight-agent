import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { AvvisoErrore } from '../components/Campi'
import BarraAzioni, { type AzionePagina } from '../components/BarraAzioni'
import IntestazionePagina from '../components/IntestazionePagina'
import SchedaLavorazioneCampi, {
  precompilaDaArticolo,
  type ValoriScheda,
} from '../components/SchedaLavorazioneCampi'
import { modaleAperta } from '../components/Ui'
import { notificaDatiCambiati } from '../components/eventiDati'
import type { FornitoreConTotali } from '../domain'
import { oggiISO } from '../lib/format'
import { messaggioDi, useFetch } from '../useFetch'

/**
 * Nuova scheda di lavorazione: una schermata sola, si salva una volta alla
 * fine. Finché non si preme «Salva», nessun numero SCH viene consumato.
 *
 * Le due porte d'ingresso sono le due precompilazioni vere:
 *
 *   `?ordine=<id>`   — dall'ordine di vendita: committente, telefono del
 *                      cliente e data di consegna arrivano da lì. È il caso
 *                      «il cliente ha ordinato, ordino il materiale su misura».
 *   `?articolo=<id>` — dal catalogo: essenza, spessore e forbici di misura.
 *
 * Si combinano (`?ordine=…&articolo=…`), e ogni campo resta modificabile dopo:
 * la precompilazione scrive lo stato iniziale del form, non vincola niente —
 * stesso principio delle righe del preventivo.
 */

function valoriVuoti(): ValoriScheda {
  return {
    data: oggiISO(),
    committente: '',
    telefono: null,
    data_consegna: null,
    articolo_id: null,
    fornitore_id: null,
    tipologie: [],
    essenza: null,
    larghezza_da_mm: null,
    larghezza_a_mm: null,
    lunghezza_da_mm: null,
    lunghezza_a_mm: null,
    spessore_mm: null,
    spazzolatura: null,
    stucco_colore: null,
    bordo_frontale: null,
    finitura: null,
    quantita_milli: null,
    unita_misura: null,
    annotazioni: null,
  }
}

export default function SchedaLavorazioneNuovaPage() {
  const navigate = useNavigate()
  const [parametri] = useSearchParams()
  const ordineDaUrl = parametri.get('ordine')
  const articoloDaUrl = parametri.get('articolo')

  const [valori, setValori] = useState<ValoriScheda>(valoriVuoti())
  const [fornitore, setFornitore] = useState<FornitoreConTotali | null>(null)
  const [ordineNumero, setOrdineNumero] = useState<string | null>(null)
  const [avviso, setAvviso] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const imposta = (patch: Partial<ValoriScheda>) => setValori((v) => ({ ...v, ...patch }))

  // L'ordine della querystring, e da lì il cliente: il telefono sta solo
  // nella sua anagrafica, l'ordine non lo porta.
  const { dati: ordine, errore: erroreOrdine } = useFetch(
    () => (ordineDaUrl ? api.ordine(ordineDaUrl) : Promise.resolve(null)),
    [ordineDaUrl],
  )
  const { dati: clienteOrdine } = useFetch(
    () => (ordine ? api.cliente(ordine.cliente_id) : Promise.resolve(null)),
    [ordine?.cliente_id],
  )
  const { dati: articoloUrl, errore: erroreArticolo } = useFetch(
    () => (articoloDaUrl ? api.articolo(articoloDaUrl) : Promise.resolve(null)),
    [articoloDaUrl],
  )

  // Ogni precompilazione vale una volta, quando il dato arriva: da lì in poi
  // il form è dell'utente e nessun refetch deve riscriverglielo.
  useEffect(() => {
    if (!ordine) return
    setOrdineNumero(ordine.numero)
    imposta({ committente: ordine.cliente_nome, data_consegna: ordine.data_consegna_prevista })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordine])

  useEffect(() => {
    if (!clienteOrdine) return
    imposta({ telefono: clienteOrdine.telefono })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteOrdine])

  useEffect(() => {
    if (!articoloUrl) return
    imposta(precompilaDaArticolo(articoloUrl))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articoloUrl])

  const pronto = Boolean(valori.committente.trim())

  const salva = async () => {
    if (!pronto) {
      setAvviso('Scrivi il committente: è la prima riga del modulo.')
      return
    }
    setInCorso(true)
    setAvviso(null)
    try {
      const s = await api.creaScheda({
        ...valori,
        committente: valori.committente.trim(),
        fornitore_id: fornitore?.id ?? null,
        fornitore_nome: null, // lo snapshot lo scrive il layer dati
        ordine_id: ordineDaUrl && ordine ? ordine.id : null,
        ordine_numero: null, // idem
        stato: 'bozza',
      })
      notificaDatiCambiati()
      navigate(`/schede-lavorazione/${s.id}`, { replace: true })
    } catch (e) {
      setAvviso(messaggioDi(e))
      setInCorso(false)
    }
  }

  // Cmd/Ctrl+Invio salva da qualunque campo, come nelle altre creazioni rapide.
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
      if (modaleAperta()) return
      e.preventDefault()
      void salva()
    }
    window.addEventListener('keydown', suTasto)
    return () => window.removeEventListener('keydown', suTasto)
  })

  const azioni: AzionePagina[] = [
    {
      chiave: 'annulla',
      etichetta: 'Annulla',
      a: '/schede-lavorazione',
      tono: 'fantasma',
      soloDesktop: true,
    },
    {
      chiave: 'salva',
      etichetta: 'Salva scheda',
      icona: Check,
      tono: 'primario',
      onClick: () => void salva(),
      disabilitata: !pronto || inCorso,
      motivo: !pronto ? 'Scrivi il committente per salvare.' : undefined,
      inCorso,
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Nuova scheda lavorazione"
        sottotitolo={
          ordineNumero
            ? `Dall'ordine ${ordineNumero}: committente e consegna sono già scritti, il resto si compila qui.`
            : 'La specifica per il fornitore: come deve arrivare il materiale.'
        }
        indietro={{ a: '/schede-lavorazione', label: 'Tutte le schede' }}
        azioni={<BarraAzioni azioni={azioni} />}
      />

      <AvvisoErrore messaggio={avviso ?? erroreOrdine ?? erroreArticolo} />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void salva()
        }}
      >
        <SchedaLavorazioneCampi
          valori={valori}
          imposta={imposta}
          fornitore={fornitore}
          onFornitore={setFornitore}
        />

        <p className="mt-4 text-xs text-ink-mute">
          La scheda nasce in bozza e non consuma un numero finché non la salvi. Da tastiera:
          Cmd/Ctrl+Invio salva.
        </p>
      </form>
    </>
  )
}
