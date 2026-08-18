"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

type Mode = "auto" | "rag" | "wiki" | "data";
type ActivityStatus = "running" | "complete" | "error";
type AgentSource = { kind: "wiki" | "rag" | "dataset"; label: string; locator: string };
type AgentActivity = {
  id: string;
  kind: "routing" | "skill" | "wiki" | "rag" | "pandas" | "quote" | "response";
  title: string;
  detail: string;
  status: ActivityStatus;
};
type BusinessSkillReference = { id: string; label: string; description: string };
type AnalysisArtifact = {
  operation: string;
  summary?: string;
  metrics?: Array<{ label: string; value: number; unit: string }>;
  table?: { columns: string[]; rows: Array<Record<string, string | number | null>> };
  chart?: { type: string; x: string; y: string; series?: string; top?: number };
  method?: string;
};
type QuoteArtifact = {
  id: string;
  number: string;
  status: "bozza";
  date: string;
  expiryDate: string;
  customerId: string;
  customerName: string;
  subject: string;
  lines: Array<{
    id: string; articleId: string; code: string; description: string; quantityMilli: number;
    unit: string; unitPriceCents: number; discountPercent: number; taxableCents: number;
    vatRate: number; availableMilli: number;
  }>;
  generalDiscountPercent: number;
  taxableCents: number;
  vatCents: number;
  totalCents: number;
  marginCents: number;
  approvalRequired: boolean;
  conditions: string;
  deliveryTime: string;
  managerPath: string;
};
type RecentQuoteSummary = {
  id: string;
  number: string;
  date: string;
  customerName: string;
  subject: string;
  status: string;
  totalCents: number;
  managerPath: string;
  createdBy?: string;
};
type RecentQuotesArtifact = {
  referenceDate: string;
  totalMatching: number;
  statusFilter: string;
  items: RecentQuoteSummary[];
};
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  createdAt?: string;
  actorId?: string;
  tool?: string;
  sources?: AgentSource[];
  warnings?: string[];
  activities?: AgentActivity[];
  artifacts?: AnalysisArtifact[];
  quotes?: QuoteArtifact[];
  recentQuotes?: RecentQuotesArtifact[];
  skills?: BusinessSkillReference[];
  usage?: { inputTokens: number; outputTokens: number };
};
type DemoActor = { id: string; displayName: string; source: "demo-local" };
type StoredConversation = {
  id: string;
  title: string;
  actor: DemoActor;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
};
type ChatMemory = {
  version: 1;
  activeConversationId: string;
  conversations: StoredConversation[];
};
type AgentResponse = {
  answer: string;
  tool: string;
  model?: string;
  sources: AgentSource[];
  warnings: string[];
  activities: AgentActivity[];
  artifacts: AnalysisArtifact[];
  quotes: QuoteArtifact[];
  recentQuotes: RecentQuotesArtifact[];
  skills: BusinessSkillReference[];
  usage?: { inputTokens: number; outputTokens: number };
};

const MODES: { id: Mode; label: string; note: string }[] = [
  { id: "auto", label: "Automatico", note: "Haiku decide il percorso migliore" },
  { id: "rag", label: "RAG", note: "Ricerca nel corpus documentale" },
  { id: "wiki", label: "Wiki", note: "Navigazione tra pagine e sezioni" },
  { id: "data", label: "Dati", note: "Analisi visuale dei CSV con pandas" },
];
const SUGGESTIONS = [
  "Abbiamo preventivi recenti?",
  "Crea un preventivo per Atelier Arco: 20 m² di Tavola abete prima patina",
  "Mostrami il margine per categoria",
  "Quali clienti hanno importi aperti?",
  "Come gestiamo una consegna frazionata?",
];
const INITIAL_MESSAGES: Message[] = [{
  id: 1,
  role: "assistant",
  text: "Buongiorno. Posso **navigare la Wiki**, analizzare vendite e magazzino oppure combinare le due cose. Durante il lavoro ti mostrerò strumenti, fonti e risultati visuali.",
  tool: "Assistente pronto",
}];
const CHAT_MEMORY_KEY = "woodrevive.insight.chat-memory.v1";
const DEMO_ACTOR: DemoActor = { id: "demo-user-local", displayName: "Utente demo", source: "demo-local" };
const MAX_CONVERSATIONS = 12;
const MAX_MESSAGES_PER_CONVERSATION = 80;
const numberFormatter = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const euroFormatter = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

