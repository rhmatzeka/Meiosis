export type ModelTier = "fast" | "balanced" | "strong";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}

export interface ChatResult {
  text: string;
  /** Model konkret yang benar-benar dipakai. Masuk kuitansi run, bukan manifest. */
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Terisi bila penyedia tidak sanggup memenuhi maxTokens yang diminta genome. */
  maxTokensClamped?: { requested: number; used: number };
}

export interface Provider {
  readonly name: string;
  modelFor(tier: ModelTier): string;
  chat(tier: ModelTier, req: ChatRequest): Promise<ChatResult>;
}
