import type {
  AgentActivity,
  AnalysisArtifact,
  QuoteArtifact,
  RecentQuotesArtifact,
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
import { createQuoteDraft, listRecentQuotes, searchQuoteCatalog } from "../domain/demo-quotes.js";
import { businessSkillsPrompt, isRecentQuoteLookup, publicBusinessSkills, selectBusinessSkills } from "../skills/business-skills.js";

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
  {
    name: "quote_recent_list",
    description: "Elenca i preventivi demo più recenti, comprese le bozze create dall'agente, con data, cliente, stato, totale e link al dettaglio Manager. Usalo per domande come 'abbiamo preventivi recenti?', 'quali sono gli ultimi preventivi?' o 'mostrami le bozze'. Non usare RAG o Wiki per la cronologia dei preventivi.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Numero di risultati da mostrare, normalmente 8." },
        status: { type: "string", enum: ["all", "bozza", "inviato", "accettato", "rifiutato", "scaduto", "convertito"], description: "Filtro stato; all se non richiesto." },
      },
      required: ["limit", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_catalog_search",
    description: "Cerca clienti e articoli nel catalogo demo prima di preparare un preventivo. Usalo per risolvere nomi, codici, prezzi, unità, IVA, sconto cliente e disponibilità. Non inventare mai gli ID.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        customer_query: { type: "string", description: "Nome, codice, città o ID del cliente; stringa vuota se non indicato." },
        article_query: { type: "string", description: "Nome, codice, categoria, essenza o patina dell’articolo; stringa vuota se non indicato." },
      },
      required: ["customer_query", "article_query"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_create_draft",
    description: "Crea e salva una bozza di preventivo esclusivamente demo con calcoli deterministici compatibili con WoodRevive Manager. Chiamalo solo se l’utente chiede esplicitamente di creare/generare il preventivo e cliente, articoli e quantità sono chiari dopo quote_catalog_search.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "ID esatto del cliente restituito dal catalogo." },
        subject: { type: "string", description: "Oggetto breve e riconoscibile del preventivo." },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              article_id: { type: "string", description: "ID esatto dell’articolo." },
              quantity_milli: { type: "integer", description: "Quantità in millesimi: 12,5 m² = 12500." },
              discount_percent: { type: "number", description: "Sconto riga percentuale, zero se non richiesto." },
            },
            required: ["article_id", "quantity_milli", "discount_percent"],
            additionalProperties: false,
          },
        },
        general_discount_percent: { type: "number", description: "Sconto generale percentuale; usa quello cliente se appropriato." },
        validity_days: { type: "integer", description: "Validità in giorni, normalmente 30." },
        conditions: { type: "string", description: "Condizioni di pagamento." },
        delivery_time: { type: "string", description: "Tempi di consegna." },
        notes: { type: "string", description: "Note commerciali, stringa vuota se assenti." },
      },
      required: ["customer_id", "subject", "lines", "general_discount_percent", "validity_days", "conditions", "delivery_time", "notes"],
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
Non citare conoscenze generiche del modello come se fossero documentazione WoodRevive.
Per creare un preventivo demo usa prima quote_catalog_search. Se mancano cliente, articolo o quantità, chiedili chiaramente senza chiamare quote_create_draft. Se sono presenti e l'utente ha chiesto esplicitamente di creare o generare il preventivo, usa quote_create_draft. Prezzi, IVA, disponibilità e calcoli arrivano soltanto dai tool; non inventarli.
Per consultare preventivi esistenti, recenti, ultimi o in un certo stato usa quote_recent_list. La cronologia dei preventivi è dato strutturato: non cercarla in RAG o Wiki.
Le bozze sono dimostrative ma rispettano ID, snapshot, centesimi, millesimi e arrotondamenti compatibili con WoodRevive Manager.
Non affermare mai che il sistema invia preventivi, email o messaggi al cliente: crea soltanto una bozza locale consultabile nella copia Manager.`;

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
  if (call.name === "quote_catalog_search") return {
    id: call.id, kind: "quote", status,
    title: "Ricerca commerciale",
    detail: status === "running" ? "Cerco cliente, articoli, listino e disponibilità demo." : "Cliente e articoli risolti sul catalogo condiviso.",
  };
  if (call.name === "quote_recent_list") return {
    id: call.id, kind: "quote", status,
    title: "Consultazione preventivi",
    detail: status === "running" ? "Ordino le bozze e i preventivi più recenti." : "Elenco preventivi recuperato dall’archivio demo condiviso.",
  };
  if (call.name === "quote_create_draft") return {
    id: call.id, kind: "quote", status,
    title: "Creazione del preventivo",
    detail: status === "running" ? "Calcolo righe, sconti, IVA, margine e totale." : "Bozza salvata e resa disponibile nel gestionale demo.",
  };
  return {
    id: call.id, kind: "pandas", status,
    title: "Analisi dei dati",
    detail: status === "running" ? `Pandas sta eseguendo: ${operation}.` : `Calcolo ${operation} completato sui CSV demo.`,
  };
}

function toolChoiceFor(request: ChatRequest) {
  if (request.mode === "auto" || request.mode === undefined) {
    if (isRecentQuoteLookup(request.message)) {
      return { type: "tool" as const, name: "quote_recent_list", disable_parallel_tool_use: true };
    }
  }
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

async function executeTool(call: AnthropicToolUseBlock, question: string, context: Pick<ChatRequest, "conversationId" | "actor">): Promise<{
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
    if (call.name === "quote_recent_list") {
      const recentQuotes = await listRecentQuotes({
        limit: Number(call.input.limit || 8),
        status: safeString(call.input.status, "all"),
      });
      return {
        evidence: {
          content: JSON.stringify({
            ...recentQuotes,
            instruction: "Rispondi mostrando i risultati trovati. Non dire che i preventivi non sono disponibili. L’interfaccia presenta già una scheda con link al dettaglio Manager.",
          }, null, 2),
          sources: [
            { kind: "dataset", label: "Storico preventivi demo", locator: "datasets/demo/preventivi.csv" },
            { kind: "dataset", label: "Bozze create dall’agente", locator: "runtime/demo-quote-drafts.json" },
          ],
          warnings: recentQuotes.items.length ? [] : ["Nessun preventivo corrisponde al filtro richiesto."],
          recentQuotes,
        },
        isError: false,
      };
    }
    if (call.name === "quote_catalog_search") {
      return {
        evidence: {
          content: JSON.stringify(await searchQuoteCatalog({
            customer_query: safeString(call.input.customer_query, ""),
            article_query: safeString(call.input.article_query, ""),
          }), null, 2),
          sources: [
            { kind: "dataset", label: "Clienti demo", locator: "datasets/demo/clienti.csv" },
            { kind: "dataset", label: "Articoli demo", locator: "datasets/demo/articoli.csv" },
          ],
          warnings: [],
        },
        isError: false,
      };
    }
    if (call.name === "quote_create_draft") {
      const lines = Array.isArray(call.input.lines) ? call.input.lines.map((line) => ({
        article_id: safeString((line as Record<string, unknown>).article_id, ""),
        quantity_milli: Number((line as Record<string, unknown>).quantity_milli),
        discount_percent: Number((line as Record<string, unknown>).discount_percent || 0),
      })) : [];
      const created = await createQuoteDraft({
        customer_id: safeString(call.input.customer_id, ""),
        subject: safeString(call.input.subject, "Fornitura demo"),
        lines,
        general_discount_percent: Number(call.input.general_discount_percent || 0),
        validity_days: Number(call.input.validity_days || 30),
        conditions: safeString(call.input.conditions, "30% alla conferma, saldo prima della consegna"),
        delivery_time: safeString(call.input.delivery_time, "15–25 giorni dalla conferma"),
        notes: typeof call.input.notes === "string" ? call.input.notes : "",
      }, context);
      return {
        evidence: {
          content: JSON.stringify({
            created: true, quote: created.quote,
            instruction: "Conferma la creazione e riassumi numero, cliente, righe, totale, margine, controlli e link al gestionale demo.",
          }, null, 2),
          sources: [
            { kind: "dataset", label: "Preventivi demo condivisi", locator: "runtime/demo-quote-drafts.json" },
          ],
          warnings: created.warnings,
          quote: created.quote,
        },
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
  const activeSkills = selectBusinessSkills(request.message);
  const skillInstruction = businessSkillsPrompt(activeSkills);
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
  if (activeSkills.length) await report({
    id: "business-skills", kind: "skill", status: "complete",
    title: activeSkills.length === 1 ? "Skill aziendale attivata" : "Skill aziendali attivate",
    detail: activeSkills.map((skill) => skill.label).join(" + "),
  });

  for (let step = 0; step < 5; step += 1) {
    const response = await provider.createMessage({
      system: `${SYSTEM_PROMPT}\n${modeInstruction}\n${skillInstruction}`,
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

    const catalogWasSearched = allCalls.some((call, index) =>
      call.name === "quote_catalog_search" && !allExecutions[index]?.isError,
    );
    const executions = await Promise.all(calls.map(async (call) => {
      await report(activityFor(call, "running"));
      const execution = call.name === "quote_create_draft" && !catalogWasSearched
        ? {
            evidence: {
              content: "Prima di creare la bozza devi usare quote_catalog_search e scegliere gli ID esatti restituiti dal catalogo.",
              sources: [],
              warnings: ["Creazione sospesa: catalogo cliente/articoli non ancora consultato."],
            },
            isError: true,
          }
        : await executeTool(call, request.message, request);
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
      system: `${SYSTEM_PROMPT}\n${skillInstruction}`,
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
  const hasQuote = names.includes("quote_create_draft");
  const hasQuoteLookup = names.includes("quote_recent_list");
  const hasDocuments = names.some((name) => name === "wiki_search" || name === "wiki_read" || name === "rag_search");
  const plan: ToolPlan = {
    intent: hasQuote ? "action" : hasQuoteLookup ? "data" : hasData && hasDocuments ? "hybrid" : hasData ? "data" : "documents",
    documentStrategy: documentStrategy(names),
    question: request.message,
    dataOperation: dataOperation(typeof dataCall?.input.operation === "string" ? dataCall.input.operation : undefined),
    filters: dataCall ? Object.fromEntries(Object.entries(dataCall.input).filter(([key]) => key !== "operation")) as Record<string, string | number | boolean> : {},
    confidence: 1,
  };

  return {
    answer,
    plan,
    tool: [...new Set(names.map((name) => name.startsWith("wiki_") ? "wiki" : name === "rag_search" ? "rag" : name.startsWith("quote_") ? "preventivi" : "pandas"))].join(" + "),
    sources: uniqueSources(allExecutions.flatMap((execution) => execution.evidence.sources)),
    warnings: [...new Set(allExecutions.flatMap((execution) => execution.evidence.warnings))],
    activities,
    artifacts: allExecutions
      .map((execution) => execution.evidence.artifact)
      .filter((artifact): artifact is AnalysisArtifact => Boolean(artifact)),
    quotes: allExecutions
      .map((execution) => execution.evidence.quote)
      .filter((quote): quote is QuoteArtifact => Boolean(quote)),
    recentQuotes: allExecutions
      .map((execution) => execution.evidence.recentQuotes)
      .filter((artifact): artifact is RecentQuotesArtifact => Boolean(artifact)),
    skills: publicBusinessSkills(activeSkills),
    model: provider.model,
    usage: {
      inputTokens,
      outputTokens,
    },
  };
}
