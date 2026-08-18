import { Info } from 'lucide-react'

import { api } from '../api'
import { useFetch } from '../useFetch'

/**
 * Avviso che dice cosa dell'archivio storico è già entrato e cosa manca.
 *
 * Esiste perché un pannello con anagrafiche importate e tutte le liste
 * dei documenti vuote è indistinguibile da un pannello rotto. Le pagine dicono
 * «nessun ordine con questi filtri», che con i filtri vuoti sposta la colpa sul
 * posto sbagliato, e lo scadenzario arriva a dire «tutti gli ordini sono
 * saldati» — una rassicurazione su uno stato che non esiste.
 *
 * Compare **solo** con i dati importati e **solo** finché l'import è parziale:
 * quando anche i documenti sono dentro, sparisce da sé senza che nessuno debba
 * ricordarsi di togliere il banner.
 */
export default function AvvisoImport() {
  const { dati: stato } = useFetch(() => api.statoDati(), [])
  const { dati: db } = useFetch(() => api.esporta(), [stato])

  if (stato?.origine !== 'import' || !db) return null

  const d = db as {
    preventivi: unknown[]
    ordini: unknown[]
    ddt: unknown[]
    acquisti: unknown[]
    pagamenti: unknown[]
    lotti: unknown[]
    movimenti: unknown[]
    fatture: unknown[]
    fatture_acquisto: unknown[]
    scadenze: unknown[]
  }

  const mancanti: string[] = []
  if (!d.preventivi.length && !d.ordini.length && !d.ddt.length) {
    mancanti.push('preventivi, ordini e DDT')
  }
  if (!d.fatture.length) mancanti.push('fatture di vendita')
  if (!d.fatture_acquisto.length) mancanti.push('registro acquisti')
  if (!d.pagamenti.length && !d.scadenze.length) mancanti.push('incassi e scadenze')
  if (!d.lotti.length && !d.movimenti.length) mancanti.push('partite e movimenti di magazzino')

  if (!mancanti.length) return null

  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-line bg-surface-alt px-4 py-3">
      <Info size={18} className="mt-0.5 shrink-0 text-ink-mute" />
      <div className="text-sm leading-relaxed">
        <p className="font-semibold text-ink">L’archivio demo è parziale</p>
        <p className="mt-1 text-ink-soft">
          Nel file demo caricato non sono presenti{' '}
          <span className="font-semibold">{mancanti.join(', ')}</span>: le liste corrispondenti
          risultano vuote perché i dati non ci sono ancora, non perché manchi qualcosa nell’archivio
          demo di partenza.
        </p>
      </div>
    </div>
  )
}
