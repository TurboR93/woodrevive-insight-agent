import assert from "node:assert/strict";
import test from "node:test";
import { analyzeData, DATA_OPERATIONS } from "../src/tools/analytics.js";
import { readWiki, searchRagCorpus, searchWiki } from "../src/tools/knowledge.js";

test("la Wiki trova pagine pertinenti e citabili", async () => {
  const result = await searchWiki("Qual è la differenza tra articolo e lotto?");
  assert.ok(result.content.includes("Articolo") || result.content.includes("articolo"));
  assert.ok(result.sources.length >= 1);
  assert.ok(result.sources.every((source) => source.kind === "wiki"));
});

test("Haiku può aprire per slug le sezioni Wiki selezionate", async () => {
  const result = await readWiki(["ordini-ddt-consegne"], "consegna frazionata e controlli");
  assert.match(result.content, /Consegna frazionata/);
  assert.equal(result.sources[0].locator, "knowledge/wiki/ordini-ddt-consegne.md");
});

test("il corpus RAG restituisce sezioni e dichiara il fallback locale", async () => {
  const result = await searchRagCorpus("Come si gestisce una consegna frazionata?");
  assert.ok(result.content.toLowerCase().includes("consegna"));
  assert.ok(result.sources.length >= 1);
  assert.ok(result.warnings.some((warning) => warning.includes("ChromaDB")));
});

test("il catalogo espone le sette analisi pandas ammesse", () => {
  assert.equal(DATA_OPERATIONS.length, 7);
  assert.ok(DATA_OPERATIONS.includes("customer_exposure"));
  assert.ok(DATA_OPERATIONS.includes("order_fulfillment"));
});

test("il tool pandas conserva il payload visuale per la chat", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    summary: "Margine aggregato per categoria.",
    table: { columns: ["categoria", "margine_cents"], rows: [{ categoria: "Tavola", margine_cents: 120000 }] },
    chart: { type: "bar", x: "categoria", y: "margine_cents" },
    method: "Ricavo meno costo.",
  }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await analyzeData({ operation: "margin_by_category" });
  assert.equal(result.artifact?.chart?.type, "bar");
  assert.equal(result.artifact?.table?.rows.length, 1);
  assert.equal(result.sources[0].kind, "dataset");
});