function newConversationId(): string {
  return `conversation-${crypto.randomUUID()}`;
}

function conversationTitle(messages: Message[]): string {
  const firstQuestion = messages.find((message) => message.role === "user")?.text.trim();
  if (!firstQuestion) return "Nuova conversazione";
  return firstQuestion.length > 52 ? `${firstQuestion.slice(0, 49)}…` : firstQuestion;
}

function isStoredConversation(value: unknown): value is StoredConversation {
  if (!value || typeof value !== "object") return false;
  const conversation = value as Partial<StoredConversation>;
  return typeof conversation.id === "string"
    && typeof conversation.title === "string"
    && Array.isArray(conversation.messages)
    && Boolean(conversation.actor?.id);
}

function inlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const output: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) output.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("**")) output.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("*")) output.push(<em key={key}>{token.slice(1, -1)}</em>);
    else if (token.startsWith("`")) output.push(<code key={key}>{token.slice(1, -1)}</code>);
    else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link?.[2] || "#";
      output.push(<a href={/^https?:\/\//.test(href) ? href : "#"} key={key} rel="noreferrer" target="_blank">{link?.[1]}</a>);
    }
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function isBlockStart(line: string): boolean {
  return /^(#{2,4})\s+|^[-*]\s+|^\d+[.)]\s+|^>\s+/.test(line.trim());
}

function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const Heading = `h${level}` as "h2" | "h3" | "h4";
      blocks.push(<Heading key={`heading-${index}`}>{inlineMarkdown(heading[2], `heading-${index}`)}</Heading>);
      index += 1;
      continue;
    }
    if (line.includes("|") && lines[index + 1]?.trim().match(/^\|?\s*:?-{3,}/)) {
      const headers = parseTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push(<div className="markdown-table-wrap" key={`table-${index}`}><table className="markdown-table"><thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{inlineMarkdown(cell, `th-${index}-${cellIndex}`)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inlineMarkdown(cell, `td-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(orderedList ? /^\d+[.)]\s+(.+)$/ : /^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const List = orderedList ? "ol" : "ul";
      blocks.push(<List key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item, `li-${index}-${itemIndex}`)}</li>)}</List>);
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push(<blockquote key={`quote-${index}`}>{inlineMarkdown(line.slice(2), `quote-${index}`)}</blockquote>);
      index += 1;
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index]) && !(lines[index].includes("|") && lines[index + 1]?.includes("---"))) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(paragraph.join(" "), `paragraph-${index}`)}</p>);
  }
  return <div className="rich-text">{blocks}</div>;
}

function activityIcon(kind: AgentActivity["kind"]) {
  return { routing: "⌁", skill: "◆", wiki: "▤", rag: "◎", pandas: "▥", quote: "€", response: "✦" }[kind];
}

function ActivityPanel({ activities, live = false }: { activities: AgentActivity[]; live?: boolean }) {
  const visible = activities.length ? activities : [{ id: "waiting", kind: "routing" as const, title: "Avvio dell’agente", detail: "Invio sicuro della richiesta a Haiku.", status: "running" as const }];
  const completed = visible.filter((item) => item.status === "complete").length;
  return <details className={`activity-panel ${live ? "live" : ""}`} open={live || undefined}>
    <summary><span className="activity-summary-icon">{live ? <span className="mini-spinner" /> : "✓"}</span><span><strong>{live ? "Agente al lavoro" : "Come ho costruito la risposta"}</strong><small>{live ? visible.at(-1)?.title : `${completed} passaggi completati`}</small></span><span className="activity-chevron">⌄</span></summary>
    <div className="activity-list">{visible.map((item) => <div className={`activity-item ${item.status}`} key={item.id}><span className="activity-kind">{item.status === "running" ? <span className="mini-spinner" /> : activityIcon(item.kind)}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className="activity-state">{item.status === "complete" ? "Fatto" : item.status === "error" ? "Errore" : "In corso"}</span></div>)}</div>
  </details>;
}

function formatMetric(value: number, unit: string) {
  if (unit === "cents") return euroFormatter.format(value / 100);
  if (unit === "%") return `${numberFormatter.format(value)}%`;
  return numberFormatter.format(value);
}
function formatCell(value: string | number | null, column: string) {
  if (value === null) return "—";
  if (typeof value !== "number") return String(value);
  if (column.endsWith("_cents")) return euroFormatter.format(value / 100);
  if (column.includes("percentuale")) return `${numberFormatter.format(value)}%`;
  if (column.endsWith("_milli")) return numberFormatter.format(value / 1000);
  return numberFormatter.format(value);
}
function prettyColumn(column: string) {
  return column.replace(/_cents|_milli/g, "").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
const CHART_COLORS = ["#28523a", "#78967b", "#b38a57", "#547087", "#9a6c64", "#7e7a52"];

function DataChart({ artifact }: { artifact: AnalysisArtifact }) {
  const chart = artifact.chart;
  const rows = artifact.table?.rows || [];
  if (!chart || !rows.length) return null;
  if (chart.type === "stacked_bar" && chart.series) {
    const labels = [...new Set(rows.map((row) => String(row[chart.x])))];
    const series = [...new Set(rows.map((row) => String(row[chart.series!])))];
    const totals = labels.map((label) => rows.filter((row) => String(row[chart.x]) === label).reduce((sum, row) => sum + Number(row[chart.y] || 0), 0));
    const max = Math.max(...totals, 1);
    return <div className="data-chart stacked-chart" role="img" aria-label={artifact.summary || "Grafico dati"}>{labels.map((label, labelIndex) => <div className="stacked-row" key={label}><span className="chart-label">{label}</span><div className="stacked-track" style={{ width: `${Math.max((totals[labelIndex] / max) * 100, 4)}%` }}>{series.map((name, seriesIndex) => { const value = Number(rows.find((row) => String(row[chart.x]) === label && String(row[chart.series!]) === name)?.[chart.y] || 0); return value ? <span key={name} style={{ flex: value, background: CHART_COLORS[seriesIndex % CHART_COLORS.length] }} title={`${name}: ${value}`} /> : null; })}</div><strong>{numberFormatter.format(totals[labelIndex])}</strong></div>)}<div className="chart-legend">{series.map((name, seriesIndex) => <span key={name}><i style={{ background: CHART_COLORS[seriesIndex % CHART_COLORS.length] }} />{name}</span>)}</div></div>;
  }
  const sorted = [...rows].sort((a, b) => Number(b[chart.y] || 0) - Number(a[chart.y] || 0)).slice(0, chart.top || 8);
  const max = Math.max(...sorted.map((row) => Number(row[chart.y] || 0)), 1);
  return <div className="data-chart" role="img" aria-label={artifact.summary || "Grafico dati"}>{sorted.map((row) => { const value = Number(row[chart.y] || 0); return <div className="bar-row" key={String(row[chart.x])}><span className="chart-label" title={String(row[chart.x])}>{String(row[chart.x])}</span><div className="bar-track"><span style={{ width: `${Math.max((value / max) * 100, 2)}%` }} /></div><strong>{formatCell(value, chart.y)}</strong></div>; })}</div>;
}

function AnalysisCard({ artifact }: { artifact: AnalysisArtifact }) {
  const [showTable, setShowTable] = useState(false);
  return <section className="analysis-card"><header><span>▥</span><div><p>ANALISI PANDAS</p><h3>{artifact.summary || "Risultati calcolati"}</h3></div></header>
    {artifact.metrics && <div className="metric-grid">{artifact.metrics.map((metric) => <div className="metric-card" key={metric.label}><span>{metric.label}</span><strong>{formatMetric(metric.value, metric.unit)}</strong></div>)}</div>}
    <DataChart artifact={artifact} />
    {artifact.table && <div className="table-disclosure"><button type="button" onClick={() => setShowTable((current) => !current)}><span>{showTable ? "Nascondi" : "Mostra"} tabella</span><small>{artifact.table.rows.length} righe</small></button>{showTable && <div className="artifact-table-wrap"><table><thead><tr>{artifact.table.columns.map((column) => <th key={column}>{prettyColumn(column)}</th>)}</tr></thead><tbody>{artifact.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{artifact.table!.columns.map((column) => <td key={column}>{formatCell(row[column], column)}</td>)}</tr>)}</tbody></table></div>}</div>}
    {artifact.method && <details className="method-note"><summary>Metodo di calcolo</summary><p>{artifact.method}</p></details>}
  </section>;
}

function QuoteCard({ quote }: { quote: QuoteArtifact }) {
  const marginPercent = quote.taxableCents ? quote.marginCents / quote.taxableCents * 100 : 0;
  return <section className="quote-card">
    <header><div className="quote-icon">€</div><div><p>PREVENTIVO DEMO · BOZZA</p><h3>{quote.number}</h3><span>{quote.customerName}</span></div><div className={`quote-check ${quote.approvalRequired ? "review" : "ok"}`}>{quote.approvalRequired ? "Da verificare" : "Controlli superati"}</div></header>
    <div className="quote-subject"><span>Oggetto</span><strong>{quote.subject}</strong></div>
    <div className="quote-lines">{quote.lines.map((line) => <div className="quote-line" key={line.id}><div><strong>{line.description}</strong><small>{line.code} · {numberFormatter.format(line.quantityMilli / 1000)} {line.unit}{line.discountPercent ? ` · sconto ${numberFormatter.format(line.discountPercent)}%` : ""}</small></div><strong>{euroFormatter.format(line.taxableCents / 100)}</strong></div>)}</div>
    <div className="quote-totals"><div><span>Imponibile</span><strong>{euroFormatter.format(quote.taxableCents / 100)}</strong></div><div><span>IVA</span><strong>{euroFormatter.format(quote.vatCents / 100)}</strong></div><div className="grand-total"><span>Totale</span><strong>{euroFormatter.format(quote.totalCents / 100)}</strong></div><div><span>Margine stimato</span><strong>{euroFormatter.format(quote.marginCents / 100)} · {numberFormatter.format(marginPercent)}%</strong></div></div>
    <div className="quote-meta"><span>Valido fino al {new Date(`${quote.expiryDate}T12:00:00`).toLocaleDateString("it-IT")}</span><span>{quote.deliveryTime}</span></div>
    <a className="manager-open-button" href={`http://localhost:5174${quote.managerPath}`}>Apri nel gestionale demo <span>↗</span></a>
  </section>;
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  bozza: "Bozza",
  inviato: "Inviato",
  accettato: "Accettato",
  rifiutato: "Rifiutato",
  scaduto: "Scaduto",
  convertito: "Convertito",
};

function RecentQuotesCard({ artifact }: { artifact: RecentQuotesArtifact }) {
  return <section className="recent-quotes-card">
    <header>
      <div className="quote-icon">≡</div>
      <div><p>ARCHIVIO PREVENTIVI DEMO</p><h3>Preventivi recenti</h3><span>{artifact.totalMatching} risultati · più recente al {new Date(`${artifact.referenceDate}T12:00:00`).toLocaleDateString("it-IT")}</span></div>
    </header>
    {artifact.items.length ? <div className="recent-quotes-list">{artifact.items.map((quote) => <a className="recent-quote-row" href={`http://localhost:5174${quote.managerPath}`} key={quote.id}>
      <div className="recent-quote-main"><span className="recent-quote-number">{quote.number}</span><strong>{quote.customerName}</strong><small>{quote.subject}</small></div>
      <div className="recent-quote-meta"><span className={`recent-quote-status ${quote.status}`}>{QUOTE_STATUS_LABELS[quote.status] || quote.status}</span><strong>{euroFormatter.format(quote.totalCents / 100)}</strong><small>{new Date(`${quote.date}T12:00:00`).toLocaleDateString("it-IT")}{quote.createdBy ? ` · ${quote.createdBy}` : ""}</small></div>
      <span className="recent-quote-arrow">›</span>
    </a>)}</div> : <div className="recent-quotes-empty"><strong>Nessun preventivo trovato</strong><span>Apri il gestionale per creare o modificare un preventivo.</span></div>}
    <a className="manager-open-button" href="http://localhost:5174/preventivi">Apri tutti i preventivi nel gestionale demo <span>↗</span></a>
  </section>;
}

function SourcePanel({ sources }: { sources: AgentSource[] }) {
  if (!sources.length) return null;
  return <details className="source-panel"><summary><span>Fonti consultate</span><small>{sources.length}</small></summary><div className="source-list">{sources.map((source) => <div className="source-item" key={`${source.kind}-${source.locator}`}><span className={`source-kind ${source.kind}`}>{source.kind === "dataset" ? "CSV" : source.kind.toUpperCase()}</span><span><strong>{source.label}</strong><small>{source.locator}</small></span></div>)}</div></details>;
}

async function readStream(response: Response, onActivity: (activity: AgentActivity) => void): Promise<AgentResponse> {
  if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error || `Errore HTTP ${response.status}`); }
  if (!response.body) throw new Error("Il browser non supporta la risposta progressiva.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AgentResponse | undefined;
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const rawEvent of events) {
      const event = rawEvent.match(/^event:\s*(.+)$/m)?.[1];
      const data = rawEvent.match(/^data:\s*(.+)$/m)?.[1];
      if (!event || !data) continue;
      const parsed = JSON.parse(data) as AgentActivity | AgentResponse | { error: string };
      if (event === "activity") onActivity(parsed as AgentActivity);
      if (event === "result") result = parsed as AgentResponse;
      if (event === "error") throw new Error((parsed as { error: string }).error);
    }
    if (chunk.done) break;
  }
  if (!result) throw new Error("L’agente non ha completato la risposta.");
  return result;
}

export function WoodReviveAgent() {
  const [mode, setMode] = useState<Mode>("auto");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [conversationId, setConversationId] = useState("");
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [memoryReady, setMemoryReady] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [memoryWarning, setMemoryWarning] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [liveActivities, setLiveActivities] = useState<AgentActivity[]>([]);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationEnd = useRef<HTMLDivElement | null>(null);
  const activeMode = useMemo(() => MODES.find((item) => item.id === mode)!, [mode]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(CHAT_MEMORY_KEY) || "null") as Partial<ChatMemory> | null;
      const saved = parsed?.version === 1 && Array.isArray(parsed.conversations)
        ? parsed.conversations.filter(isStoredConversation)
        : [];
      const active = saved.find((conversation) => conversation.id === parsed?.activeConversationId) || saved[0];
      if (active) {
        setConversationId(active.id);
        setMessages(active.messages.length ? active.messages : INITIAL_MESSAGES);
      } else setConversationId(newConversationId());
      setConversations(saved);
    } catch {
      setConversationId(newConversationId());
      setMemoryWarning("La memoria locale non era leggibile: ho avviato una nuova conversazione.");
    } finally {
      setMemoryReady(true);
    }
  }, []);

  useEffect(() => {
    if (!memoryReady || !conversationId) return;
    const now = new Date().toISOString();
    setConversations((current) => {
      const previous = current.find((conversation) => conversation.id === conversationId);
      const snapshot: StoredConversation = {
        id: conversationId,
        title: conversationTitle(messages),
        actor: DEMO_ACTOR,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
        messages: messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
      };
      const next = [snapshot, ...current.filter((conversation) => conversation.id !== conversationId)]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, MAX_CONVERSATIONS);
      try {
        const memory: ChatMemory = { version: 1, activeConversationId: conversationId, conversations: next };
        localStorage.setItem(CHAT_MEMORY_KEY, JSON.stringify(memory));
      } catch {
        // La chat resta utilizzabile anche se il browser rifiuta la persistenza.
      }
      return next;
    });
  }, [conversationId, memoryReady, messages]);

  useEffect(() => { conversationEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, isSending, liveActivities]);
  function startNewConversation() {
    if (isSending) abortRef.current?.abort();
    setConversationId(newConversationId());
    setMessages(INITIAL_MESSAGES);
    setDraft("");
    setHistoryOpen(false);
  }
  function openConversation(conversation: StoredConversation) {
    if (isSending) return;
    setConversationId(conversation.id);
    setMessages(conversation.messages.length ? conversation.messages : INITIAL_MESSAGES);
    setHistoryOpen(false);
  }
  function updateActivity(activity: AgentActivity) {
    setLiveActivities((current) => {
      const index = current.findIndex((item) => item.id === activity.id);
      if (index < 0) return [...current, activity];
      return current.map((item, itemIndex) => itemIndex === index ? activity : item);
    });
  }
  async function send(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || isSending || !memoryReady || !conversationId) return;
    const history = messages.map((message) => ({ role: message.role, text: message.text }));
    const nextId = (messages.at(-1)?.id ?? 0) + 1;
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((current) => [...current, { id: nextId, role: "user", text: cleanQuestion, createdAt: new Date().toISOString(), actorId: DEMO_ACTOR.id }]);
    setDraft(""); setLiveActivities([]); setIsSending(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://127.0.0.1:8787/api/chat";
      const response = await fetch(baseUrl.replace(/\/api\/chat$/, "/api/chat/stream"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: cleanQuestion, mode, history, conversationId, actor: DEMO_ACTOR }), signal: controller.signal });
      const payload = await readStream(response, updateActivity);
      setMessages((current) => [...current, { id: nextId + 1, role: "assistant", text: payload.answer, createdAt: new Date().toISOString(), actorId: "agent-haiku", tool: `${payload.model?.includes("haiku") ? "Claude Haiku" : "Claude"} · ${payload.tool}`, sources: payload.sources, warnings: payload.warnings, activities: payload.activities, artifacts: payload.artifacts, quotes: payload.quotes, recentQuotes: payload.recentQuotes, skills: payload.skills, usage: payload.usage }]);
    } catch (error) {
      const interrupted = error instanceof DOMException && error.name === "AbortError";
      setMessages((current) => [...current, { id: nextId + 1, role: "assistant", text: interrupted ? "Elaborazione interrotta. Puoi riformulare la domanda quando vuoi." : (error instanceof Error ? error.message : "Impossibile contattare l’agente."), createdAt: new Date().toISOString(), actorId: "agent-haiku", tool: interrupted ? "Richiesta interrotta" : "Connessione non disponibile", warnings: interrupted ? [] : ["Controlla che l’orchestratore e il servizio pandas siano avviati."] }]);
    } finally { abortRef.current = null; setIsSending(false); setLiveActivities([]); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send(draft); }
  async function copyAnswer(message: Message) { await navigator.clipboard.writeText(message.text); setCopiedMessage(message.id); window.setTimeout(() => setCopiedMessage(null), 1_500); }

  return <main className="agent-shell">
    <aside className="sidebar">
      <div className="brand-block"><Image className="brand-logo" src="/brand/logo-neg@2x.png" alt="Wood Revive — Ridiamo vita al legno antico" width={801} height={135} priority /><p className="brand-product">Insight agent</p></div>
      <nav className="primary-nav" aria-label="Navigazione principale"><button className="nav-item active" type="button"><span>✦</span> Assistente</button><a className="nav-item manager-switch" href="http://localhost:5174/"><span>▦</span> Gestionale demo <b>↗</b></a><button className="nav-item" type="button"><span>▤</span> Knowledge base</button><button className="nav-item" type="button"><span>⌁</span> Analisi salvate</button></nav>
      <div className="sidebar-spacer" />
      <section className="system-card" aria-label="Stato dei servizi"><p className="eyebrow">SISTEMA</p><div><span className="status-dot" /> Claude Haiku attivo</div><div><span className="status-dot" /> Wiki connessa</div><div><span className="status-dot" /> Pandas connesso</div><div><span className="status-dot planned" /> ChromaDB prossimo</div></section>
      <div className="privacy-note"><span aria-hidden="true">⌾</span><p><strong>Ambiente dimostrativo</strong><br />Solo dati anonimi</p></div>
    </aside>
    <section className="workspace">
      <header className="workspace-header"><div><p className="eyebrow">SALES &amp; OPERATIONS</p><h1>Assistente operativo</h1></div><div className="header-meta"><button className="header-memory-link" onClick={() => setHistoryOpen((open) => !open)} type="button">◷ Cronologia <small>{conversations.length}</small></button><a className="header-manager-link" href="http://localhost:5174/">▦ Gestionale</a><span className="live-pill"><span className="status-dot" /> Agente reale · Haiku</span><div className="avatar" aria-label="WoodRevive"><Image src="/brand/favicon-192.png" alt="" width={192} height={192} /></div></div></header>
      {historyOpen && <section className="history-panel" aria-label="Cronologia conversazioni"><header><div><p className="eyebrow">MEMORIA LOCALE</p><h2>Cronologia chat</h2><p>{DEMO_ACTOR.displayName} · salvata in questo browser</p></div><button onClick={startNewConversation} type="button">＋ Nuova chat</button></header><div className="history-list">{conversations.map((conversation) => <button className={conversation.id === conversationId ? "active" : ""} disabled={isSending} key={conversation.id} onClick={() => openConversation(conversation)} type="button"><span><strong>{conversation.title}</strong><small>{conversation.messages.filter((message) => message.role === "user").length} richieste · {new Date(conversation.updatedAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</small></span><b>{conversation.id === conversationId ? "Aperta" : "Apri"}</b></button>)}</div>{!conversations.length && <p className="history-empty">La prima conversazione verrà salvata automaticamente.</p>}</section>}
      <div className="mode-panel"><div><p className="mode-title">Modalità di risposta</p><p className="mode-note">{activeMode.note}</p></div><div className="mode-memory"><span><i className="status-dot" /> Memoria locale attiva</span><button onClick={startNewConversation} type="button">＋ Nuova</button></div><div className="mode-switch" role="group" aria-label="Modalità di risposta">{MODES.map((item) => <button className={mode === item.id ? "selected" : ""} key={item.id} onClick={() => setMode(item.id)} type="button">{item.label}</button>)}</div></div>
      {memoryWarning && <p className="memory-warning">ⓘ {memoryWarning}</p>}
      <section className="conversation" aria-live="polite">
        <div className="date-divider"><span>OGGI</span></div>
        {messages.map((message) => <article className={`message-row ${message.role}`} key={message.id}>{message.role === "assistant" && <div className="assistant-icon" aria-hidden="true">✦</div>}<div className="message-wrap">
          {message.tool && <p className="tool-label">{message.tool}</p>}
          {message.skills && message.skills.length > 0 && <div className="skill-pills" aria-label="Skill aziendali attive">{message.skills.map((skill) => <span key={skill.id} title={skill.description}>◆ {skill.label}</span>)}</div>}
          <div className="message-bubble"><RichText text={message.text} /></div>
          {message.quotes?.map((quote) => <QuoteCard quote={quote} key={quote.id} />)}
          {message.recentQuotes?.map((artifact, artifactIndex) => <RecentQuotesCard artifact={artifact} key={`${artifact.referenceDate}-${artifactIndex}`} />)}
          {message.artifacts?.map((artifact, artifactIndex) => <AnalysisCard artifact={artifact} key={`${artifact.operation}-${artifactIndex}`} />)}
          {message.activities && message.activities.length > 0 && <ActivityPanel activities={message.activities} />}
          {message.sources && <SourcePanel sources={message.sources} />}
          {message.warnings?.map((warning) => <p className="message-warning" key={warning}>ⓘ {warning}</p>)}
          {message.role === "assistant" && message.id > 1 && <div className="message-actions"><button type="button" onClick={() => void copyAnswer(message)}>{copiedMessage === message.id ? "✓ Copiato" : "□ Copia risposta"}</button>{message.usage && <span>{numberFormatter.format(message.usage.inputTokens + message.usage.outputTokens)} token</span>}</div>}
        </div></article>)}
        {isSending && <article className="message-row assistant"><div className="assistant-icon processing" aria-hidden="true">✦</div><div className="message-wrap live-work"><ActivityPanel activities={liveActivities} live /></div></article>}
        <div ref={conversationEnd} />
      </section>
      <footer className="composer-area">
        <div className="suggestions" aria-label="Domande suggerite">{SUGGESTIONS.map((suggestion) => <button disabled={isSending || !memoryReady} key={suggestion} onClick={() => void send(suggestion)} type="button">{suggestion}</button>)}</div>
        <form className="composer" onSubmit={submit}><label className="sr-only" htmlFor="question">Scrivi una domanda</label><textarea disabled={!memoryReady} id="question" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(draft); } }} placeholder="Chiedi alla Wiki o analizza i dati…" rows={2} value={draft} />{isSending ? <button className="stop-button" onClick={() => abortRef.current?.abort()} type="button" aria-label="Interrompi elaborazione">■</button> : <button className="send-button" disabled={!draft.trim() || !memoryReady} type="submit" aria-label="Invia domanda">↑</button>}</form>
        <p className="composer-hint"><span className="status-dot" /> Chat salvata per {DEMO_ACTOR.displayName} · dati demo · attività in tempo reale</p>
      </footer>
    </section>
  </main>;
}
