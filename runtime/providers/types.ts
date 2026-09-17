export type ModelTier = "fast" | "balanced" | "strong";

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema untuk argumen */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Argumen mentah; loop yang mem-parse dan memvalidasinya. */
  arguments: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Diisi pada pesan assistant yang meminta pemanggilan tool. */
  toolCalls?: ToolCall[];
  /** Diisi pada pesan role "tool": menjawab toolCall dengan id ini. */
  toolCallId?: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  /** Kalau diisi, model boleh meminta pemanggilan tool. */
  tools?: ToolSpec[];
}

export interface ChatResult {
  text: string;
  /** Model konkret yang benar-benar dipakai. Masuk kuitansi run, bukan manifest. */
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Terisi bila model meminta tool dijalankan, bukan menjawab langsung. */
  toolCalls?: ToolCall[];
  finishReason?: string;
  /** Terisi bila penyedia tidak sanggup memenuhi maxTokens yang diminta genome. */
  maxTokensClamped?: { requested: number; used: number };
}

export interface Provider {
  readonly name: string;
  modelFor(tier: ModelTier): string;
  chat(tier: ModelTier, req: ChatRequest): Promise<ChatResult>;
}
