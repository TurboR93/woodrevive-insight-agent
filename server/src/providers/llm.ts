import type { ChatRequest, ToolPlan } from "../contracts/chat.js";

/** Contratto indipendente dal provider che verrà scelto nelle fasi successive. */
export interface LlmProvider {
  plan(request: ChatRequest): Promise<ToolPlan>;
  synthesize(input: {
    question: string;
    plan: ToolPlan;
    evidence: string[];
  }): Promise<string>;
}
