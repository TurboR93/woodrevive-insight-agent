/**
 * La busta in cui viaggia un DB importato.
 *
 * È il formato di scambio fra lo script di import (`scripts/import-easyfatt/`) e
 * il pannello: lo script produce un JSON di questa forma, l'utente lo carica da
 * Impostazioni. Sta in `src/` e non fra gli script perché lo devono conoscere
 * entrambi, e se le due definizioni divergessero il caricamento fallirebbe con
 * un errore su un campo, invece che alla compilazione.
 *
 * `origine` non è decorativa. Con `'seed'` un cambio di `SEED_VERSION` rigenera i
 * dati dimostrativi, che è il comportamento giusto; con `'import'` gli stessi
 * dati sono l'archivio dell'azienda, e rigenerarli vorrebbe dire cancellarlo.
 * Vedi la regola in `db.ts`.
 */

import type { Db } from './db'

export interface Busta {
  /** `SEED_VERSION` con cui il contenuto è stato prodotto. */
  versione: number
  origine: 'seed' | 'import'
  /** Quando è stato generato, epoch ms. */
  generato_il: number
  /** Da dove viene: cartella e conteggi, per poterlo dire all'utente. */
  sorgente: string | null
  db: Db
}

/**
 * Controlla che un JSON qualunque sia una busta utilizzabile, e dice cos'ha di
 * sbagliato se non lo è. Un file caricato a mano può essere qualsiasi cosa:
 * meglio un messaggio che una schermata bianca.
 */
export function verificaBusta(grezzo: unknown): { busta: Busta } | { errore: string } {
  if (typeof grezzo !== 'object' || grezzo === null) {
    return { errore: 'Il file non contiene un oggetto JSON.' }
  }
  const b = grezzo as Partial<Busta>

  if (typeof b.versione !== 'number') {
    return { errore: 'Manca il numero di versione: non sembra un file prodotto dall’import.' }
  }
  if (b.origine !== 'seed' && b.origine !== 'import') {
    return { errore: 'Manca l’origine dei dati (attesa «seed» o «import»).' }
  }
  if (typeof b.db !== 'object' || b.db === null) {
    return { errore: 'Manca il contenuto: nel file non c’è nessun database.' }
  }

  const collezioni = [
    'clienti',
    'fornitori',
    'articoli',
    'lotti',
    'movimenti',
    'preventivi',
    'ordini',
    'ddt',
    'acquisti',
    'pagamenti',
    'fatture',
    'fatture_acquisto',
    'scadenze',
    'schede_lavorazione',
  ] as const

  const db = b.db as unknown as Record<string, unknown>
  const mancanti = collezioni.filter((c) => !Array.isArray(db[c]))
  if (mancanti.length) {
    return { errore: `Nel file mancano queste collezioni: ${mancanti.join(', ')}.` }
  }

  return { busta: b as Busta }
}

/** Quante righe per collezione: si mostra all'utente prima e dopo il caricamento. */
export function conteggi(db: Db): Array<{ nome: string; n: number }> {
  return [
    { nome: 'Clienti', n: db.clienti.length },
    { nome: 'Fornitori', n: db.fornitori.length },
    { nome: 'Articoli', n: db.articoli.length },
    { nome: 'Partite', n: db.lotti.length },
    { nome: 'Movimenti', n: db.movimenti.length },
    { nome: 'Preventivi', n: db.preventivi.length },
    { nome: 'Ordini', n: db.ordini.length },
    { nome: 'DDT', n: db.ddt.length },
    { nome: 'Acquisti', n: db.acquisti.length },
    { nome: 'Incassi', n: db.pagamenti.length },
    { nome: 'Fatture', n: db.fatture.length },
    { nome: 'Reg. acquisti', n: db.fatture_acquisto.length },
    { nome: 'Scadenze', n: db.scadenze.length },
    { nome: 'Schede lavorazione', n: db.schede_lavorazione.length },
  ]
}
