import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const load = (path) => readFile(new URL(path, root), "utf8");

test("il dataset supera le soglie e i controlli dichiarati", async () => {
  const manifest = JSON.parse(await load("datasets/demo/manifest.json"));
  assert.equal(manifest.synthetic, true);
  assert.ok(manifest.coverage.aziende_clienti >= 20);
  assert.ok(manifest.coverage.eventi_transazionali >= 60);
  assert.equal(manifest.counts["clienti.csv"], 24);
  assert.equal(manifest.counts["transazioni.csv"], 190);
  assert.ok(manifest.checks.every((check) => check.status === "PASS"));
});

test("Wiki e corpus RAG condividono tutte le pagine canoniche", async () => {
  const index = JSON.parse(await load("knowledge/wiki/index.json"));
  const corpus = await load("knowledge/rag-source/manuale-operativo-completo.md");
  assert.ok(index.pages.length >= 10);
  for (const page of index.pages) {
    assert.match(corpus, new RegExp(`slug: ${page.slug}(?: |-->)`));
  }
});

test("le aziende e i recapiti sono esplicitamente sintetici", async () => {
  const customers = await load("datasets/demo/clienti.csv");
  const suppliers = await load("datasets/demo/fornitori.csv");
  assert.match(customers, /@example\.com/);
  assert.match(suppliers, /@example\.com/);
  assert.doesNotMatch(customers, /@gmail\.|@outlook\.|@woodrevive\./i);
});
