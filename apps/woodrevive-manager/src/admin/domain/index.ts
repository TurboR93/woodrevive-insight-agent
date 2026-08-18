/**
 * Punto unico di importazione del dominio.
 *
 *   import { type Lotto, STATO_LOTTO_LABEL, disponibile } from '../domain'
 *
 * `domain/` contiene tipi, stati e calcoli puri. Non importa mai da
 * `components/`, da `mock/` né da `api.ts`: è il pezzo che sopravvivrà intatto
 * al passaggio al database e sarà la specifica del backend.
 */

export * from './comuni'
export * from './fiscale'
export * from './anagrafiche'
export * from './magazzino'
export * from './documenti'
export * from './fatture'
export * from './incassi'
export * from './stati'
