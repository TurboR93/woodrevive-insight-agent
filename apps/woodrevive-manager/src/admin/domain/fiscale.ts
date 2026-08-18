/**
 * Il livello fiscale: codici IVA e loro natura.
 *
 * Esiste perché **l'aliquota da sola non basta**. Nature fiscali diverse possono
 * condividere la stessa percentuale:
 *
 *   - nove codici hanno aliquota **0** ma nature diverse fra loro (esportazione,
 *     cessione intracomunitaria, San Marino, esente, escluso, fuori campo). In
 *     un riepilogo raggruppato per aliquota collassano in una sola voce «0%», e
 *     una fattura elettronica con quella voce viene **scartata dallo SDI**;
 *   - `22` e `22r` hanno **la stessa aliquota** ma uno è imponibile e l'altro è
 *     reverse charge: l'IVA non la versa lo stesso soggetto.
 *
 * Il riepilogo si raggruppa quindi per **codice**, non per aliquota. Il metodo di
 * arrotondamento non cambia — vedi il commento in testa a `lib/money.ts` — solo
 * la chiave del raggruppamento diventa più fine, che è anche più corretto: il
 * castelletto di una fattura elettronica è per (aliquota, natura).
 */

/**
 * La categoria dell'operazione ai fini IVA.
 *
 * Non è l'aliquota e non è il codice: è **perché** quell'operazione ha quella
 * aliquota. Due righe entrambe a zero possono essere un'esportazione e una
 * prestazione esente, e sul documento vanno scritte in modo diverso.
 */
export type NaturaIva =
  | 'imponibile'
  | 'non_imponibile'
  | 'esente'
  | 'escluso_art15'
  | 'non_soggetto'
  | 'reverse_charge_acquisto'
  | 'reverse_charge_vendita'
  | 'split_payment'
  | 'iva_non_esposta'

export const NATURA_IVA_LABEL: Record<NaturaIva, string> = {
  imponibile: 'Imponibile',
  non_imponibile: 'Non imponibile',
  esente: 'Esente',
  escluso_art15: 'Escluso art. 15',
  non_soggetto: 'Non soggetto',
  reverse_charge_acquisto: 'Reverse charge (acquisto)',
  reverse_charge_vendita: 'Reverse charge (vendita)',
  split_payment: 'Split payment',
  iva_non_esposta: 'IVA non esposta',
}

/** Dove si può usare un codice: le aliquote di acquisto non vanno in vendita. */
export type AmbitoIva = 'vendita' | 'acquisto' | 'entrambe'

export interface CodiceIva {
  codice: string
  /** Percentuale, con la convenzione del progetto: `22`, non `0.22`. */
  percentuale: number
  natura: NaturaIva
  /** Come va scritto sul documento accanto alla voce di riepilogo. */
  descrizione: string
  /**
   * Il codice «Natura» del tracciato della fattura elettronica (N1…N7).
   *
   * ⚠️ **Da far confermare al commercialista prima di emettere la prima fattura
   * elettronica.** Non è derivabile dalla classe della sorgente: dipende
   * dall'articolo di legge, che sta nella descrizione e non in un campo
   * strutturato. Un valore sbagliato non dà un errore visibile qui — dà una
   * fattura **scartata dallo SDI** giorni dopo. Per questo è `null` dove non c'è
   * una corrispondenza che si possa difendere, invece di indovinata.
   */
  natura_fe: string | null
  ambito: AmbitoIva
}

/**
 * I codici IVA supportati dal modello. Si aggiungono quando servono, uno alla
 * volta, con la loro natura verificata.
 */
