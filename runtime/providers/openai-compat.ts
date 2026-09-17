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
    // perkiraan kasar 4 karakter per token, cukup untuk menjaga jatah
    const estIn = Math.ceil((req.system.length + req.messages.reduce((s, m) => s + m.content.length, 0)) / 4);
    await this.limiter.acquire(estIn + req.maxTokens);

    const body = JSON.stringify({
      model,
      messages: [{ role: "system", content: req.system }, ...req.messages],
      temperature: req.temperature,
      max_tokens: req.maxTokens,
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
          choices: { message: { content: string } }[];
          usage?: { prompt_tokens: number; completion_tokens: number };
        };
        const usage = j.usage ?? { prompt_tokens: estIn, completion_tokens: 0 };
        this.limiter.record(usage.prompt_tokens + usage.completion_tokens);
        return {
          text: j.choices[0]?.message?.content ?? "",
          model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
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
