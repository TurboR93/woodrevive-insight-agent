import { useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import { QuantitaFirmata, TONO_MOVIMENTO } from '../components/CelleMagazzino'
import DataTable from '../components/DataTable'
import type { Colonna } from '../components/DataTable'
import Filtri, { opzioniDa } from '../components/Filtri'
import type { ValoriFiltri } from '../components/Filtri'
import IntestazionePagina from '../components/IntestazionePagina'
import StatoBadge from '../components/StatoBadge'
import { Caricamento, Errore } from '../components/Ui'
import { useDatiCambiati } from '../components/eventiDati'
import { ORIGINE_LABEL, TIPO_MOVIMENTO_LABEL } from '../domain'
import type { Articolo, ID, Lotto, MovimentoMagazzino } from '../domain'
import { formatData, formatEuro } from '../lib/format'
import { useFetch } from '../useFetch'

/**
 * Il libro giornale del magazzino. Ogni riga è un fatto già avvenuto: non si
 * corregge, semmai si compensa con un'altra riga.
 *
 * Le origini sono cinque e sono tutte quelle che esistono: la merce entra con
 * la ricezione di un acquisto o rientra con un reso, esce con un DDT, si
 * corregge con una rettifica di inventario o si perde con uno scarto di
 * magazzino (rotto, bagnato, inservibile). Wood Revive non lavora il legno:
 * fra l'ingresso e l'uscita non succede nient'altro.
 *
 * Sotto `md:` ogni movimento è una card: tipo, articolo e quantità in chiaro,
 * la partita e il documento sotto. Origine e valore restano alla tabella —
 * in magazzino, con il telefono in mano, non è quello che si cerca.
 */
export default function MovimentiPage() {
  const [filtri, setFiltri] = useState<ValoriFiltri>({})

  const { dati, caricamento, errore, ricarica } = useFetch(async () => {
    const [movimenti, articoli, lotti] = await Promise.all([
      api.listaMovimenti({
        q: filtri.q,
        tipo: filtri.tipo,
        origine: filtri.origine,
        dal: filtri.dal,
        al: filtri.al,
        limite: 200,
      }),
      api.listaArticoli(),
      api.listaLotti(),
    ])
    return {
      movimenti,
      articoli: new Map<ID, Articolo>(articoli.map((a) => [a.id, a])),
      lotti: new Map<ID, Lotto>(lotti.map((l) => [l.id, l])),
    }
  }, [filtri.q, filtri.tipo, filtri.origine, filtri.dal, filtri.al])
  // Un carico o una rettifica scrivono qui: il giornale li deve mostrare
  // subito, senza che nessuno ricarichi la pagina.
  useDatiCambiati(ricarica)

  const articoli = dati?.articoli
  const lotti = dati?.lotti

  const colonne: Colonna<MovimentoMagazzino>[] = [
    {
      chiave: 'data',
      intestazione: 'Data',
      priorita: 'secondaria',
      cella: (m) => <span className="tabular text-ink">{formatData(m.data)}</span>,
      classe: 'whitespace-nowrap',
    },
    {
      chiave: 'tipo',
      intestazione: 'Tipo',
      priorita: 'principale',
      cella: (m) => <StatoBadge etichetta={TIPO_MOVIMENTO_LABEL[m.tipo]} tono={TONO_MOVIMENTO[m.tipo]} />,
    },
    {
      chiave: 'origine',
      intestazione: 'Origine',
      priorita: 'solo-tabella',
      cella: (m) => <span className="text-ink-soft">{ORIGINE_LABEL[m.origine]}</span>,
    },
    {
      chiave: 'articolo',
      intestazione: 'Articolo',
      priorita: 'principale',
      cella: (m) => {
        const a = m.articolo_id ? articoli?.get(m.articolo_id) : undefined
        if (!a) return <span className="text-ink-mute">—</span>
        return (
          <span className="text-ink">
            <span className="tabular text-ink-mute">{a.codice}</span> {a.nome}
          </span>
        )
      },
    },
    {
      chiave: 'lotto',
      intestazione: 'Lotto',
      priorita: 'secondaria',
      etichettaCard: 'Partita',
      cella: (m) => {
        const l = m.lotto_id ? lotti?.get(m.lotto_id) : undefined
        if (!l) return <span className="text-ink-mute">—</span>
        return (
          <Link
            to={`/lotti/${l.id}`}
            // Sotto md: questo link vive dentro una card e si preme col
            // pollice: 44px. Da md: in su è una cella di tabella e torna
            // compatto, come vuole la densità dell'ufficio.
            className="tabular inline-flex min-h-[2.75rem] items-center font-semibold text-brand-strong hover:underline md:min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            {l.codice}
          </Link>
        )
      },
      classe: 'whitespace-nowrap',
    },
    {
      chiave: 'quantita',
      intestazione: 'Quantità',
      allineamento: 'destra',
      classe: 'whitespace-nowrap',
      priorita: 'secondaria',
      cella: (m) => <QuantitaFirmata movimento={m} />,
    },
    {
      chiave: 'valore',
      intestazione: 'Valore',
      allineamento: 'destra',
      priorita: 'solo-tabella',
      cella: (m) => <span className="tabular text-ink">{formatEuro(m.valore_totale_cents)}</span>,
      classe: 'whitespace-nowrap',
    },
    {
      chiave: 'documento',
      intestazione: 'Documento',
      priorita: 'secondaria',
      cella: (m) => {
        const percorso = percorsoDocumento(m)
        if (!m.documento_numero) return <span className="text-ink-mute">—</span>
        if (!percorso) return <span className="tabular text-ink-soft">{m.documento_numero}</span>
        return (
          <Link
            to={percorso}
            className="tabular inline-flex min-h-[2.75rem] items-center font-semibold text-brand-strong hover:underline md:min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            {m.documento_numero}
          </Link>
        )
      },
      classe: 'whitespace-nowrap',
    },
    {
      // Per una rettifica la causale È il documento: senza, il movimento non
      // si può controllare. Resta sulla card anche sul telefono.
      chiave: 'causale',
      intestazione: 'Causale',
      priorita: 'secondaria',
      cella: (m) => <span className="text-ink-soft">{m.causale}</span>,
    },
  ]

  return (
    <>
      <IntestazionePagina
        titolo="Movimenti di magazzino"
        sottotitolo="Ogni riga è un fatto immutabile: la giacenza di un articolo è la somma dei suoi movimenti."
      />

      <Filtri
        valori={filtri}
        onCambia={setFiltri}
        segnaposto="Cerca per causale, documento, note…"
        definizioni={[
          { chiave: 'tipo', etichetta: 'Tipo', tipo: 'select', opzioni: opzioniDa(TIPO_MOVIMENTO_LABEL) },
          { chiave: 'origine', etichetta: 'Origine', tipo: 'select', opzioni: opzioniDa(ORIGINE_LABEL) },
          { chiave: 'dal', etichetta: 'Dal', tipo: 'data' },
          { chiave: 'al', etichetta: 'Al', tipo: 'data' },
        ]}
      />

      {caricamento && !dati ? (
        <Caricamento etichetta="Carico i movimenti…" />
      ) : errore ? (
        <Errore messaggio={errore} onRiprova={ricarica} />
      ) : (
        <>
          <DataTable
            righe={dati?.movimenti ?? []}
            colonne={colonne}
            chiaveRiga={(m) => m.id}
            messaggioVuoto="Nessun movimento con questi criteri."
          />
          {(dati?.movimenti.length ?? 0) >= 200 && (
            <p className="mt-3 text-xs text-ink-mute">
              Mostrati i 200 movimenti più recenti: restringi il periodo per vedere il resto.
            </p>
          )}
        </>
      )}
    </>
  )
}

/**
 * Dove porta il documento che ha generato il movimento.
 * Le rettifiche di inventario non hanno un documento da aprire: il movimento
 * stesso, con la sua causale, è il documento.
 */
function percorsoDocumento(m: MovimentoMagazzino): string | null {
  if (!m.documento_id) return null
  switch (m.documento_tipo) {
    case 'ddt':
      return `/ddt/${m.documento_id}`
    case 'ordine_acquisto':
      return `/acquisti/${m.documento_id}`
    default:
      return null
  }
}
