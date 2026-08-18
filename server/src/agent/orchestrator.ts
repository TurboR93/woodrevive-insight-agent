import type {
  AgentActivity,
  AnalysisArtifact,
  ChatRequest,
  ChatResponse,
  DataOperation,
  DocumentStrategy,
  SourceReference,
  ToolPlan,
} from "../contracts/chat.js";
import {
  AnthropicProvider,
  type AnthropicContentBlock,
  type AnthropicMessageInput,
  type AnthropicTool,
  type AnthropicToolUseBlock,
} from "../providers/llm.js";
import { analyzeData, DATA_OPERATIONS, type DataOperationName } from "../tools/analytics.js";
import { readWiki, searchRagCorpus, searchWiki, type ToolEvidence } from "../tools/knowledge.js";

const tools: AnthropicTool[] = [
  {
    name: "wiki_search",
    description: "Esplora l'indice della Wiki usando titoli, tag, sinonimi, intestazioni, riassunti e collegamenti. È il primo passo per una domanda documentale; dopo i candidati usa wiki_read.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { question: { type: "string", description: "Domanda documentale da cercare nella Wiki." } },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "wiki_read",
    description: "Apre da una a quattro pagine scelte dall'indice Wiki e recupera le sezioni più pertinenti. Usalo dopo wiki_search; puoi ripetere la lettura o tornare alla ricerca se l'evidenza non basta.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        slugs: { type: "array", items: { type: "string" }, description: "Slug esatti restituiti da wiki_search." },
        focus: { type: "string", description: "Aspetto preciso da approfondire nelle pagine." },
      },
      required: ["slugs", "focus"],
      additionalProperties: false,
    },
  },
  {
    name: "rag_search",
    description: "Recupera sezioni pertinenti dal corpus RAG parallelo alla Wiki. Usalo quando è richiesta la modalità RAG o un confronto RAG/Wiki.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { question: { type: "string", description: "Domanda da usare nel retrieval del corpus." } },
      required: ["question"],
      additionalProperties: false,
    },
  },
  {
    name: "analyze_data",
    description: "Esegue un'analisi pandas deterministica sui CSV demo WoodRevive. Scegli l'operazione più vicina alla domanda. Usalo per numeri, KPI, classifiche, esposizione, acquisti, evasione e magazzino.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: DATA_OPERATIONS,
          description: "sales_summary=fatturato totale; margin_by_category=margini; slow_stock=stock fermo; customer_exposure=crediti/scaduti; transaction_volume=eventi mensili; supplier_spend=acquisti fornitori; order_fulfillment=evasione ordini.",
        },
        minimum_days: { type: "integer", description: "Soglia positiva in giorni, normalmente 180." },
        as_of: { type: "string", description: "Data di analisi nel formato YYYY-MM-DD." },
      },
      required: ["operation"],
      additionalProperties: false,
    },
  },
];

const SYSTEM_PROMPT = `Sei WoodRevive Insight, agente operativo Sales & Operations.
Rispondi in italiano e usa almeno uno strumento prima della risposta. Continua a usare strumenti finché l'evidenza è sufficiente, poi rispondi senza altre chiamate.
La Wiki è la fonte canonica per procedure e definizioni. Navigala in due fasi: wiki_search per orientarti, poi wiki_read sulle pagine scelte. Segui collegamenti e fai una seconda ricerca se necessario.
I numeri provengono soltanto dal tool pandas. Per domande ibride usa la navigazione Wiki e analyze_data. Per confrontare RAG e Wiki usa rag_search e la navigazione Wiki.
Non inventare policy, valori o fatti. Se le evidenze non bastano, dichiaralo.
Mantieni rigorosamente distinti: giacenza fisica = carichi - scarichi; impegnato = quantità promessa; disponibilità commerciale = giacenza - impegnato.
Tutti i dati sono sintetici: ricordalo quando presenti risultati numerici.
Nella risposta finale sii chiaro e operativo. Per i numeri indica periodo, formula/metodo e unità; converti i centesimi in euro leggibili.
Non citare conoscenze generiche del modello come se fossero documentazione WoodRevive.`;

type ActivityReporter = (activity: AgentActivity) => void | Promise<void>;

