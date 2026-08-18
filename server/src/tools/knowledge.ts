import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AnalysisArtifact, QuoteArtifact, RecentQuotesArtifact, SourceReference } from "../contracts/chat.js";

const projectRoot = resolve(import.meta.dirname, "../../..");
const wikiRoot = resolve(projectRoot, "knowledge/wiki");
const corpusPath = resolve(projectRoot, "knowledge/rag-source/manuale-operativo-completo.md");
const STOP_WORDS = new Set([
  "che", "chi", "come", "cosa", "dove", "quando", "quale", "quali", "con",
  "del", "della", "delle", "dei", "degli", "per", "una", "uno", "gli", "nel",
  "nella", "sono", "sul", "sulla", "tra", "fra", "piu", "meno", "woodrevive",
]);

type WikiIndex = {
  pages: Array<{
    slug: string;
    title: string;
    path: string;
    tags: string[];
    synonyms: string[];
  }>;
};

export interface ToolEvidence {
  content: string;
  sources: SourceReference[];
  warnings: string[];
  artifact?: AnalysisArtifact;
  quote?: QuoteArtifact;
  recentQuotes?: RecentQuotesArtifact;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function tokens(value: string): string[] {
  return [...new Set(normalize(value).match(/[a-z0-9]{3,}/g) || [])]
    .filter((token) => !STOP_WORDS.has(token));
}

function scoreText(queryTokens: string[], text: string, boost = 1): number {
  const normalized = normalize(text);
  return queryTokens.reduce((score, token) => {
    const occurrences = normalized.split(token).length - 1;
    return score + Math.min(occurrences, 6) * boost;
  }, 0);
}

export async function searchWiki(question: string): Promise<ToolEvidence> {
  const index = JSON.parse(await readFile(resolve(wikiRoot, "index.json"), "utf8")) as WikiIndex;
  const queryTokens = tokens(question);
  const ranked = await Promise.all(index.pages.map(async (page) => {
    const content = await readFile(resolve(wikiRoot, page.path), "utf8");
    const score = scoreText(queryTokens, page.title, 9)
      + scoreText(queryTokens, page.tags.join(" "), 6)
      + scoreText(queryTokens, page.synonyms.join(" "), 5)
      + scoreText(queryTokens, content, 1);
    return { page, content, score };
  }));
  ranked.sort((left, right) => right.score - left.score || left.page.title.localeCompare(right.page.title));
  const selected = ranked.filter((item) => item.score > 0).slice(0, 3);
  const fallback = selected.length ? selected : ranked.slice(0, 2);

  const candidates = fallback.map((item) => {
    const body = item.content.replace(/^---[\s\S]*?---\s*/, "");
    const headings = [...body.matchAll(/^##+\s+(.+)$/gm)].map((match) => match[1].trim());
    const links = [...body.matchAll(/\]\(([^)]+\.md)\)/g)].map((match) => match[1]);
    const summary = body.replace(/^#.*$/m, "").replace(/[#*`|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 360);
    return {
      slug: item.page.slug,
      title: item.page.title,
      path: item.page.path,
      score: item.score,
      tags: item.page.tags,
      synonyms: item.page.synonyms,
      headings,
      links,
      summary,
    };
  });
  return {
    content: JSON.stringify({
      instruction: "Scegli una o più pagine e usa wiki_read per leggere le sezioni necessarie prima di rispondere.",
      candidates,
    }, null, 2),
    sources: fallback.map((item) => ({
      kind: "wiki" as const,
      label: item.page.title,
      locator: `knowledge/wiki/${item.page.path}`,
    })),
    warnings: fallback[0]?.score === 0
      ? ["Nessuna corrispondenza forte: mostrate pagine Wiki generali."]
      : [],
  };
}

export async function readWiki(slugs: string[], focus: string): Promise<ToolEvidence> {
  const index = JSON.parse(await readFile(resolve(wikiRoot, "index.json"), "utf8")) as WikiIndex;
  const uniqueSlugs = [...new Set(slugs)].slice(0, 4);
  const selectedPages = uniqueSlugs.map((slug) => index.pages.find((page) => page.slug === slug)).filter(Boolean) as WikiIndex["pages"];
  if (!selectedPages.length) throw new Error("Nessuna pagina Wiki valida selezionata.");
  const queryTokens = tokens(focus);
  const contents = await Promise.all(selectedPages.map(async (page) => {
    const raw = await readFile(resolve(wikiRoot, page.path), "utf8");
    const body = raw.replace(/^---[\s\S]*?---\s*/, "").trim();
    const sections = body.split(/\n(?=##\s+)/).map((section, index) => ({
      section,
      index,
      heading: section.match(/^##\s+(.+)$/m)?.[1]?.trim() || page.title,
      score: scoreText(queryTokens, section.match(/^##\s+(.+)$/m)?.[1] || "", 8) + scoreText(queryTokens, section, 1),
    }));
    const best = sections.filter((section) => section.index === 0 || section.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 5)
      .sort((left, right) => left.index - right.index);
    return `PAGINA: ${page.title}\nPERCORSO: knowledge/wiki/${page.path}\n\n${best.map((section) => section.section).join("\n\n").slice(0, 7_500)}`;
  }));
  return {
    content: contents.join("\n\n---\n\n"),
    sources: selectedPages.map((page) => ({
      kind: "wiki" as const,
      label: page.title,
      locator: `knowledge/wiki/${page.path}`,
    })),
    warnings: [],
  };
}

export async function searchRagCorpus(question: string): Promise<ToolEvidence> {
  const corpus = await readFile(corpusPath, "utf8");
  const queryTokens = tokens(question);
  const chunks = corpus.split(/\n(?=##? )/).map((content, index) => ({
    index,
    content: content.trim(),
    title: content.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim() || `Sezione ${index + 1}`,
  })).filter((chunk) => chunk.content.length > 80);
  const ranked = chunks.map((chunk) => ({
    ...chunk,
    score: scoreText(queryTokens, chunk.title, 8) + scoreText(queryTokens, chunk.content, 1),
  })).sort((left, right) => right.score - left.score);
  const selected = ranked.filter((chunk) => chunk.score > 0).slice(0, 5);
  const fallback = selected.length ? selected : ranked.slice(0, 3);

  return {
    content: fallback.map((chunk) => `SEZIONE: ${chunk.title}\n${chunk.content.slice(0, 3_000)}`).join("\n\n---\n\n"),
    sources: fallback.map((chunk) => ({
      kind: "rag" as const,
      label: chunk.title,
      locator: `knowledge/rag-source/manuale-operativo-completo.md#chunk-${chunk.index + 1}`,
    })),
    warnings: ["Retrieval RAG locale attivo sul corpus canonico; ChromaDB vettoriale non è ancora configurato."],
  };
}
