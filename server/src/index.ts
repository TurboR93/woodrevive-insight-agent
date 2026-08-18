import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ChatRequest, ChatResponse } from "./contracts/chat.js";
import { runAgent } from "./agent/orchestrator.js";
import { AnthropicError, AnthropicProvider } from "./providers/llm.js";

const port = Number(process.env.ORCHESTRATOR_PORT ?? process.env.PORT ?? 8787);

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://localhost:3000",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isChatRequest(value: unknown): value is ChatRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { message?: unknown; mode?: unknown; history?: unknown };
  if (typeof candidate.message !== "string" || candidate.message.length > 8_000) return false;
  if (candidate.mode !== undefined && !["auto", "rag", "wiki", "data", "compare"].includes(String(candidate.mode))) return false;
  return candidate.history === undefined || Array.isArray(candidate.history);
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return json(response, 204, {});
  if (request.method === "GET" && request.url === "/health") {
    const configured = Boolean(process.env.ANTHROPIC_API_KEY);
    let analytics = false;
    try {
      const result = await fetch(`${process.env.ANALYTICS_URL || "http://127.0.0.1:8001"}/health`, {
        signal: AbortSignal.timeout(1_500),
      });
      analytics = result.ok;
    } catch {
      analytics = false;
    }
    return json(response, configured ? 200 : 503, {
      status: configured ? "ok" : "configuration_required",
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      tools: { wiki: true, ragCorpus: true, pandas: analytics },
    });
  }

  if (request.method === "POST" && request.url === "/api/chat") {
    try {
      const body = await readJson(request);
      if (!isChatRequest(body) || !body.message.trim()) {
        return json(response, 400, { error: "Il campo message è obbligatorio." });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return json(response, 503, { error: "ANTHROPIC_API_KEY non configurata nel server." });
      const provider = new AnthropicProvider(apiKey);
      const result: ChatResponse = await runAgent(body, provider);
      return json(response, 200, result);
    } catch (error) {
      console.error("Chat error:", error instanceof Error ? error.message : "unknown");
      if (error instanceof SyntaxError) return json(response, 400, { error: "Corpo JSON non valido." });
      if (error instanceof AnthropicError) {
        return json(response, 502, { error: `Claude Haiku non disponibile: ${error.message}` });
      }
      return json(response, 500, { error: error instanceof Error ? error.message : "Errore interno dell'agente." });
    }
  }

  return json(response, 404, { error: "Endpoint non trovato." });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`WoodRevive orchestrator: http://127.0.0.1:${port}`);
});
