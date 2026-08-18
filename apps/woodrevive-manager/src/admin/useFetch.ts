import { useCallback, useEffect, useRef, useState } from 'react'

import { ErroreApi } from './domain'

/**
 * Carica dati da `api.*` con stato di caricamento, errore e ricarica.
 *
 * Il contatore `richiesta` scarta le risposte obsolete: in sviluppo StrictMode
 * monta i componenti due volte, e digitando in un campo di ricerca partono più
 * chiamate che possono tornare fuori ordine. Senza questo, la lista mostra i
 * risultati della penultima ricerca.
 */
export function useFetch<T>(
  carica: () => Promise<T>,
  dipendenze: unknown[],
): { dati: T | null; caricamento: boolean; errore: string | null; ricarica: () => void } {
  const [dati, setDati] = useState<T | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const richiesta = useRef(0)

  useEffect(() => {
    const mia = ++richiesta.current
    setCaricamento(true)
    setErrore(null)

    carica()
      .then((r) => {
        if (mia !== richiesta.current) return
        setDati(r)
      })
      .catch((e) => {
        if (mia !== richiesta.current) return
        setErrore(messaggioDi(e))
      })
      .finally(() => {
        if (mia !== richiesta.current) return
        setCaricamento(false)
      })
    // `carica` è una closure nuova a ogni render: le dipendenze sono quelle dichiarate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dipendenze, tick])

  const ricarica = useCallback(() => setTick((t) => t + 1), [])

  return { dati, caricamento, errore, ricarica }
}

/** Messaggio leggibile da qualunque errore. */
export function messaggioDi(e: unknown): string {
  if (e instanceof ErroreApi) return e.message
  if (e instanceof Error) return e.message
  return 'Si è verificato un errore imprevisto.'
}

/** Codice HTTP dell'errore, se è un errore d'API. */
export function codiceDi(e: unknown): number | null {
  return e instanceof ErroreApi ? e.status : null
}
