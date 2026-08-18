/**
 * Fatture — di vendita e di acquisto.
 *
 * Sono entità distinte da ordini e DDT e permettono di rappresentare fatture,
 * acconti, note di credito e relative registrazioni contabili.
 *
 * ## Perché una sola entità per fattura, acconto e nota di credito
 *
 * Hanno la stessa forma — righe vendibili, un cliente, un riepilogo IVA, i
 * riferimenti elettronici — e differiscono per serie e per verso. Il verso **non
 * si mette negli importi**: si mette nel tipo, e lo legge `segnoFattura()`.
 * È lo stesso schema di `quantitaConSegno()` per i movimenti di magazzino, e
 * mantiene i totali confrontabili con le fonti che memorizzano anche le note di
 * credito in positivo.
 *
 * Fatture e acconti possono condividere la serie annuale, mentre le note di
 * credito hanno una serie propria.
 *
 * ## Perché la fattura d'acquisto NON è un ordine di acquisto
 *
 * `OrdineAcquisto` è una promessa che poi genera una partita di merce. Una
 * fattura d'acquisto può invece contenere costi generali e conti contabili:
 * forzarla in un ordine produrrebbe movimenti di magazzino inesistenti.
 */

import type { ID, Importabile, TipoRigaDocumento, Tracciabile } from './comuni'
import type { IntestazioneDocumento } from './documenti'
import type { VoceIva } from '../lib/money'

// ===========================================================================
// FATTURA DI VENDITA
// ===========================================================================

export type TipoFattura = 'fattura' | 'acconto' | 'nota_credito'

export const TIPO_FATTURA_LABEL: Record<TipoFattura, string> = {
  fattura: 'Fattura',
  acconto: 'Fattura d’acconto',
  nota_credito: 'Nota di credito',
}

/**
 * Il verso del documento. La nota di credito storna, quindi vale −1.
 *
 * Gli importi restano **positivi** in tutti i casi: è chi somma che applica il
 * segno. Cosí `totale_cents` è confrontabile con il `TotDoc` del vecchio
 * gestionale senza conversioni, e non esiste il dubbio «questo numero è già
 * firmato o no».
 */
export function segnoFattura(f: { tipo: TipoFattura }): 1 | -1 {
  return f.tipo === 'nota_credito' ? -1 : 1
}

/**
 * Lo stato di una fattura, che è anche il suo stato allo SDI.
 *
 * Una fattura scartata dal Sistema di Interscambio è un fatto operativo e deve
 * restare distinta da una semplice bozza.
 */
export type StatoFattura =
  | 'bozza'
  | 'emessa'
  | 'inviata_sdi'
  | 'accettata_sdi'
  | 'scartata_sdi'
  | 'annullata'

export const STATO_FATTURA_LABEL: Record<StatoFattura, string> = {
  bozza: 'Bozza',
  emessa: 'Emessa',
  inviata_sdi: 'Inviata allo SDI',
  accettata_sdi: 'Consegnata',
  scartata_sdi: 'Scartata dallo SDI',
  annullata: 'Annullata',
}

/** Riferimento a un documento esterno, per il tracciato elettronico. */
export interface RiferimentoFe {
  tipo_documento: string | null
  numero: string | null
  data: string | null
  cig: string | null
  cup: string | null
  commessa: string | null
}

/**
 * Una riga di fattura.
 *
 * `articolo_id` è nullable perché le righe possono essere testo libero,
 * riferimenti o descrizioni commerciali senza un articolo di catalogo.
 */
