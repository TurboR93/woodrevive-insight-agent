import type { SourceReference } from "../contracts/chat.js";
import type { ToolEvidence } from "./knowledge.js";

export const DATA_OPERATIONS = [
  "sales_summary",
  "margin_by_category",
  "slow_stock",
  "customer_exposure",
  "transaction_volume",
  "supplier_spend",
  "order_fulfillment",
] as const;

export type DataOperationName = typeof DATA_OPERATIONS[number];

const SOURCES_BY_OPERATION: Record<DataOperationName, string[]> = {
  sales_summary: ["vendite.csv"],
  margin_by_category: ["vendite.csv"],
  slow_stock: ["magazzino.csv"],
  customer_exposure: ["incassi.csv"],
  transaction_volume: ["transazioni.csv"],
  supplier_spend: ["ordini_acquisto.csv"],
  order_fulfillment: ["righe_ordini.csv"],
};

export async function analyzeData(input: {
  operation: DataOperationName;
  minimum_days?: number;
  as_of?: string;
}): Promise<ToolEvidence> {
  if (!DATA_OPERATIONS.includes(input.operation)) {
    throw new Error(`Operazione dati non ammessa: ${input.operation}`);
  }
  const analyticsUrl = process.env.ANALYTICS_URL || "http://127.0.0.1:8001";
  const response = await fetch(`${analyticsUrl}/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operation: input.operation,
      minimum_days: input.minimum_days ?? 180,
      as_of: input.as_of ?? "2025-08-31",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Servizio pandas non disponibile (HTTP ${response.status}).`);
  const result = await response.json() as Record<string, unknown>;
  const sources: SourceReference[] = SOURCES_BY_OPERATION[input.operation].map((name) => ({
    kind: "dataset",
    label: name,
    locator: `datasets/demo/${name}`,
  }));
  return {
    content: JSON.stringify(result, null, 2),
    sources,
    warnings: ["Analisi calcolata su dati sintetici e anonimi."],
  };
}
