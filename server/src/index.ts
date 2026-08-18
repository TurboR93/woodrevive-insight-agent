import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ChatRequest, ChatResponse } from "./contracts/chat.js";
import { createHeuristicPlan } from "./router/heuristic-planner.js";

const port = Number(process.env.PORT ?? 8787);

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
  return typeof (value as { message?: unknown }).message === "string";
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return json(response, 204, {});
  if (request.method === "GET" && request.url === "/health") {
    return json(response, 200, { status: "ok", provider: "heuristic-mock" });
  }

  if (request.method === "POST" && request.url === "/api/chat") {
    try {
      const body = await readJson(request);
      if (!isChatRequest(body) || !body.message.trim()) {
        return json(response, 400, { error: "Il campo message è obbligatorio." });
      }

      const plan = createHeuristicPlan(body);
      const result: ChatResponse = {
        answer: "Piano creato. I connettori Wiki, RAG e pandas saranno collegati nelle prossime fasi.",
        plan,
        tool: plan.intent === "data" ? "pandas" : plan.documentStrategy,
        sources: [],
        warnings: ["Risposta del provider mock: nessuna fonte è stata ancora interrogata."],
      };
      return json(response, 200, result);
    } catch {
      return json(response, 400, { error: "Corpo JSON non valido." });
    }
  }

  return json(response, 404, { error: "Endpoint non trovato." });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`WoodRevive orchestrator: http://127.0.0.1:${port}`);
});
