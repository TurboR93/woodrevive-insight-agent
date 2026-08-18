export type ChatMode = "auto" | "rag" | "wiki" | "data" | "compare";
export type Intent = "documents" | "data" | "hybrid" | "action";
export type DocumentStrategy = "rag" | "wiki" | "compare" | "none";
export type DataOperation = "trend" | "ranking" | "aggregation" | "anomaly" | "none";

export interface ChatRequest {
  message: string;
  mode?: ChatMode;
  conversationId?: string;
  actor?: {
    id: string;
    displayName: string;
    source: "demo-local";
  };
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

export interface AgentActivity {
  id: string;
  kind: "routing" | "skill" | "wiki" | "rag" | "pandas" | "quote" | "response";
  title: string;
  detail: string;
  status: "running" | "complete" | "error";
}

export interface BusinessSkillReference {
  id: string;
  label: string;
  description: string;
}

export interface AnalysisMetric {
  label: string;
  value: number;
  unit: "cents" | "%" | "count" | string;
}

export interface AnalysisTable {
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
}

export interface AnalysisChart {
  type: "bar" | "stacked_bar" | string;
  x: string;
  y: string;
  series?: string;
  top?: number;
}

export interface AnalysisArtifact {
  operation: string;
  summary?: string;
  metrics?: AnalysisMetric[];
  table?: AnalysisTable;
  chart?: AnalysisChart;
  method?: string;
}

export interface QuoteLineArtifact {
  id: string;
  articleId: string;
  code: string;
  description: string;
  quantityMilli: number;
  unit: string;
  unitPriceCents: number;
  discountPercent: number;
  taxableCents: number;
  vatRate: number;
  availableMilli: number;
}

export interface QuoteArtifact {
  id: string;
  number: string;
  status: "bozza";
  date: string;
  expiryDate: string;
  customerId: string;
  customerName: string;
  subject: string;
  lines: QuoteLineArtifact[];
  generalDiscountPercent: number;
  taxableCents: number;
  vatCents: number;
  totalCents: number;
  marginCents: number;
  approvalRequired: boolean;
  conditions: string;
  deliveryTime: string;
  managerPath: string;
}

export interface ChatResponse {
  answer: string;
  plan: ToolPlan;
  tool: string;
  sources: SourceReference[];
  warnings: string[];
  activities: AgentActivity[];
  artifacts: AnalysisArtifact[];
  quotes: QuoteArtifact[];
  skills: BusinessSkillReference[];
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
