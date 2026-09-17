/**
 * Katalog modul skill, dimuat sekali dari runtime/skills/.
 *
 * Pemuatan wajib deterministik: nama direktori diurutkan sebelum dibaca, sehingga
 * urutan filesystem tidak pernah memengaruhi hasil. Isi tiap modul di-hash agar
 * penyuntingan prompt tanpa menaikkan versi langsung ketahuan oleh golden test.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";

export interface SkillModule {
  locus: number;
  traitId: number;
  name: string;
  version: string;
  mcpTools: string[];
  modelTier?: "fast" | "balanced" | "strong";
  prompt: string;
  /** keccak256 dari module.json + prompt.md, 16 hex pertama */
  contentHash: string;
}

const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");

function load(): Map<number, SkillModule> {
  const out = new Map<number, SkillModule>();
  const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // urutan filesystem tidak boleh menentukan apa pun

  for (const name of dirs) {
    const metaRaw = readFileSync(join(SKILLS_DIR, name, "module.json"), "utf8");
    const prompt = readFileSync(join(SKILLS_DIR, name, "prompt.md"), "utf8");
    const meta = JSON.parse(metaRaw);
    const mod: SkillModule = {
      locus: meta.locus,
      traitId: meta.traitId,
      name: meta.name,
      version: meta.version,
      mcpTools: meta.mcpTools ?? [],
      modelTier: meta.modelTier,
      prompt,
      contentHash: keccak256(toBytes(metaRaw + prompt)).slice(2, 18),
    };
    const k = (mod.locus << 8) | mod.traitId;
    if (out.has(k)) throw new Error(`dua modul mengklaim lokus ${mod.locus} trait ${mod.traitId}`);
    out.set(k, mod);
  }
  return out;
}

let cache: Map<number, SkillModule> | null = null;

export function catalog(): Map<number, SkillModule> {
  if (!cache) cache = load();
  return cache;
}

export const moduleFor = (locus: number, traitId: number): SkillModule | undefined =>
  catalog().get((locus << 8) | traitId);
