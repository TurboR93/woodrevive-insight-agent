import { useEffect } from 'react'

/**
 * Un annuncio solo: «i dati sono cambiati, chi li sta mostrando li rilegga».
 *
 * Serve alle azioni rapide, che si possono lanciare da qualunque pagina: se si
 * registra un incasso dalla topbar mentre si è sullo scadenzario, la lista
 * sotto deve aggiornarsi da sola — altrimenti mostra un residuo che non è più
 * vero, che è peggio che non mostrare niente.
 *
 * Non è uno store: è un campanello. Chi ha un `useFetch` chiama la sua
 * `ricarica` e basta.
 *
 *   const incassi = useFetch(() => api.listaPagamenti(), [])
 *   useDatiCambiati(incassi.ricarica)
 */

const EVENTO = 'wr:dati-cambiati'

/** Da chiamare dopo una scrittura andata a buon fine. */
export function notificaDatiCambiati(): void {
  window.dispatchEvent(new CustomEvent(EVENTO))
}

/** Richiama `ricarica` a ogni annuncio, finché il componente è montato. */
export function useDatiCambiati(ricarica: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENTO, ricarica)
    return () => window.removeEventListener(EVENTO, ricarica)
  }, [ricarica])
}
