import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const wikiDir = resolve(root, "knowledge/wiki");
const destination = resolve(root, "knowledge/rag-source/manuale-operativo-completo.md");
const checkOnly = process.argv.includes("--check");

const index = JSON.parse(await readFile(resolve(wikiDir, "index.json"), "utf8"));
const pages = [];
for (const page of index.pages) {
  const source = await readFile(resolve(wikiDir, page.path), "utf8");
  pages.push(`<!-- source: knowledge/wiki/${page.path}; slug: ${page.slug} -->\n\n${source.trim()}`);
}

const content = `---
title: Manuale operativo completo WoodRevive Insight
version: ${index.version}
updated: ${index.updated}
source: wiki-canonical
synthetic: true
---

# Corpus RAG parallelo alla Wiki

Questo file è generato dalle pagine canoniche della Wiki. Consente di confrontare
RAG vettoriale e Wiki lessicale sullo stesso contenuto, senza vantaggi di copertura.
Le regole e le soglie descritte sono scenari didattici e non policy aziendali reali.

${pages.join("\n\n---\n\n")}\n`;

if (checkOnly) {
  if (await readFile(destination, "utf8") !== content) throw new Error("Il corpus RAG non è allineato alla Wiki.");
  console.log(`Corpus RAG verificato: ${pages.length} pagine allineate.`);
} else {
  await writeFile(destination, content, "utf8");
  console.log(`Corpus RAG generato da ${pages.length} pagine Wiki.`);
}