export interface RigaFattura {
  id: ID
  /** Cosa fa questa riga nel documento. Vedi `TipoRigaDocumento` in `comuni.ts`. */
  tipo: TipoRigaDocumento
  articolo_id: ID | null
  codice_articolo: string | null
  descrizione: string
  /** Zero su una riga descrittiva: non è una quantità, è l'assenza di quantità. */
  quantita_milli: number
  /** Null dove il documento non dichiara un'unità di misura. */
  unita_misura: string | null
  prezzo_unitario_cents: number
  sconto_percentuale: number
  aliquota_iva: number
  /** Codice IVA: vedi `domain/fiscale.ts`. Null sulle righe senza importo. */
  codice_iva: string | null
  /**
   * Sui documenti importati è persistito e non ricalcolato: il totale fiscale
   * scritto sul documento prevale su una ricostruzione successiva.
   */
  imponibile_cents: number
  /** Conto del piano dei conti, quando il documento lo dichiara. */
  conto: string | null
  /** Percentuale di provvigione dell'agente su questa riga. */
  provvigione_percentuale: number
  note: string | null
}

export interface Fattura extends Tracciabile, Importabile {
  tipo: TipoFattura
  /** Numerazione nostra: `FTV-2026-0001`, `NCV-2026-0001`. */
  numero: string
  /**
   * Il numero come lo conosce il cliente e il commercialista: `2023001`, `2141`.
   * ⚠️ Va conservato e va **cercabile**: chi apre il gestionale cerca `2023001`,
   * non `FTV-2023-0001`.
   */
  numero_esterno: string | null
  /** La serie del vecchio gestionale: `/2023`. */
  serie_esterna: string | null

  data: string
  cliente_id: ID
  /** L'anagrafica congelata al giorno del documento. Vedi `IntestazioneDocumento`. */
  intestazione: IntestazioneDocumento

  righe: RigaFattura[]
  sconto_generale_percentuale: number

  imponibile_cents: number
  iva_cents: number
  /** Il totale del documento. Positivo anche sulle note di credito: vedi `segnoFattura`. */
  totale_cents: number

  /**
   * Il castelletto IVA, **persistito e non ricalcolato**.
   *
   * ⚠️ Deviazione consapevole dalla regola 7 del progetto («i derivati non si
   * scrivono»). Il castelletto di una fattura emessa nel 2022 e trasmessa
   * all'Agenzia è un fatto fiscale, non un calcolo che si può rifare: se domani
   * cambiamo una formula di arrotondamento, quel documento deve restare quello
   * che è stato trasmesso. In fase di import si verifica contro `totaliDocumento`
   * e poi si congela.
   */
  riepilogo_iva: VoceIva[]

  // --- oltre l'IVA ---------------------------------------------------------
  /** Ritenuta d'acconto, quando prevista dal documento. */
  ritenuta_percentuale: number | null
  ritenuta_cents: number
  ritenuta_anno_competenza: number | null
  /** Bollo in fattura, quando previsto. */
  bollo_cents: number
  reverse_charge: boolean
  iva_non_dovuta_cents: number
  /**
   * Quanto si incassa davvero, al netto di ritenuta e IVA non dovuta.
   *
   * ⚠️ **È questo il numero con cui quadra la prima nota**, non `totale_cents`.
   * Usare il totale lordo produrrebbe falsi disallineamenti in presenza di
   * ritenuta o reverse charge.
   */
  netto_a_pagare_cents: number

  // --- fatturazione elettronica -------------------------------------------
  fe_tipo_documento: string | null // 'TD01' | 'TD17' | 'TD18'
  fe_riferimenti: RiferimentoFe[]
  fe_id_sdi: string | null

  // --- catena documentale --------------------------------------------------
  ordine_id: ID | null
  /** I DDT che questa fattura raggruppa. */
  ddt_ids: ID[]
  /** La fattura che questa nota di credito storna. */
  fattura_origine_id: ID | null
  /** Il documento da cui nasce una fattura d'acconto. */
  acconto_origine_id: ID | null

  // --- agente --------------------------------------------------------------
  agente_id: ID | null
  agente_nome: string | null
  provvigione_imponibile_cents: number
  provvigione_cents: number
  data_liquidazione_provvigione: string | null

  stato: StatoFattura
  note: string | null
}

export type FatturaInput = Omit<
  Fattura,
  | keyof Tracciabile
  | keyof Importabile
  | 'numero'
  | 'imponibile_cents'
  | 'iva_cents'
  | 'totale_cents'
  | 'riepilogo_iva'
  | 'netto_a_pagare_cents'
