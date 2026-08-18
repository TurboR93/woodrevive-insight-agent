/**
 * Compressione del database prima di metterlo in `localStorage`.
 *
 * ## Perché esiste
 *
 * `localStorage` ha un tetto ridotto e fallisce quando l'archivio cresce. La
 * compressione evita che campi ripetuti e righe descrittive consumino spazio
 * inutilmente durante il prototipo.
 *
 * ## È codice da buttare, e va bene
 *
 * Con Postgres su Supabase questo file **non serve più**: si cancella in un
 * commit. Esiste perché serve *ora*, per prototipare sull'archivio intero senza
 * IndexedDB — che sarebbe una riscrittura più grande e altrettanto temporanea.
 * Vedi docs/roadmap-db.md §10.
 *
 * ## Il prezzo: la scrittura diventa asincrona
 *
 * `CompressionStream` esiste in tutti i browser correnti ma è asincrona, e
 * `salva()` è sincrona con una sessantina di chiamanti. La soluzione non è
 * rendere asincrone sessanta firme: è **leggere una volta all'avvio** (dove
 * l'asincronia c'è già) e **scrivere in differita** (vedi `salva()` in `db.ts`).
 */

const CODIFICA = 'gzip' as const
/** Prefisso che distingue un payload compresso da un JSON in chiaro. */
const MARCA = 'gz1:'

/** Vero se il browser sa comprimere. Senza, si scrive in chiaro e si spera. */
export function compressioneDisponibile(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'
}

async function attraverso(dati: Uint8Array, stream: TransformStream): Promise<Uint8Array> {
  const risposta = new Response(new Blob([dati as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await risposta.arrayBuffer())
}

/**
 * Da byte a stringa base64.
 *
 * Non si passa per `String.fromCharCode(...bytes)` con lo spread: su 400 KB
 * significa 400.000 argomenti in una chiamata, e il motore JS solleva
 * `RangeError: Maximum call stack size exceeded`. A blocchi non succede.
 */
function aBase64(byte: Uint8Array): string {
  const BLOCCO = 0x8000
  let grezzo = ''
  for (let i = 0; i < byte.length; i += BLOCCO) {
    grezzo += String.fromCharCode(...byte.subarray(i, i + BLOCCO))
  }
  return btoa(grezzo)
}

function daBase64(testo: string): Uint8Array {
  const grezzo = atob(testo)
  const byte = new Uint8Array(grezzo.length)
  for (let i = 0; i < grezzo.length; i += 1) byte[i] = grezzo.charCodeAt(i)
  return byte
}

/** Il testo pronto da mettere in `localStorage`. In chiaro se non si può comprimere. */
export async function comprimi(testo: string): Promise<string> {
  if (!compressioneDisponibile()) return testo
  const byte = new TextEncoder().encode(testo)
  const compresso = await attraverso(byte, new CompressionStream(CODIFICA))
  const codificato = MARCA + aBase64(compresso)
  // Se per qualche ragione comprimere non conviene, si tiene l'originale: non
  // esiste un caso in cui valga la pena scrivere di più.
  return codificato.length < testo.length ? codificato : testo
}

/**
 * L'inverso. Accetta anche un payload **non** compresso, perché i dati salvati
 * prima di questo file sono in chiaro e non vanno persi al primo avvio.
 */
export async function decomprimi(salvato: string): Promise<string> {
  if (!salvato.startsWith(MARCA)) return salvato
  const byte = daBase64(salvato.slice(MARCA.length))
  const disteso = await attraverso(byte, new DecompressionStream(CODIFICA))
  return new TextDecoder().decode(disteso)
}
