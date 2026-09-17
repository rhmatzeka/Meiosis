/**
 * Klien untuk penyedia ber-API kompatibel OpenAI. Groq dan OpenRouter keduanya
 * masuk kategori ini, sehingga satu implementasi cukup untuk keduanya.
 */
import type { ChatRequest, ChatResult, ModelTier, Provider } from "./types";
import { RateLimiter } from "./ratelimit";

export interface CompatConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: Record<ModelTier, string>;
  maxRpm: number;
  maxTpm: number;
  /**
   * Batas token keluaran per request yang diterima penyedia.
   *
   * Genome boleh meminta 8.000 token; kalau penyedia menolaknya, itu urusan
   * penyedia dan diselesaikan DI SINI. Menurunkan angka di genome demi menuruti
   * batas free tier akan mengubah manifestHash setiap agent yang pernah lahir.
   * Lihat PLAN.md §8.1.
   */
  maxOutputTokens?: number;
}

const RETRIABLE = new Set([408, 429, 500, 502, 503, 504]);

export class OpenAICompatProvider implements Provider {
  readonly name: string;
  private readonly limiter: RateLimiter;

  constructor(private readonly cfg: CompatConfig) {
    this.name = cfg.name;
    this.limiter = new RateLimiter(cfg.maxRpm, cfg.maxTpm);
  }

  modelFor(tier: ModelTier): string {
    return this.cfg.models[tier];
  }

  async chat(tier: ModelTier, req: ChatRequest): Promise<ChatResult> {
    const model = this.modelFor(tier);
    const cap = this.cfg.maxOutputTokens ?? Number.POSITIVE_INFINITY;
    const maxTokens = Math.min(req.maxTokens, cap);
    const clamped = maxTokens < req.maxTokens;

    // perkiraan kasar 4 karakter per token, cukup untuk menjaga jatah
    const estIn = Math.ceil((req.system.length + req.messages.reduce((s, m) => s + m.content.length, 0)) / 4);
    await this.limiter.acquire(estIn + maxTokens);

    // Pesan diterjemahkan ke bentuk OpenAI: tool call hidup di assistant,
    // hasilnya dikembalikan sebagai pesan ber-role "tool".
    const messages: Record<string, unknown>[] = [{ role: "system", content: req.system }];
    for (const m of req.messages) {
      if (m.role === "tool") {
        messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
      } else if (m.toolCalls?.length) {
        messages.push({
          role: m.role, content: m.content || null,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id, type: "function",
            function: { name: c.name, arguments: c.arguments },
          })),
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const body = JSON.stringify({
      model,
      messages,
      temperature: req.temperature,
      max_tokens: maxTokens,
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
            tool_choice: "auto",
          }
        : {}),
    });

    let lastErr = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
        body,
      });

      if (res.ok) {
        const j = (await res.json()) as {
          choices: {
            message: {
              content: string | null;
              tool_calls?: { id: string; function: { name: string; arguments: string } }[];
            };
            finish_reason?: string;
          }[];
          usage?: { prompt_tokens: number; completion_tokens: number };
        };
        const usage = j.usage ?? { prompt_tokens: estIn, completion_tokens: 0 };
        this.limiter.record(usage.prompt_tokens + usage.completion_tokens);
        const choice = j.choices[0];
        return {
          text: choice?.message?.content ?? "",
          model,
          toolCalls: choice?.message?.tool_calls?.map((c) => ({
            id: c.id, name: c.function.name, arguments: c.function.arguments,
          })),
          finishReason: choice?.finish_reason,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          maxTokensClamped: clamped ? { requested: req.maxTokens, used: maxTokens } : undefined,
        };
      }

      lastErr = `${res.status} ${await res.text().catch(() => "")}`.slice(0, 200);
      if (!RETRIABLE.has(res.status)) break;

      // hormati Retry-After kalau ada, kalau tidak mundur eksponensial
      const ra = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, backoff));
    }
    throw new Error(`${this.name} gagal setelah beberapa percobaan: ${lastErr}`);
  }

  stats() {
    return this.limiter.stats();
  }
}