> & { numero?: string }

// ===========================================================================
// FATTURA DI ACQUISTO — il registro degli acquisti
// ===========================================================================

/**
 * I due registri IVA degli acquisti.
 *
 * È un campo, non un suffisso di stringa, così il vincolo di unicità
 * `(registro, anno, protocollo)` è esprimibile direttamente.
 */
export type RegistroAcquisti = 'acquisti' | 'reverse_charge'

export const REGISTRO_ACQUISTI_LABEL: Record<RegistroAcquisti, string> = {
  acquisti: 'Registro acquisti',
  reverse_charge: 'Registro reverse charge',
}

/**
 * Una riga di registrazione d'acquisto: un importo su un conto di costo.
 *
 * Non ha quantità né prezzo unitario perché è una scrittura contabile. Darle la
 * forma di una riga merce inventerebbe quantità per costi che non sono stock.
 */
export interface RigaFatturaAcquisto {
  id: ID
  /** Dal piano dei conti: `Merci c/acquisti`, `Canone affitto`, `Utenze…`. */
  conto: string
  descrizione: string | null
  importo_cents: number
  codice_iva: string | null
  aliquota_iva: number
  /**
   * L'articolo, quando la riga è merce identificabile; altrimenti null.
   */
  articolo_id: ID | null
}

export interface FatturaAcquisto extends Tracciabile, Importabile {
  tipo: 'fattura' | 'nota_credito'
  /** Protocollo nostro, per registro: `PRA-2026-0001`. */
  protocollo: string
  registro: RegistroAcquisti
  /** Il numero del documento **del fornitore**, formato libero: `FDI/9999999`. */
  numero_fornitore: string
  /** La data sul documento del fornitore. */
  data_documento: string
  /**
   * La data in cui l'abbiamo registrato.
   * Può differire da `data_documento`: una è la data fiscale del fornitore,
   * l'altra la nostra competenza di registrazione.
   */
  data_registrazione: string

  fornitore_id: ID
  intestazione: IntestazioneDocumento

  righe: RigaFatturaAcquisto[]
  imponibile_cents: number
  iva_cents: number
  totale_cents: number
  riepilogo_iva: VoceIva[]

  ritenuta_percentuale: number | null
  ritenuta_cents: number
  ritenuta_anno_competenza: number | null
  bollo_cents: number
  reverse_charge: boolean
  iva_non_dovuta_cents: number
  netto_a_pagare_cents: number

  fe_tipo_documento: string | null
  fe_riferimenti: RiferimentoFe[]
  fe_id_sdi: string | null

  /** La fattura d'acquisto che questa nota di credito storna. */
  fattura_origine_id: ID | null
  note: string | null
}

export type FatturaAcquistoInput = Omit<
  FatturaAcquisto,
  | keyof Tracciabile
  | keyof Importabile
  | 'protocollo'
  | 'imponibile_cents'
  | 'iva_cents'
  | 'totale_cents'
  | 'riepilogo_iva'
  | 'netto_a_pagare_cents'
> & { protocollo?: string }

// ===========================================================================
// Calcoli puri
// ===========================================================================

/** Il totale con il segno del verso: le note di credito sottraggono. */
export function totaleConSegno(f: { tipo: TipoFattura; totale_cents: number }): number {
  return segnoFattura(f) * f.totale_cents
}

/**
 * Il venduto di un insieme di fatture.
 *
 * Sostituisce il conteggio dai DDT: sommare entrambe le fonti conterebbe due
 * volte la stessa merce, mentre un DDT non fatturato non è ancora ricavo.
 */
export function vendutoCents(fatture: Array<{ tipo: TipoFattura; imponibile_cents: number }>): number {
  return fatture.reduce((t, f) => t + segnoFattura(f) * f.imponibile_cents, 0)
}

/** Vero se il documento è ancora modificabile: una fattura emessa non si tocca. */
export function fatturaModificabile(f: Fattura): boolean {
  return f.stato === 'bozza'
}