export const CODICI_IVA: Record<string, CodiceIva> = {
  // --- imponibili -----------------------------------------------------------
  '22': {
    codice: '22',
    percentuale: 22,
    natura: 'imponibile',
    descrizione: 'Imponibile 22%',
    natura_fe: null, // le operazioni imponibili non portano un codice natura
    ambito: 'entrambe',
  },
  '10': {
    codice: '10',
    percentuale: 10,
    natura: 'imponibile',
    descrizione: 'Imponibile 10%',
    natura_fe: null,
    ambito: 'entrambe',
  },
  '4': {
    codice: '4',
    percentuale: 4,
    natura: 'imponibile',
    descrizione: 'Imponibile 4%',
    natura_fe: null,
    ambito: 'entrambe',
  },

  // --- non imponibili: nove codici che a occhio sono tutti «0%» -------------
  N8a: {
    codice: 'N8a',
    percentuale: 0,
    natura: 'non_imponibile',
    descrizione: 'Non imp. art. 8 c. 1 lett. a DPR 633/72',
    natura_fe: 'N3.1', // esportazioni — da confermare
    ambito: 'vendita',
  },
  N8b: {
    codice: 'N8b',
    percentuale: 0,
    natura: 'non_imponibile',
    descrizione: 'Non imp. art. 8 c. 1 lett. b DPR 633/72',
    natura_fe: 'N3.1',
    ambito: 'vendita',
  },
  N8c: {
    codice: 'N8c',
    percentuale: 0,
    natura: 'non_imponibile',
    descrizione: 'Non imp. art. 8 c. 1 lett. c DPR 633/72',
    natura_fe: 'N3.5', // dichiarazione d'intento — da confermare
    ambito: 'vendita',
  },
  N41: {
    codice: 'N41',
    percentuale: 0,
    natura: 'non_imponibile',
    descrizione: 'Non imp. art. 41 D.L. 331/93',
    natura_fe: 'N3.2', // cessioni intracomunitarie — da confermare
    ambito: 'vendita',
  },
  N9: {
    codice: 'N9',
    percentuale: 0,
    natura: 'non_imponibile',
    descrizione: 'Non imp. art. 9 DPR 633/72',
    natura_fe: 'N3.4', // servizi internazionali — da confermare
    ambito: 'vendita',
  },
  N71: {
    codice: 'N71',
    percentuale: 0,
    natura: 'non_imponibile',
    descrizione: 'Non imp. art. 71 DPR 633/72 — San Marino',
    natura_fe: 'N3.3', // operazioni con San Marino — da confermare
    ambito: 'vendita',
  },
  E10: {
    codice: 'E10',
    percentuale: 0,
    natura: 'esente',
    descrizione: 'Esente art. 10 DPR 633/72',
    natura_fe: 'N4',
    ambito: 'vendita',
  },
  X15: {
    codice: 'X15',
    percentuale: 0,
    natura: 'escluso_art15',
    descrizione: 'Escluso art. 15 DPR 633/72',
    // Codice usato per bolli esclusi dall'imponibile IVA.
    natura_fe: 'N1',
    ambito: 'entrambe',
  },
  FC: {
    codice: 'FC',
    percentuale: 0,
    natura: 'non_soggetto',
    descrizione: 'Fuori campo IVA',
    natura_fe: 'N2.2',
    ambito: 'entrambe',
  },

  // --- reverse charge: stessa aliquota, IVA versata da un altro soggetto ----
  '22r': {
    codice: '22r',
    percentuale: 22,
    natura: 'reverse_charge_acquisto',
    descrizione: 'Imp. 22% acquisti reverse charge art. 17',
    // Sull'integrazione di un acquisto la natura la porta il documento del
    // fornitore, non la nostra riga: qui non se ne dichiara una.
    natura_fe: null,
    ambito: 'acquisto',
  },
  R17t: {
    codice: 'R17t',
    percentuale: 0,
    natura: 'reverse_charge_vendita',
    descrizione: 'Rev. charge art. 17 c. 6 lett. a-ter DPR 633/72',
    natura_fe: 'N6.7', // prestazioni su edifici — da confermare
    ambito: 'vendita',
  },
}

/** Il codice, se lo conosciamo. `undefined` è una risposta: non si inventa. */
export function codiceIva(codice: string | null | undefined): CodiceIva | undefined {
  if (!codice) return undefined
  return CODICI_IVA[codice.trim()]
}

/**
 * Vero se l'operazione concorre all'IVA da versare.
 *
 * Il reverse charge di **acquisto** ha aliquota 22 ma l'IVA la si autoliquida:
 * sommarla al debito come se fosse un acquisto ordinario sarebbe un errore
 * contabile, ed è il motivo per cui questa funzione esiste invece di guardare
 * `percentuale > 0`.
 */
export function concorreAllIva(c: CodiceIva): boolean {
  return c.natura === 'imponibile'
}

/**
 * Come si scrive la voce di riepilogo su un documento stampato.
 *
 * Per un'operazione imponibile è l'aliquota; per tutte le altre è il riferimento
 * normativo — «IVA 0%» su un'esportazione non è solo brutto, è una fattura
 * irregolare, perché il motivo dell'esenzione va indicato.
 */
export function etichettaRiepilogo(c: CodiceIva): string {
  return c.natura === 'imponibile' ? `IVA ${c.percentuale}%` : c.descrizione
}

/**
 * L'etichetta della voce di riepilogo su un documento stampato, partendo da
 * quello che il riepilogo di `lib/money.ts` mette a disposizione.
 *
 * Serve perché `lib/` non conosce il dominio e non può risolvere un codice: la
 * voce porta il codice come stringa, e la traduzione in linguaggio fiscale
 * avviene qui. Se il codice non è in tabella si ripiega sull'aliquota, che è il
 * comportamento di prima e non è mai sbagliato — solo meno informativo.
 */
export function etichettaVoceRiepilogo(voce: {
  codice: string
  aliquota: number
}): string {
  const c = codiceIva(voce.codice)
  if (c) return etichettaRiepilogo(c)
  return `IVA ${voce.aliquota}%`
}

/**
 * I codici che non abbiamo in tabella ma che i dati storici citano.
 * Vuoto significa che la tabella copre tutto il sorgente.
 */
export function codiciSconosciuti(codici: Iterable<string>): string[] {
  const fuori = new Set<string>()
  for (const c of codici) {
    const t = c.trim()
    if (t && !CODICI_IVA[t]) fuori.add(t)
  }
  return [...fuori].sort()
}
