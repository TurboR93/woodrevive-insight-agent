import assert from "node:assert/strict";
import test from "node:test";
import { DATA_OPERATIONS } from "../src/tools/analytics.js";
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
