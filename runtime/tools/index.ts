/**
 * Tool yang tersedia bagi agent, dan siapa yang boleh memakainya.
 *
 * Akses tool ditentukan genome, bukan konfigurasi global. Sampai sekarang lokus
 * TOOL_TIER dan MCP_SET_A/B tersimpan on-chain tanpa pernah berpengaruh pada
 * apa pun — di sinilah keduanya akhirnya berarti.
 */
import type { ToolSpec } from "../providers";
import type { Workspace } from "./workspace";
import type { Manifest } from "../genome/expand";
import { LOCUS } from "../../packages/shared/src/genome";

export interface ToolContext {
  ws: Workspace;
  /** Bertambah tiap kali agent menjalankan pemeriksaan; dipakai membatasi biaya. */
  checks: number;
  maxChecks: number;
  onEvent?: (e: { tool: string; arg: string; result: string }) => void;
}

export interface Tool {
  spec: ToolSpec;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

const TOOLS: Record<string, Tool> = {
  list_files: {
    spec: {
      name: "list_files",
      description: "Daftar semua berkas di tempat kerja.",
      parameters: { type: "object", properties: {} },
    },
    async run(_a, ctx) {
      return ctx.ws.list().join("\n") || "(kosong)";
    },
  },

  read_file: {
    spec: {
      name: "read_file",
      description: "Baca isi satu berkas.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "mis. src/App.tsx" } },
        required: ["path"],
      },
    },
    async run(a, ctx) {
      return ctx.ws.read(String(a.path));
    },
  },

  write_file: {
    spec: {
      name: "write_file",
      description: "Tulis berkas, menimpa isi lamanya. Hanya src/, public/, dan index.html.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string", description: "isi berkas selengkapnya" },
        },
        required: ["path", "content"],
      },
    },
    async run(a, ctx) {
      const p = ctx.ws.write(String(a.path), String(a.content ?? ""));
      return `tertulis ${p} (${String(a.content ?? "").length} karakter)`;
    },
  },

  run_check: {
    spec: {
      name: "run_check",
      description:
        "Jalankan typecheck dan build atas kode di tempat kerja. " +
        "Kembaliannya berisi galat kalau ada, sehingga bisa diperbaiki lalu dijalankan lagi.",
      parameters: { type: "object", properties: {} },
    },
    async run(_a, ctx) {
      if (ctx.checks >= ctx.maxChecks) {
        return `batas pemeriksaan tercapai (${ctx.maxChecks}). Selesaikan dengan kode yang ada sekarang.`;
      }
      ctx.checks++;
      const r = await ctx.ws.check({ quick: true });

      if (r.timedOut) return "pemeriksaan melewati batas waktu.";
      const lines: string[] = [
        `typecheck: ${r.typecheckOk ? "LOLOS" : "GAGAL"}`,
        `build: ${r.buildOk ? "LOLOS" : "GAGAL"}`,
      ];
      if (!r.typecheckOk || !r.buildOk) {
        const errs = r.buildLog
          .split("\n")
          .filter((l) => /error|Error|TS\d+/.test(l))
          .slice(0, 12);
        lines.push("", "galat:", ...errs);
      } else {
        lines.push("", "Kode sudah bersih. Kalau pekerjaan selesai, panggil finish.");
      }
      return lines.join("\n");
    },
  },

  finish: {
    spec: {
      name: "finish",
      description: "Nyatakan pekerjaan selesai. Panggil ini setelah run_check lolos.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string", description: "ringkasan singkat apa yang dikerjakan" } },
        required: ["summary"],
      },
    },
    async run(a) {
      return String(a.summary ?? "selesai");
    },
  },
};

/**
 * Tool apa yang boleh dipakai agent ini, menurut genome-nya.
 *
 * - list_files dan read_file selalu ada; tanpa keduanya agent buta.
 * - write_file butuh TOOL_TIER minimal standard.
 * - run_check butuh TOOL_TIER full ATAU MCP_SET_A yang memuat build.
 *
 * Agent dengan TOOL_TIER basic tetap bisa bekerja, tapi hanya sekali jalan —
 * dan itu memang konsekuensi genomenya, bukan keterbatasan sistem.
 */
export function toolsFor(manifest: Manifest): Tool[] {
  const trait = (locus: number) => manifest.traits[locus]?.traitId ?? 0;
  const tier = trait(LOCUS.TOOL_TIER);       // 0 basic, 1 standard, 2 full
  const mcpA = trait(LOCUS.MCP_SET_A);       // 0 none, 1 build, 2 fs, 3 build+fs

  const out: Tool[] = [TOOLS.list_files, TOOLS.read_file];
  if (tier >= 1) out.push(TOOLS.write_file);
  if (tier >= 2 || mcpA === 1 || mcpA === 3) out.push(TOOLS.run_check);
  out.push(TOOLS.finish);
  return out;
}

export { TOOLS };
