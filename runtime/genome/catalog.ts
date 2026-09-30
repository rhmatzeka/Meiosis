/**
 * Katalog modul skill.
 *
 * Dua bagian, sengaja dipisah:
 *   runtime/skills/<nama>/module.json   PUBLIK — lokus, trait, versi, tool, dan contentHash
 *   private/skills/<nama>/prompt.md     PRIVAT — teks prompt, tidak pernah masuk git
 *
 * contentHash adalah komitmen atas isi prompt: ia masuk ke manifest (sehingga
 * ke manifestHash on-chain) dan terdaftar di SkillRegistry. Siapa pun bisa
 * memastikan agent menjalankan modul versi tertentu tanpa bisa membaca isinya.
 * Tanpa prompt privat, manifest tetap bisa dihitung; hanya perakitan system
 * prompt yang tidak bisa — dan itu memang disengaja.
 *
 * Pemuatan deterministik: nama direktori diurutkan sebelum dibaca.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";

export interface SkillModule {
  locus: number;
  traitId: number;
  name: string;
  version: string;
  mcpTools: string[];
  modelTier?: "fast" | "balanced" | "strong";
  /** Modul ini memang punya teks prompt (modul tier tidak). */
  hasPrompt: boolean;
  /** Teks prompt privat tersedia di mesin ini. */
  promptAvailable: boolean;
  prompt: string;
  /** keccak256 dari module.json kanonik (tanpa contentHash) + prompt, 16 hex pertama */
  contentHash: string;
}

const here = dirname(fileURLToPath(import.meta.url));
export const PUBLIC_SKILLS = join(here, "..", "skills");
export const PRIVATE_SKILLS = join(here, "..", "..", "private", "skills");

const canonical = (v: unknown): string => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
};

/** Hash komitmen modul. `contentHash` di dalam meta diabaikan. */
export function contentHashOf(meta: Record<string, unknown>, prompt: string): string {
  const { contentHash: _ignored, ...rest } = meta;
  return keccak256(toBytes(canonical(rest) + "\n" + prompt)).slice(2, 18);
}

export function loadCatalog(publicDir = PUBLIC_SKILLS, privateDir = PRIVATE_SKILLS): Map<number, SkillModule> {
  const out = new Map<number, SkillModule>();
  const dirs = readdirSync(publicDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // urutan filesystem tidak boleh menentukan apa pun

  for (const name of dirs) {
    const meta = JSON.parse(readFileSync(join(publicDir, name, "module.json"), "utf8"));
    const promptFile = join(privateDir, name, "prompt.md");
    const promptAvailable = existsSync(promptFile);
    const prompt = promptAvailable ? readFileSync(promptFile, "utf8") : "";
    const committed: string | undefined = meta.contentHash;
    if (!committed) throw new Error(`modul ${name} belum punya contentHash — jalankan bun run skills:hash`);
    if (promptAvailable) {
      const actual = contentHashOf(meta, prompt);
      if (actual !== committed) {
        throw new Error(`prompt modul ${name} tidak cocok dengan hash publiknya (${actual} ≠ ${committed}). Jalankan bun run skills:hash bila perubahannya disengaja.`);
      }
    }
    const mod: SkillModule = {
      locus: meta.locus,
      traitId: meta.traitId,
      name: meta.name,
      version: meta.version,
      mcpTools: meta.mcpTools ?? [],
      modelTier: meta.modelTier,
      hasPrompt: meta.hasPrompt !== false,
      promptAvailable,
      prompt,
      contentHash: committed,
    };
    const k = (mod.locus << 8) | mod.traitId;
    if (out.has(k)) throw new Error(`dua modul mengklaim lokus ${mod.locus} trait ${mod.traitId}`);
    out.set(k, mod);
  }
  return out;
}

/**
 * Menggabungkan prompt modul, berurutan. Modul yang seharusnya berprompt tapi
 * prompt privatnya tidak ada membuat perakitan GAGAL: agent tanpa kepribadian
 * yang diam-diam dijalankan lebih buruk daripada galat yang jelas.
 */
export function composePrompt(mods: Pick<SkillModule, "name" | "prompt" | "promptAvailable" | "hasPrompt">[]): string {
  const missing = mods.filter((m) => m.hasPrompt && !m.promptAvailable).map((m) => m.name);
  if (missing.length) throw new Error(`prompt privat tidak tersedia di mesin ini untuk modul: ${missing.join(", ")}`);
  return mods.map((m) => m.prompt.trim()).filter(Boolean).join("\n\n---\n\n");
}

let cache: Map<number, SkillModule> | null = null;

export function catalog(): Map<number, SkillModule> {
  if (!cache) cache = loadCatalog();
  return cache;
}

/** Apakah mesin ini bisa merakit system prompt (punya semua prompt privat)? */
export const promptsAvailable = () => [...catalog().values()].every((m) => !m.hasPrompt || m.promptAvailable);

export const moduleFor = (locus: number, traitId: number): SkillModule | undefined =>
  catalog().get((locus << 8) | traitId);