function activityFor(call: AnthropicToolUseBlock, status: AgentActivity["status"]): AgentActivity {
  const operation = typeof call.input.operation === "string" ? call.input.operation : "analisi richiesta";
  const slugs = Array.isArray(call.input.slugs) ? call.input.slugs.filter((slug) => typeof slug === "string").join(", ") : "";
  if (call.name === "wiki_search") return {
    id: call.id, kind: "wiki", status,
    title: "Esplorazione della Wiki",
    detail: status === "running" ? "Cerco pagine, tag e collegamenti pertinenti." : "Indice Wiki consultato e candidati selezionati.",
  };
  if (call.name === "wiki_read") return {
    id: call.id, kind: "wiki", status,
    title: "Lettura delle pagine",
    detail: status === "running" ? `Apro le sezioni utili${slugs ? `: ${slugs}` : ""}.` : "Sezioni rilevanti acquisite dalla Wiki.",
  };
  if (call.name === "rag_search") return {
    id: call.id, kind: "rag", status,
    title: "Ricerca nel corpus RAG",
    detail: status === "running" ? "Recupero i passaggi più affini alla domanda." : "Passaggi documentali recuperati dal corpus.",
  };
  return {
    id: call.id, kind: "pandas", status,
    title: "Analisi dei dati",
    detail: status === "running" ? `Pandas sta eseguendo: ${operation}.` : `Calcolo ${operation} completato sui CSV demo.`,
  };
}

function toolChoiceFor(request: ChatRequest) {
  if (request.mode === "wiki") return { type: "tool" as const, name: "wiki_search" };
  if (request.mode === "rag") return { type: "tool" as const, name: "rag_search" };
  if (request.mode === "data") return { type: "tool" as const, name: "analyze_data" };
  return { type: "any" as const, disable_parallel_tool_use: false };
}

function buildConversation(request: ChatRequest): AnthropicMessageInput[] {
  const previous = (request.history || [])
    .filter((message) => message.text.trim())
    .slice(-6)
    .map((message) => ({ role: message.role, content: message.text.slice(0, 4_000) }));
  while (previous[0]?.role === "assistant") previous.shift();
  const normalized: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of previous) {
    const last = normalized.at(-1);
    if (last?.role === message.role) last.content += `\n\n${message.content}`;
    else normalized.push(message);
  }
  normalized.push({ role: "user", content: request.message });
  return normalized;
}

