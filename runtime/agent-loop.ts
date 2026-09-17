/**
 * Loop agent: berpikir, memanggil tool, membaca hasilnya, lalu mengulang.
 *
 * Inilah yang membedakan agent dari chatbot. Versi sekali-jalan hanya bisa
 * menebak dan berharap benar; di sini agent menulis kode, menjalankan
 * pemeriksaan, membaca galatnya, dan memperbaiki sampai lolos.
 *
 * Dua lokus genome baru benar-benar hidup di sini:
 *   PERSISTENCE -> maxSteps, berapa lama agent mau bertahan sebelum menyerah
 *   TOOL_TIER   -> tool apa yang boleh ia pakai (lihat tools/index.ts)
 *
 * Batas langkah bukan sekadar pengaman biaya. Agent yang menyerah terlalu cepat
 * meninggalkan kode yang gagal build, dan itu memang perbedaan nyata antar
 * genome yang layak terukur.
 */
import type { Agent } from "./materialize";
import type { Provider, ChatMessage } from "./providers";
import { toolsFor, type Tool, type ToolContext } from "./tools";
import type { Workspace } from "./tools/workspace";

export interface LoopStep {
  step: number;
  kind: "tool" | "message" | "finish" | "limit" | "error";
  tool?: string;
  args?: string;
  result?: string;
  text?: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface LoopResult {
  finished: boolean;
  reason: "finish" | "maxSteps" | "noToolCall" | "error";
  steps: LoopStep[];
  summary: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  checks: number;
  durationMs: number;
}

const PREAMBLE = `
Kamu bekerja di sebuah tempat kerja nyata, bukan menjawab pertanyaan.

Cara kerjamu:
1. Lihat isi tempat kerja dengan list_files, baca yang perlu dengan read_file.
2. Tulis kodemu dengan write_file. Tulis isi berkas SELENGKAPNYA, bukan potongan.
3. Kalau kamu punya run_check, jalankan untuk memastikan kodenya lolos typecheck
   dan build. Kalau gagal, baca galatnya, perbaiki berkasnya, lalu periksa lagi.
4. Panggil finish kalau sudah selesai.

Jangan menjelaskan rencanamu panjang lebar. Langsung pakai tool-nya.
Jangan menaruh kode di dalam jawaban teks — kode hanya masuk lewat write_file.
`.trim();

export async function runAgentLoop(opts: {
  agent: Agent;
  provider: Provider;
  ws: Workspace;
  task: string;
  maxSteps?: number;
  maxChecks?: number;
  onStep?: (s: LoopStep) => void;
}): Promise<LoopResult> {
  const started = performance.now();
  const { agent, provider, ws, task } = opts;

  const tools = toolsFor(agent.manifest);
  const byName = new Map<string, Tool>(tools.map((t) => [t.spec.name, t]));
  const hasCheck = byName.has("run_check");

  const maxSteps = Math.min(opts.maxSteps ?? agent.manifest.params.maxSteps, 24);
  const ctx: ToolContext = { ws, checks: 0, maxChecks: opts.maxChecks ?? 4 };

  const system = `${agent.systemPrompt}\n\n---\n\n${PREAMBLE}${
    hasCheck ? "" : "\n\nCatatan: kamu TIDAK punya run_check, jadi kodemu tidak bisa diuji. Tulis sekali dengan hati-hati."
  }`;

  const messages: ChatMessage[] = [{ role: "user", content: task }];
  const steps: LoopStep[] = [];
  let pIn = 0, pOut = 0;
  let summary = "";
  let reason: LoopResult["reason"] = "maxSteps";
  let finished = false;

  const emit = (s: LoopStep) => { steps.push(s); opts.onStep?.(s); };

  for (let step = 1; step <= maxSteps; step++) {
    let res;
    try {
      res = await provider.chat(agent.manifest.modelTier, {
        system,
        messages,
        temperature: agent.manifest.params.temperature,
        maxTokens: agent.manifest.params.maxTokens,
        tools: tools.map((t) => t.spec),
      });
    } catch (e) {
      emit({ step, kind: "error", text: (e as Error).message.slice(0, 300) });
      reason = "error";
      break;
    }

    pIn += res.promptTokens; pOut += res.completionTokens;

    if (!res.toolCalls?.length) {
      // Model menjawab teks tanpa memanggil tool. Kalau belum ada pekerjaan
      // yang tertulis, dorong sekali; kalau sudah, anggap ia sudah selesai.
      emit({ step, kind: "message", text: res.text.slice(0, 2000), promptTokens: res.promptTokens, completionTokens: res.completionTokens });
      messages.push({ role: "assistant", content: res.text });
      const wrote = steps.some((s) => s.tool === "write_file");
      if (wrote) { summary = res.text.slice(0, 500); reason = "noToolCall"; finished = true; break; }
      messages.push({ role: "user", content: "Pakai tool-nya. Jangan menaruh kode di jawaban teks." });
      continue;
    }

    messages.push({ role: "assistant", content: res.text ?? "", toolCalls: res.toolCalls });

    for (const call of res.toolCalls) {
      const tool = byName.get(call.name);
      let out: string;

      if (!tool) {
        out = `tool "${call.name}" tidak tersedia untukmu. Yang ada: ${[...byName.keys()].join(", ")}`;
      } else {
        try {
          const args = call.arguments ? JSON.parse(call.arguments) : {};
          out = await tool.run(args, ctx);
        } catch (e) {
          out = `galat: ${(e as Error).message}`;
        }
      }

      emit({
        step, kind: call.name === "finish" ? "finish" : "tool",
        tool: call.name,
        args: (call.arguments ?? "").slice(0, 300),
        result: out.slice(0, 1200),
        promptTokens: res.promptTokens, completionTokens: res.completionTokens,
      });

      messages.push({ role: "tool", toolCallId: call.id, content: out.slice(0, 4000) });

      if (call.name === "finish") { summary = out; reason = "finish"; finished = true; }
    }

    if (finished) break;
  }

  if (!finished && reason === "maxSteps") {
    emit({ step: maxSteps, kind: "limit", text: `berhenti di batas ${maxSteps} langkah` });
  }

  return {
    finished, reason, steps, summary,
    totalPromptTokens: pIn, totalCompletionTokens: pOut,
    checks: ctx.checks,
    durationMs: Math.round(performance.now() - started),
  };
}
