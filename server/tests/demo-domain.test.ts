import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseCsv } from "../src/domain/csv.js";
import { createQuoteDraft, searchQuoteCatalog } from "../src/domain/demo-quotes.js";
import { buildManagerDemoEnvelope } from "../src/domain/manager-envelope.js";

test("il parser CSV conserva virgole e virgolette nei campi", () => {
  const rows = parseCsv('id,note\r\n1,"Consegna, su appuntamento"\r\n2,"Testo ""citato"""\r\n');
  assert.deepEqual(rows, [
    { id: "1", note: "Consegna, su appuntamento" },
    { id: "2", note: 'Testo "citato"' },
  ]);
});

test("il catalogo preventivi usa clienti e articoli del dataset condiviso", async () => {
  const result = await searchQuoteCatalog({ customer_query: "Atelier Arco", article_query: "abete prima patina" });
  const customers = result.customers as Array<Record<string, unknown>>;
  const articles = result.articles as Array<Record<string, unknown>>;
  assert.equal(customers[0]?.id, "cli-001");
  assert.equal(articles[0]?.id, "art-001");
  assert.equal(articles[0]?.unit_price_cents, 8_800);
  assert.equal(articles[0]?.available_milli, 109_000);
});

test("un preventivo agente entra nella copia Manager senza conversioni manuali", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "woodrevive-quotes-"));
  const previousPath = process.env.WOODREVIVE_QUOTE_STORE_PATH;
  process.env.WOODREVIVE_QUOTE_STORE_PATH = join(directory, "quotes.json");
  context.after(async () => {
    if (previousPath === undefined) delete process.env.WOODREVIVE_QUOTE_STORE_PATH;
    else process.env.WOODREVIVE_QUOTE_STORE_PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  });

  const { quote, warnings } = await createQuoteDraft({
    customer_id: "cli-001",
    subject: "Fornitura tavole demo",
    lines: [{ article_id: "art-001", quantity_milli: 20_000 }],
  }, {
    conversationId: "conversation-test",
    actor: { id: "demo-user-test", displayName: "Utente test", source: "demo-local" },
  });

  assert.equal(warnings.length, 0);
  assert.equal(quote.taxableCents, 176_000);
  assert.equal(quote.vatCents, 38_720);
  assert.equal(quote.totalCents, 214_720);
  assert.equal(quote.marginCents, 96_200);
  assert.equal(quote.audit.conversationId, "conversation-test");
  assert.equal(quote.audit.actorId, "demo-user-test");
  assert.equal(quote.managerPath, `/preventivi/${quote.id}`);

  const envelope = await buildManagerDemoEnvelope();
  assert.equal(envelope.versione, 8);
  assert.equal(envelope.db.clienti.length, 24);
  assert.equal(envelope.db.preventivi.at(-1)?.id, quote.id);
  assert.equal(envelope.db.preventivi.at(-1)?.totale_cents, 214_720);
});
