export type AnthropicTextBlock = { type: "text"; text: string };
export type AnthropicToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AnthropicTool {
  name: string;
  description: string;
  strict?: boolean;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export type AnthropicMessageInput = {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>> | AnthropicContentBlock[];
};

type ToolChoice =
  | { type: "auto" | "any" | "none"; disable_parallel_tool_use?: boolean }
  | { type: "tool"; name: string; disable_parallel_tool_use?: boolean };

export class AnthropicError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AnthropicError";
  }
}

export class AnthropicProvider {
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
  ) {
    this.model = model;
  }

  async createMessage(input: {
    system: string;
    messages: AnthropicMessageInput[];
    tools?: AnthropicTool[];
    toolChoice?: ToolChoice;
    maxTokens?: number;
  }): Promise<AnthropicMessage> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: input.maxTokens ?? 1200,
        temperature: 0.1,
        system: input.system,
        messages: input.messages,
        ...(input.tools ? { tools: input.tools } : {}),
        ...(input.toolChoice ? { tool_choice: input.toolChoice } : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const payload = await response.json() as AnthropicMessage | {
      error?: { message?: string };
    };
    if (!response.ok) {
      const detail = "error" in payload ? payload.error?.message : undefined;
      throw new AnthropicError(detail || `Anthropic API: HTTP ${response.status}`, response.status);
    }
    return payload as AnthropicMessage;
  }
}
