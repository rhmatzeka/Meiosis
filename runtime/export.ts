/**
 * Ekspor agent Meiosis ke berkas subagent Claude Code (`.claude/agents/*.md`).
 *
 * Inilah bentuk "barang jadi" dari sebuah perkawinan: satu berkas teks yang
 * bisa diunduh siapa pun dan langsung dipakai di proyeknya sendiri, tanpa
 * server Meiosis, tanpa chain, dan tanpa kunci model milik kita.
 *
 * Isinya diturunkan murni dari genome lewat expand(), jadi siapa pun bisa
 * membuktikan berkas itu asli dengan `bun run verify-agent <berkas>`: genome
 * dibaca ulang dari chain, dirakit ulang, lalu dibandingkan byte per byte.
 */
import { expand, manifestHash, systemPrompt, type ModelTier } from "./genome/expand";

export interface ExportInfo {
  id: number;
  name: string;
  generation: number;
  parents: number[];
  owner: string;
  genome: bigint;
  manifestHashOnChain?: string;
  chainId: number;
  chainName: string;
  registry: string;
  explorer?: string | null;
}

/** Tier genome → alias model Claude Code. Sama seperti di runtime, tier bukan nama model. */
const MODEL: Record<ModelTier, string> = { fast: "haiku", balanced: "sonnet", strong: "opus" };

/**
 * Tool genome → tool Claude Code.
 *
 * Genome yang tidak memberi tool apa pun tetap mendapat alat baca: tanpa daftar
 * `tools`, Claude Code justru mewariskan SEMUA tool ke subagent — kebalikan
 * dari yang dimaksud genome itu.
 */
const TOOLS: Record<string, string[]> = {
  filesystem: ["Read", "Write", "Edit", "Glob", "Grep"],
  bash: ["Bash"],
  browser: ["WebFetch"],
  web: ["WebSearch", "WebFetch"],
};
const READ_ONLY = ["Read", "Glob", "Grep"];

export const agentSlug = (id: number, name: string) =>
  `meiosis-${id}-${name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "agent"}`;

const PROVENANCE_START = "<!-- meiosis:provenance";
const PROMPT_START = "<!-- meiosis:prompt -->";
const PROMPT_END = "<!-- /meiosis:prompt -->";

export function toClaudeAgent(a: ExportInfo): string {
  const m = expand(a.genome, 0n);
  const hash = "0x" + manifestHash(m).toString(16).padStart(16, "0");
  const modules = m.traits.filter((t) => t.module).map((t) => t.module!);
  const tools = [...new Set(m.mcpTools.flatMap((t) => TOOLS[t] ?? []))];
  const lineage = a.parents[0] ? `anak dari #${a.parents[0]} × #${a.parents[1]}` : "founder generasi nol";

  const description =
    `Agent Meiosis #${a.id} "${a.name}" (generasi ${a.generation}, ${lineage}). ` +
    `Sifat warisan: ${modules.join(", ") || "tanpa modul"}. ` +
    `Delegasikan tugas yang cocok dengan sifat-sifat itu ke agent ini.`;

  const provenance = [
    PROVENANCE_START,
    `chain: ${a.chainName}`,
    `chainId: ${a.chainId}`,
    `registry: ${a.registry}`,
    `agentId: ${a.id}`,
    `genome: 0x${a.genome.toString(16).padStart(64, "0")}`,
    `manifestHash: ${hash}`,
    `manifestHashOnChain: ${a.manifestHashOnChain ?? "-"}`,
    `owner: ${a.owner}`,
    a.explorer ? `explorer: ${a.explorer}/nft/${a.registry}/${a.id}` : "",
    "-->",
  ].filter(Boolean).join("\n");

  return [
    "---",
    `name: ${agentSlug(a.id, a.name)}`,
    `description: ${JSON.stringify(description)}`,
    `tools: ${(tools.length ? tools : READ_ONLY).join(", ")}`,
    `model: ${MODEL[m.modelTier]}`,
    "---",
    "",
    provenance,
    "",
    PROMPT_START,
    systemPrompt(m),
    PROMPT_END,
    "",
    `Batasi dirimu sekitar ${m.params.maxSteps} langkah kerja. ` +
      (m.params.temperature <= 0.3 ? "Utamakan jawaban yang pasti dan konservatif." :
       m.params.temperature >= 0.8 ? "Boleh mengambil pendekatan yang tidak biasa." : ""),
    "",
  ].join("\n");
}

export interface ParsedExport {
  chainId: number;
  registry: string;
  agentId: number;
  genome: bigint;
  manifestHash: string;
  prompt: string;
}

/** Membaca kembali data asal-usul dari berkas hasil ekspor, untuk diverifikasi. */
export function parseExport(md: string): ParsedExport {
  const block = md.slice(md.indexOf(PROVENANCE_START), md.indexOf("-->", md.indexOf(PROVENANCE_START)));
  const get = (k: string) => {
    const m = block.match(new RegExp(`^${k}: (.+)$`, "m"));
    if (!m) throw new Error(`berkas tidak memuat ${k} — bukan ekspor Meiosis?`);
    return m[1].trim();
  };
  const p0 = md.indexOf(PROMPT_START), p1 = md.indexOf(PROMPT_END);
  if (p0 < 0 || p1 < 0) throw new Error("berkas tidak memuat penanda prompt");
  return {
    chainId: Number(get("chainId")),
    registry: get("registry"),
    agentId: Number(get("agentId")),
    genome: BigInt(get("genome")),
    manifestHash: get("manifestHash"),
    prompt: md.slice(p0 + PROMPT_START.length, p1).trim(),
  };
}
