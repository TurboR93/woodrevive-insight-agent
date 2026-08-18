import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { QuoteArtifact, QuoteLineArtifact, RecentQuotesArtifact, RecentQuoteSummary } from "../contracts/chat.js";
import { numberValue, nullable, readCsv, type CsvRow } from "./csv.js";

const projectRoot = resolve(import.meta.dirname, "../../..");
const datasetsRoot = resolve(projectRoot, "datasets/demo");
const defaultQuoteStorePath = resolve(projectRoot, "runtime/demo-quote-drafts.json");

function quoteStorePath(): string {
  return process.env.WOODREVIVE_QUOTE_STORE_PATH || defaultQuoteStorePath;
}

export interface QuoteDraftInput {
  customer_id: string;
  subject: string;
  lines: Array<{ article_id: string; quantity_milli: number; discount_percent?: number }>;
  general_discount_percent?: number;
  validity_days?: number;
  conditions?: string;
  delivery_time?: string;
  notes?: string;
}

export interface QuoteAuditContext {
  conversationId?: string;
  actor?: { id: string; displayName: string; source: "demo-local" };
}

export interface StoredQuote extends QuoteArtifact {
  createdAt: number;
  updatedAt: number;
  notes: string | null;
  managerRecord: Record<string, unknown>;
  audit: {
    conversationId: string | null;
    actorId: string;
    actorName: string;
    source: "demo-local";
  };
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadCatalog(): Promise<{ customers: CsvRow[]; articles: CsvRow[]; movements: CsvRow[] }> {
  const [customers, articles, movements] = await Promise.all([
    readCsv(resolve(datasetsRoot, "clienti.csv")),
    readCsv(resolve(datasetsRoot, "articoli.csv")),
    readCsv(resolve(datasetsRoot, "movimenti_magazzino.csv")),
  ]);
  return { customers, articles, movements };
}

function weightedCostByArticle(movements: CsvRow[]): Map<string, number> {
  const result = new Map<string, number>();
  const grouped = new Map<string, CsvRow[]>();
  for (const movement of movements) {
    if (!movement.articolo_id) continue;
    const rows = grouped.get(movement.articolo_id) || [];
    rows.push(movement);
    grouped.set(movement.articolo_id, rows);
  }
  for (const [articleId, rows] of grouped) {
    let stockMilli = 0;
    let costCents = 0;
    rows.sort((a, b) => a.data === b.data
      ? numberValue(a.created_at) - numberValue(b.created_at)
      : a.data.localeCompare(b.data));
    for (const movement of rows) {
      const quantity = numberValue(movement.quantita_milli);
      const delta = movement.tipo === "carico" ? quantity : movement.tipo === "scarico" ? -quantity : quantity;
      if (delta > 0) {
        const newStock = stockMilli + delta;
        costCents = newStock > 0
          ? Math.round((stockMilli * costCents + delta * numberValue(movement.valore_unitario_cents)) / newStock)
          : numberValue(movement.valore_unitario_cents);
      }
      stockMilli += delta;
    }
    result.set(articleId, costCents);
  }
  return result;
}

export async function searchQuoteCatalog(input: {
  customer_query?: string;
  article_query?: string;
}): Promise<Record<string, unknown>> {
  const { customers, articles } = await loadCatalog();
  const customerQuery = normalize(input.customer_query || "");
  const articleQuery = normalize(input.article_query || "");
  const customerMatches = customers.filter((customer) => !customerQuery || normalize([
    customer.id, customer.codice, customer.ragione_sociale, customer.citta,
  ].join(" ")).includes(customerQuery)).slice(0, 8).map((customer) => ({
    id: customer.id,
    code: customer.codice,
    name: customer.ragione_sociale,
    city: customer.citta,
    channel: customer.canale,
    default_discount_percent: numberValue(customer.sconto_default_percentuale),
    default_vat_rate: numberValue(customer.aliquota_iva_default, 22),
  }));
  const articleMatches = articles.filter((article) => !articleQuery || normalize([
    article.id, article.codice, article.nome, article.categoria, article.essenza, article.patina,
  ].join(" ")).includes(articleQuery)).slice(0, 12).map((article) => ({
    id: article.id,
    code: article.codice,
    name: article.nome,
    category: article.categoria,
    unit: article.unita_misura,
    unit_price_cents: numberValue(article.prezzo_listino_cents),
    vat_rate: numberValue(article.aliquota_iva, 22),
    available_milli: numberValue(article.giacenza_milli) - numberValue(article.impegnato_milli),
  }));
  return { customers: customerMatches, articles: articleMatches };
}

async function readStoredQuotes(): Promise<StoredQuote[]> {
  try {
    const content = JSON.parse(await readFile(quoteStorePath(), "utf8")) as unknown;
    return Array.isArray(content) ? content as StoredQuote[] : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeStoredQuotes(quotes: StoredQuote[]): Promise<void> {
  const path = quoteStorePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(quotes, null, 2)}\n`, "utf8");
}

function calculateTotals(lines: QuoteLineArtifact[], generalDiscountPercent: number) {
  const gross = lines.reduce((sum, line) => sum + line.taxableCents, 0);
  const totalDiscount = Math.round(gross * generalDiscountPercent / 100);
  const discounted = lines.map((line) => line.taxableCents);
  if (gross > 0 && totalDiscount > 0) {
    let allocated = 0;
    lines.forEach((line, index) => {
      const share = Math.round(totalDiscount * line.taxableCents / gross);
      discounted[index] -= share;
      allocated += share;
    });
    const remainder = totalDiscount - allocated;
    if (remainder && lines.length) {
      const largest = lines.reduce((best, line, index) => line.taxableCents > lines[best].taxableCents ? index : best, 0);
      discounted[largest] -= remainder;
    }
  }
  const vatGroups = new Map<number, number>();
  lines.forEach((line, index) => vatGroups.set(line.vatRate, (vatGroups.get(line.vatRate) || 0) + discounted[index]));
  const taxableCents = gross - totalDiscount;
  const vatCents = [...vatGroups.entries()].reduce((sum, [rate, taxable]) => sum + Math.round(taxable * rate / 100), 0);
  return { taxableCents, vatCents, totalCents: taxableCents + vatCents };
}

export async function createQuoteDraft(input: QuoteDraftInput, context: QuoteAuditContext = {}): Promise<{ quote: StoredQuote; warnings: string[] }> {
  const { customers, articles, movements } = await loadCatalog();
  const customer = customers.find((item) => item.id === input.customer_id);
  if (!customer) throw new Error(`Cliente demo non trovato: ${input.customer_id}.`);
  if (!input.lines.length) throw new Error("Il preventivo deve contenere almeno una riga.");
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const weightedCosts = weightedCostByArticle(movements);
  const warnings: string[] = [];
  const lines: QuoteLineArtifact[] = input.lines.map((requested, index) => {
    const article = articleById.get(requested.article_id);
    if (!article) throw new Error(`Articolo demo non trovato: ${requested.article_id}.`);
    const quantityMilli = Math.round(requested.quantity_milli);
    if (quantityMilli <= 0) throw new Error(`La quantità della riga ${index + 1} deve essere positiva.`);
    const discountPercent = Math.max(0, Math.min(40, requested.discount_percent || 0));
    const unitPriceCents = numberValue(article.prezzo_listino_cents);
    const availableMilli = numberValue(article.giacenza_milli) - numberValue(article.impegnato_milli);
    if (quantityMilli > availableMilli) warnings.push(`${article.nome}: quantità richiesta superiore alla disponibilità commerciale demo.`);
    if (discountPercent > 8) warnings.push(`${article.nome}: sconto riga oltre l’8%, richiesta approvazione commerciale.`);
    const gross = Math.round(quantityMilli * unitPriceCents / 1000);
    return {
      id: `riga-${index + 1}`,
      articleId: article.id,
      code: article.codice,
      description: article.nome,
      quantityMilli,
      unit: article.unita_misura,
      unitPriceCents,
      discountPercent,
      taxableCents: Math.round(gross * (1 - discountPercent / 100)),
      vatRate: numberValue(article.aliquota_iva, numberValue(customer.aliquota_iva_default, 22)),
      availableMilli,
    };
  });
  const generalDiscountPercent = Math.max(0, Math.min(40,
    input.general_discount_percent ?? numberValue(customer.sconto_default_percentuale),
  ));
  if (generalDiscountPercent > 8) warnings.push("Sconto generale oltre l’8%, richiesta approvazione commerciale.");
  const totals = calculateTotals(lines, generalDiscountPercent);
  const costCents = lines.reduce((sum, line) => {
    const article = articleById.get(line.articleId)!;
    const cost = weightedCosts.get(article.id)
      || numberValue(article.costo_medio_cents, numberValue(article.prezzo_acquisto_cents));
    return sum + Math.round(line.quantityMilli * cost / 1000);
  }, 0);
  const saved = await readStoredQuotes();
  const date = today();
  const validityDays = Math.max(1, Math.min(365, input.validity_days || 30));
  const sequence = saved.reduce((max, quote) => Math.max(max, Number(quote.number.split("-").at(-1)) || 0), 0) + 1;
  const id = `quote-demo-${crypto.randomUUID()}`;
  const number = `PRV-${date.slice(0, 4)}-${String(sequence).padStart(4, "0")}`;
  const createdAt = Date.now();
  const conditions = input.conditions?.trim() || "30% alla conferma, saldo prima della consegna";
  const deliveryTime = input.delivery_time?.trim() || "15–25 giorni dalla conferma";
  const expiryDate = addDays(date, validityDays);
  const quote: StoredQuote = {
    id, number, status: "bozza", date, expiryDate,
    customerId: customer.id,
    customerName: customer.ragione_sociale,
    subject: input.subject.trim() || `Fornitura demo — ${customer.ragione_sociale}`,
    lines,
    generalDiscountPercent,
    ...totals,
    marginCents: totals.taxableCents - costCents,
    approvalRequired: generalDiscountPercent > 8 || lines.some((line) => line.discountPercent > 8 || line.quantityMilli > line.availableMilli),
    conditions,
    deliveryTime,
    managerPath: `/preventivi/${id}`,
    createdAt,
    updatedAt: createdAt,
    notes: nullable(input.notes),
    managerRecord: {},
    audit: {
      conversationId: context.conversationId || null,
      actorId: context.actor?.id || "demo-user-local",
      actorName: context.actor?.displayName || "Utente demo",
      source: "demo-local",
    },
  };
  quote.managerRecord = quoteToManagerRecord(quote, customer);
  await writeStoredQuotes([...saved, quote]);
  return { quote, warnings };
}

export function quoteToManagerRecord(quote: StoredQuote, customer: CsvRow): Record<string, unknown> {
  const header = {
    nome: customer.ragione_sociale,
    indirizzo: nullable(customer.indirizzo), cap: nullable(customer.cap), citta: nullable(customer.citta),
    provincia: nullable(customer.provincia), nazione: customer.nazione || "IT",
    codice_fiscale: nullable(customer.codice_fiscale), piva: nullable(customer.piva),
  };
  return {
    id: quote.id, id_esterno: null, created_at: quote.createdAt, updated_at: quote.updatedAt,
    numero: quote.number, data: quote.date, cliente_id: quote.customerId, cliente_nome: quote.customerName,
    intestazione: header, oggetto: quote.subject, agente_nome: "WoodRevive Insight", provvigione_cents: 0,
    righe: quote.lines.map((line) => ({
      id: `${quote.id}-${line.id}`, tipo: "merce", articolo_id: line.articleId, codice_articolo: line.code,
      descrizione: line.description, lotto_id: null, lotto_codice: null, quantita_milli: line.quantityMilli,
      unita_misura: line.unit, prezzo_unitario_cents: line.unitPriceCents, sconto_percentuale: line.discountPercent,
      aliquota_iva: line.vatRate, imponibile_cents: line.taxableCents, essenza: null, patina: null,
      spessore_mm: null, note: null,
    })),
    sconto_generale_percentuale: quote.generalDiscountPercent,
    imponibile_cents: quote.taxableCents, iva_cents: quote.vatCents, totale_cents: quote.totalCents,
    validita_giorni: Math.round((Date.parse(quote.expiryDate) - Date.parse(quote.date)) / 86_400_000),
    data_scadenza: quote.expiryDate, condizioni_pagamento: quote.conditions,
    tempi_consegna: quote.deliveryTime, note: quote.notes, stato: "bozza", ordine_id: null,
  };
}

export async function listStoredQuotes(): Promise<StoredQuote[]> {
  return readStoredQuotes();
}

export async function listRecentQuotes(input: { limit?: number; status?: string } = {}): Promise<RecentQuotesArtifact> {
  const [historic, stored] = await Promise.all([
    readCsv(resolve(datasetsRoot, "preventivi.csv")),
    readStoredQuotes(),
  ]);
  const historicItems: RecentQuoteSummary[] = historic.map((quote) => ({
    id: quote.id,
    number: quote.numero,
    date: quote.data,
    customerName: quote.cliente_ragione_sociale,
    subject: quote.oggetto,
    status: quote.ordine_id ? "convertito" : quote.stato,
    totalCents: numberValue(quote.totale_cents),
    managerPath: `/preventivi/${quote.id}`,
  }));
  const storedItems: RecentQuoteSummary[] = stored.map((quote) => ({
    id: quote.id,
    number: quote.number,
    date: quote.date,
    customerName: quote.customerName,
    subject: quote.subject,
    status: quote.status,
    totalCents: quote.totalCents,
    managerPath: quote.managerPath,
    createdBy: quote.audit?.actorName,
  }));
  const status = input.status?.trim().toLowerCase() || "all";
  const allItems = [...historicItems, ...storedItems]
    .filter((quote) => status === "all" || quote.status === status)
    .sort((left, right) => right.date.localeCompare(left.date) || right.number.localeCompare(left.number));
  const limit = Math.max(1, Math.min(20, Math.round(input.limit || 8)));
  return {
    referenceDate: allItems[0]?.date || new Date().toISOString().slice(0, 10),
    totalMatching: allItems.length,
    statusFilter: status,
    items: allItems.slice(0, limit),
  };
}
