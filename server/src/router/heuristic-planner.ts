import type { ChatRequest, DataOperation, ToolPlan } from "../contracts/chat.js";

const DATA_TERMS = /\b(fatturato|trend|margine|rotazione|giacenza|incasso|scaduto|kpi|quanto|classifica|media|totale)\b/i;
const DOCUMENT_TERMS = /\b(procedura|regola|policy|significa|differenza|come funziona|quando nasce|manuale|patina|lotto)\b/i;

function operationFor(message: string): DataOperation {
  if (/trend|andamento|mensil/i.test(message)) return "trend";
  if (/quale|classifica|miglior|peggior|più|meno/i.test(message)) return "ranking";
  if (/anom|insolit|fuori soglia/i.test(message)) return "anomaly";
  if (DATA_TERMS.test(message)) return "aggregation";
  return "none";
}

/**
 * Router provvisorio e deterministico. Verrà sostituito da un provider LLM con
 * output strutturato, ma resta come fallback testabile.
 */
export function createHeuristicPlan(request: ChatRequest): ToolPlan {
  const hasData = DATA_TERMS.test(request.message);
  const hasDocuments = DOCUMENT_TERMS.test(request.message);
  const forced = request.mode && request.mode !== "auto" ? request.mode : null;

  if (forced === "data") {
    return {
      intent: "data",
      documentStrategy: "none",
      question: request.message,
      dataOperation: operationFor(request.message),
      filters: {},
      confidence: 1,
    };
  }

  if (forced === "rag" || forced === "wiki" || forced === "compare") {
    return {
      intent: hasData ? "hybrid" : "documents",
      documentStrategy: forced,
      question: request.message,
      dataOperation: hasData ? operationFor(request.message) : "none",
      filters: {},
      confidence: 1,
    };
  }

  return {
    intent: hasData && hasDocuments ? "hybrid" : hasData ? "data" : "documents",
    documentStrategy: hasDocuments ? "wiki" : "none",
    question: request.message,
    dataOperation: operationFor(request.message),
    filters: {},
    confidence: hasData || hasDocuments ? 0.82 : 0.55,
  };
}
