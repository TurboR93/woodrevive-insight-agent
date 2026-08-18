/**
 * Il contratto dati del pannello.
 *
 * Le pagine chiamano `api.*` e non sanno da dove arrivano i dati. Oggi c'è
 * `mockApi`, che tiene tutto in un DB in memoria persistito nel browser;
 * domani ci sarà `restApi`, che parla con un backend vero.
 *
 * **Il giorno del passaggio non si tocca nessuna pagina**: si scrive `restApi`
 * con le stesse firme e si cambia la riga in fondo a questo file. È la ragione
 * per cui il layer esiste.
 *
 * Gli errori sono `ErroreApi` con lo stesso codice HTTP che userà il server
 * (400 validazione, 404 non trovato, 409 conflitto/guardia): la UI li gestisce
 * già oggi come li gestirà domani.
 */

import { mockApi } from './mock/mockApi'

export type Api = typeof mockApi
export type { Riepilogo, RisultatoRicerca, VoceGiacenzaLotto } from './mock/mockApi'

/**
 * Modalità dati. Quando arriverà il backend:
 *   export const api: Api = MODALITA === 'rest' ? restApi : mockApi
 */
export const MODALITA_DATI: 'mock' | 'rest' = 'mock'

export const api: Api = mockApi
