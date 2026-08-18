export type ChatMode = "auto" | "rag" | "wiki" | "data" | "compare";
export type Intent = "documents" | "data" | "hybrid";
export type DocumentStrategy = "rag" | "wiki" | "compare" | "none";
export type DataOperation = "trend" | "ranking" | "aggregation" | "anomaly" | "none";

export interface ChatRequest {
  message: string;
  mode?: ChatMode;
  conversationId?: string;
  history?: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}

export interface ToolPlan {
  intent: Intent;
  documentStrategy: DocumentStrategy;
  question: string;
  dataOperation: DataOperation;
  filters: Record<string, string | number | boolean>;
  confidence: number;
}

export interface SourceReference {
  kind: "wiki" | "rag" | "dataset";
  label: string;
  locator: string;
}

export interface ChatResponse {
  answer: string;
  plan: ToolPlan;
  tool: string;
  sources: SourceReference[];
  warnings: string[];
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
