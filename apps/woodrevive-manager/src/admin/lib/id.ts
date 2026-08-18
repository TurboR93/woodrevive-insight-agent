/** Identificativi e numerazione dei documenti. */

/** UUID per le chiavi primarie. In produzione li genererà il database. */
export function nuovoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Prossimo numero di documento: PRV-2026-0007.
 *
 * ⚠️ Numerazione **client-side**: scandisce i numeri esistenti e prende il
 * massimo. Va bene con un solo utente e un DB nel browser. Con più utenti e un
 * backend vero è race-prone — due preventivi creati nello stesso istante
 * riceverebbero lo stesso numero — e va rifatta server-side con una sequenza
 * transazionale per (prefisso, anno). Vedi docs/roadmap-db.md §4.
 */
export function prossimoNumero(
  prefisso: string,
  numeriEsistenti: string[],
  anno = new Date().getFullYear(),
  cifre = 4,
): string {
  const testa = `${prefisso}-${anno}-`
  let massimo = 0
  for (const n of numeriEsistenti) {
    if (!n?.startsWith(testa)) continue
    const trovato = n.slice(testa.length).match(/^(\d+)/)
    if (trovato) massimo = Math.max(massimo, parseInt(trovato[1], 10))
  }
  return `${testa}${String(massimo + 1).padStart(cifre, '0')}`
}

/** Codice progressivo senza anno, per le anagrafiche: CLI-0001, ART-0042. */
export function prossimoCodice(prefisso: string, codiciEsistenti: string[], cifre = 4): string {
  const testa = `${prefisso}-`
  let massimo = 0
  for (const c of codiciEsistenti) {
    if (!c?.startsWith(testa)) continue
    const trovato = c.slice(testa.length).match(/^(\d+)/)
    if (trovato) massimo = Math.max(massimo, parseInt(trovato[1], 10))
  }
  return `${testa}${String(massimo + 1).padStart(cifre, '0')}`
}

/** Slug per URL e nomi file: "Fienile Cordignano" → "fienile-cordignano". */
export function slug(testo: string): string {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
