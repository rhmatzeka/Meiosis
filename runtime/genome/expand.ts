/**
 * expand() — genome uint256 menjadi manifest agent.
 *
 * INI FUNGSI PALING SENSITIF DI SELURUH PROYEK.
 *
 * Genome yang sama wajib menghasilkan manifest yang identik, byte per byte,
 * selamanya. Kalau tidak, `manifestHash` yang tercatat on-chain saat kelahiran
 * tidak akan pernah cocok lagi, dan klaim bahwa agent yang dijalankan memang
 * agent yang tercatat di chain ikut runtuh bersamanya.
 *
 * Aturan yang diberlakukan test di runtime/genome/expand.test.ts:
 *   - dilarang Date.now(), Math.random(), process.env, atau akses jaringan
 *   - kunci JSON selalu terurut
 *   - urutan array ditentukan nomor lokus, tidak pernah oleh filesystem
 *   - isi tiap modul ikut di-hash, sehingga menyunting prompt tanpa menaikkan
 *     versi langsung membuat golden test merah
 *
 * Lihat PLAN.md §8.
 */
import { keccak256, toBytes } from "viem";
import { express, LOCUS, LOCUS_COUNT } from "../../packages/shared/src/genome";
import { moduleFor, type SkillModule } from "./catalog";

export type ModelTier = "fast" | "balanced" | "strong";

export interface ManifestTrait {
  locus: number;
  traitId: number;
  module: string | null;
  version: string | null;
  contentHash: string | null;
}

export interface Manifest {
  manifestVersion: 1;
  /**
   * Tier, bukan nama model. Resolusi ke model konkret terjadi di
   * materialize(), di luar bagian yang di-hash — sehingga berpindah penyedia
   * tidak pernah membatalkan hash yang sudah tercatat on-chain. PLAN.md §8.1.
   */
  modelTier: ModelTier;
  mcpTools: string[];
  params: { maxSteps: number; maxTokens: number; temperature: number };
  traits: ManifestTrait[];
}

const TIERS: ModelTier[] = ["fast", "balanced", "strong"];
const TEMPERATURE = [0.2, 0.5, 0.9];   // L13 CREATIVITY
const MAX_STEPS = [8, 20, 40];          // L14 PERSISTENCE
/**
 * L11 VERBOSITY.
 *
 * Lantainya dinaikkan dari 2.000 setelah uji diskriminasi pertama: anak G0 x G1
 * terpotong persis di 2.000 token, berkas terakhirnya tidak utuh, dan build
 * gagal. Ia kalah karena kehabisan ruang, bukan karena kemampuannya.
 *
 * Verbositas adalah GAYA, dan gaya itu sudah disampaikan lewat modul prompt
 * verbosity-terse. Anggaran token adalah KAPASITAS. Mencampur keduanya membuat
 * agent yang ringkas tidak sanggup menyelesaikan tugas besar — dan itu menilai
 * anggaran, bukan menilai agent.
 */
const MAX_TOKENS = [4000, 6000, 8000];

const pick = <T,>(table: T[], i: number): T => table[Math.min(i, table.length - 1)];

/** Serialisasi kanonik: kunci objek selalu terurut, tanpa spasi berlebih. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function expand(genome: bigint, birthSeed: bigint): Manifest {
  const expressed = express(genome, birthSeed);

  const traits: ManifestTrait[] = [];
  const tools = new Set<string>();
  let modelTier: ModelTier = "balanced";

  for (let locus = 0; locus < LOCUS_COUNT; locus++) {
    const traitId = expressed[locus];
    const mod: SkillModule | undefined = moduleFor(locus, traitId);

    traits.push({
      locus,
      traitId,
      module: mod?.name ?? null,
      version: mod?.version ?? null,
      contentHash: mod?.contentHash ?? null,
    });

    if (mod) {
      for (const t of mod.mcpTools) tools.add(t);
      if (locus === LOCUS.MODEL_TIER && mod.modelTier) modelTier = mod.modelTier;
    }
  }

  // Lokus tier tanpa modul tetap menentukan tier lewat traitId-nya.
  if (!moduleFor(LOCUS.MODEL_TIER, expressed[LOCUS.MODEL_TIER])) {
    modelTier = pick(TIERS, expressed[LOCUS.MODEL_TIER]);
  }

  return {
    manifestVersion: 1,
    modelTier,
    mcpTools: [...tools].sort(),
    params: {
      temperature: pick(TEMPERATURE, expressed[LOCUS.CREATIVITY]),
      maxSteps: pick(MAX_STEPS, expressed[LOCUS.PERSISTENCE]),
      maxTokens: pick(MAX_TOKENS, expressed[LOCUS.VERBOSITY]),
    },
    traits,
  };
}

/** 8 byte pertama keccak256 manifest kanonik — persis yang disimpan on-chain. */
export function manifestHash(m: Manifest): bigint {
  const h = keccak256(toBytes(canonicalJson(m)));
  return BigInt("0x" + h.slice(2, 18));
}

/** Menyusun system prompt dari modul yang terekspresi, berurutan menurut lokus. */
export function systemPrompt(m: Manifest): string {
  const parts: string[] = [];
  for (const t of m.traits) {
    if (!t.module) continue;
    const mod = moduleFor(t.locus, t.traitId);
    if (!mod || !mod.prompt.trim()) continue;
    parts.push(mod.prompt.trim());
  }
  return parts.join("\n\n---\n\n");
}