function asToolUse(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return block.type === "tool_use";
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

async function executeTool(call: AnthropicToolUseBlock, question: string): Promise<{
  evidence: ToolEvidence;
  isError: boolean;
}> {
  try {
    if (call.name === "wiki_search") {
      return { evidence: await searchWiki(safeString(call.input.question, question)), isError: false };
    }
    if (call.name === "wiki_read") {
      const slugs = Array.isArray(call.input.slugs) ? call.input.slugs.filter((slug): slug is string => typeof slug === "string") : [];
      return { evidence: await readWiki(slugs, safeString(call.input.focus, question)), isError: false };
    }
    if (call.name === "rag_search") {
      return { evidence: await searchRagCorpus(safeString(call.input.question, question)), isError: false };
    }
    if (call.name === "analyze_data") {
      const operation = safeString(call.input.operation, "sales_summary") as DataOperationName;
      return {
        evidence: await analyzeData({
          operation,
          minimum_days: typeof call.input.minimum_days === "number" ? call.input.minimum_days : undefined,
          as_of: typeof call.input.as_of === "string" ? call.input.as_of : undefined,
        }),
        isError: false,
      };
    }
    throw new Error(`Strumento sconosciuto: ${call.name}`);
  } catch (error) {
    return {
      evidence: {
        content: error instanceof Error ? error.message : "Errore strumento non identificato.",
        sources: [],
        warnings: ["Uno strumento richiesto non ha completato l'esecuzione."],
      },
      isError: true,
    };
  }
}

function documentStrategy(names: string[]): DocumentStrategy {
  if (names.includes("wiki_search") && names.includes("rag_search")) return "compare";
  if (names.includes("rag_search")) return "rag";
  if (names.includes("wiki_search") || names.includes("wiki_read")) return "wiki";
  return "none";
}

function dataOperation(name?: string): DataOperation {
  if (name === "transaction_volume") return "trend";
  if (["margin_by_category", "supplier_spend", "order_fulfillment"].includes(name || "")) return "ranking";
  if (name === "slow_stock") return "anomaly";
  return name ? "aggregation" : "none";
}

function uniqueSources(sources: SourceReference[]): SourceReference[] {
  return [...new Map(sources.map((source) => [`${source.kind}:${source.locator}`, source])).values()];
}

export async function runAgent(
  request: ChatRequest,
  provider: AnthropicProvider,
  reportActivity?: ActivityReporter,
): Promise<ChatResponse> {
  const messageLog = buildConversation(request);
  const requiresCompare = request.mode === "compare"
    || /confronta(?:re)?\s+(?:la\s+)?(?:risposta\s+)?rag.*wiki|wiki.*rag/i.test(request.message);
  const modeInstruction = requiresCompare
    ? "Per questa richiesta devi chiamare sia wiki_search sia rag_search."
    : `Modalità richiesta: ${request.mode || "auto"}.`;
  const allCalls: AnthropicToolUseBlock[] = [];
  const allExecutions: Array<{ evidence: ToolEvidence; isError: boolean }> = [];
  const activities: AgentActivity[] = [];
  const report = async (activity: AgentActivity) => {
    const index = activities.findIndex((item) => item.id === activity.id);
    if (index >= 0) activities[index] = activity;
    else activities.push(activity);
    await reportActivity?.(activity);
  };
  let inputTokens = 0;
  let outputTokens = 0;
  let answer = "";

  await report({
    id: "routing", kind: "routing", status: "running",
    title: "Interpretazione della richiesta",
    detail: "Haiku sta scegliendo il percorso e gli strumenti più adatti.",
  });

  for (let step = 0; step < 5; step += 1) {
    const response = await provider.createMessage({
      system: `${SYSTEM_PROMPT}\n${modeInstruction}`,
      messages: messageLog,
      tools,
      toolChoice: step === 0 ? toolChoiceFor(request) : { type: "auto" },
      maxTokens: step === 0 ? 700 : 1_000,
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    const calls = response.content.filter(asToolUse);
    if (step === 0) await report({
      id: "routing", kind: "routing", status: "complete",
      title: "Percorso definito",
      detail: calls.length
        ? `Haiku ha selezionato ${[...new Set(calls.map((call) => call.name))].join(", ")}.`
        : "Haiku ha verificato il contesto disponibile.",
    });
    if (!calls.length) {
      const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
      const names = allCalls.map((call) => call.name);
      const mustReadWiki = names.includes("wiki_search") && !names.includes("wiki_read") && request.mode !== "rag";
      const compareIncomplete = requiresCompare && !(names.includes("rag_search") && names.includes("wiki_read"));
      if ((mustReadWiki || compareIncomplete) && step < 4) {
        messageLog.push({ role: "assistant", content: response.content });
        messageLog.push({
          role: "user",
          content: mustReadWiki
            ? "Prima della risposta finale apri con wiki_read le pagine più pertinenti trovate nell'indice."
            : "Completa il confronto: usa sia rag_search sia wiki_search + wiki_read, poi rispondi.",
        });
        continue;
      }
      answer = text;
      break;
    }

    const executions = await Promise.all(calls.map(async (call) => {
      await report(activityFor(call, "running"));
      const execution = await executeTool(call, request.message);
      await report(activityFor(call, execution.isError ? "error" : "complete"));
      return execution;
    }));
    allCalls.push(...calls);
    allExecutions.push(...executions);
    messageLog.push({ role: "assistant", content: response.content });
    messageLog.push({
      role: "user",
      content: calls.map((call, index) => ({
        type: "tool_result",
        tool_use_id: call.id,
        content: executions[index].evidence.content.slice(0, 10_000),
        ...(executions[index].isError ? { is_error: true } : {}),
      })),
    });
  }

  if (!answer) {
    await report({
      id: "response", kind: "response", status: "running",
      title: "Composizione della risposta",
      detail: "Organizzo evidenze, numeri e indicazioni operative.",
    });
    const final = await provider.createMessage({
      system: SYSTEM_PROMPT,
      messages: messageLog,
      tools,
      toolChoice: { type: "none" },
      maxTokens: 1_200,
    });
    inputTokens += final.usage.input_tokens;
    outputTokens += final.usage.output_tokens;
    answer = final.content.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  }
  if (!answer) throw new Error("Claude non ha restituito una risposta testuale.");

  await report({
    id: "response", kind: "response", status: "complete",
    title: "Risposta pronta",
    detail: "Contenuti composti usando soltanto le evidenze raccolte.",
  });

  const names = allCalls.map((call) => call.name);
  const dataCall = allCalls.find((call) => call.name === "analyze_data");
  const hasData = names.includes("analyze_data");
  const hasDocuments = names.some((name) => name === "wiki_search" || name === "wiki_read" || name === "rag_search");
  const plan: ToolPlan = {
    intent: hasData && hasDocuments ? "hybrid" : hasData ? "data" : "documents",
    documentStrategy: documentStrategy(names),
    question: request.message,
    dataOperation: dataOperation(typeof dataCall?.input.operation === "string" ? dataCall.input.operation : undefined),
    filters: dataCall ? Object.fromEntries(Object.entries(dataCall.input).filter(([key]) => key !== "operation")) as Record<string, string | number | boolean> : {},
    confidence: 1,
  };

  return {
    answer,
    plan,
    tool: [...new Set(names.map((name) => name.startsWith("wiki_") ? "wiki" : name === "rag_search" ? "rag" : "pandas"))].join(" + "),
    sources: uniqueSources(allExecutions.flatMap((execution) => execution.evidence.sources)),
    warnings: [...new Set(allExecutions.flatMap((execution) => execution.evidence.warnings))],
    activities,
    artifacts: allExecutions
      .map((execution) => execution.evidence.artifact)
      .filter((artifact): artifact is AnalysisArtifact => Boolean(artifact)),
    model: provider.model,
    usage: {
      inputTokens,
      outputTokens,
    },
  };
}
