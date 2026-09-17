/**
 * Resolusi penyedia. runner hanya tahu `modelTier`; berpindah dari model gratis
 * ke berbayar cukup mengubah satu variabel environment, tanpa menyentuh logika
 * agent mana pun. Lihat PLAN.md §15.4.
 *
 * Nama model konkret sengaja hidup DI SINI dan bukan di manifest — kalau ia
 * masuk manifest, berpindah penyedia akan membatalkan setiap manifestHash yang
 * sudah tercatat on-chain. Lihat PLAN.md §8.1.
 */
import type { Provider } from "./types";
import { OpenAICompatProvider } from "./openai-compat";

export * from "./types";
export { RateLimiter } from "./ratelimit";

export function getProvider(env: Record<string, string | undefined> = process.env): Provider {
  const which = (env.PROVIDER ?? "groq").toLowerCase();
  const maxRpm = Number(env.MAX_RPM ?? 30);
  const maxTpm = Number(env.MAX_TPM ?? 8000);

  switch (which) {
    case "groq":
      return new OpenAICompatProvider({
        name: "groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: req(env.GROQ_API_KEY, "GROQ_API_KEY"),
        models: {
          strong: env.TIER_STRONG ?? "openai/gpt-oss-120b",
          balanced: env.TIER_BALANCED ?? "qwen/qwen3.8-27b",
          fast: env.TIER_FAST ?? "openai/gpt-oss-20b",
        },
        maxRpm, maxTpm,
      });

    case "openrouter":
      return new OpenAICompatProvider({
        name: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: req(env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY"),
        models: {
          strong: req(env.TIER_STRONG, "TIER_STRONG"),
          balanced: req(env.TIER_BALANCED, "TIER_BALANCED"),
          fast: req(env.TIER_FAST, "TIER_FAST"),
        },
        maxRpm, maxTpm,
      });

    default:
      throw new Error(
        `PROVIDER="${which}" belum diimplementasikan. Yang tersedia: groq, openrouter. ` +
        `Gemini dan Anthropic menyusul saat dibutuhkan — antarmukanya sudah siap di types.ts.`,
      );
  }
}

function req(v: string | undefined, name: string): string {
  if (!v) throw new Error(`${name} belum diisi di .env`);
  return v;
}
