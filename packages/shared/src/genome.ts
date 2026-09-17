/**
 * Sumber kebenaran model genetik. Cermin persis dari contracts/src/GeneLib.sol.
 * Setiap perubahan di sini WAJIB diikuti perubahan yang sama di Solidity,
 * dan test/GeneLib.t.sol yang menjaga keduanya tetap identik.
 *
 * Tata letak:
 *   genome : uint256 = 16 lokus x 16 bit,  lokus i di bit [16i, 16i+16)
 *   lokus  : [ alelX 8 bit (tinggi) | alelY 8 bit (rendah) ]
 *   alel   : [ dominance 2 bit (tinggi) | traitId 6 bit (rendah) ]
 */
import { keccak256 } from "viem";

export const LOCUS_COUNT = 16;
export const MUT_SALT_1 = 1n;
export const MUT_SALT_2 = 2n;
/**
 * 2/256 ≈ 0,78% peluang mutasi per lokus. Karena ada 16 lokus, sekitar 12%
 * anak membawa setidaknya satu mutasi — cukup untuk terlihat di antara 8 anakan
 * demo, tapi tidak cukup untuk menenggelamkan sinyal pewarisan.
 */
export const MUTATION_THRESHOLD = 2;

/**
 * Jumlah trait valid per lokus. Mutasi wajib menghasilkan trait yang SAH untuk
 * lokus tersebut; membalik bit sembarangan pada traitId 6-bit akan menghasilkan
 * nilai tak bermakna hampir sepanjang waktu.
 */
export const TRAIT_COUNTS = [3, 6, 6, 4, 3, 3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 1] as const;

/** TRAIT_COUNTS dipak jadi satu uint256, cermin dari konstanta di GeneLib.sol. */
export const TRAIT_COUNTS_PACKED = TRAIT_COUNTS.reduce(
  (acc, c, i) => acc | (BigInt(c) << BigInt(8 * i)), 0n,
);

export const LOCUS = {
  MODEL_TIER: 0, DISCIPLINE_PRIMARY: 1, DISCIPLINE_SECONDARY: 2, STACK_AFFINITY: 3,
  AESTHETIC: 4, TEST_RIGOR: 5, SECURITY_INSTINCT: 6, DOC_HABIT: 7,
  TOOL_TIER: 8, MCP_SET_A: 9, MCP_SET_B: 10, VERBOSITY: 11,
  RISK_APPETITE: 12, CREATIVITY: 13, PERSISTENCE: 14, RESERVED: 15,
} as const;

export const LOCUS_NAMES = Object.keys(LOCUS) as (keyof typeof LOCUS)[];

/** Nama trait per lokus. Indeks = traitId. */
export const TRAITS: Record<number, string[]> = {
  0: ["fast", "balanced", "strong"],
  1: ["generalist", "code", "design", "research", "security", "data"],
  2: ["generalist", "code", "design", "research", "security", "data"],
  3: ["none", "react", "solidity", "python"],
  4: ["plain", "medium", "high"],
  5: ["low", "medium", "high"],
  6: ["low", "medium", "high"],
  7: ["low", "medium", "high"],
  8: ["basic", "standard", "full"],
  9: ["none", "build", "fs", "build+fs"],
  10: ["none", "web", "data", "web+data"],
  11: ["terse", "normal", "verbose"],
  12: ["low", "medium", "high"],
  13: ["low", "medium", "high"],
  14: ["low", "medium", "high"],
  15: ["none"],
};

export const traitName = (locus: number, id: number) =>
  TRAITS[locus]?.[id] ?? `trait${id}`;

// ---------- encode / decode ----------

export const allele = (dominance: number, traitId: number) =>
  ((dominance & 3) << 6) | (traitId & 63);
export const dom = (a: number) => (a >> 6) & 3;
export const trait = (a: number) => a & 63;
export const locus = (x: number, y: number) => ((x & 0xff) << 8) | (y & 0xff);

export function buildGenome(loci: number[]): bigint {
  if (loci.length !== LOCUS_COUNT) throw new Error("harus 16 lokus");
  let g = 0n;
  for (let i = 0; i < LOCUS_COUNT; i++) g |= BigInt(loci[i] & 0xffff) << BigInt(16 * i);
  return g;
}

export const getLocus = (g: bigint, i: number) => Number((g >> BigInt(16 * i)) & 0xffffn);
export const alleleX = (l: number) => (l >> 8) & 0xff;
export const alleleY = (l: number) => l & 0xff;

// ---------- keccak, sama persis dengan abi.encode(uint256,uint256) ----------

function keccakTwo(a: bigint, b: bigint): bigint {
  const buf = new Uint8Array(64);
  for (let i = 0; i < 32; i++) {
    buf[31 - i] = Number((a >> BigInt(8 * i)) & 0xffn);
    buf[63 - i] = Number((b >> BigInt(8 * i)) & 0xffn);
  }
  return BigInt(keccak256(buf));
}

const byteAt = (v: bigint, i: number) => Number((v >> BigInt(8 * i)) & 0xffn);
const bitAt = (v: bigint, i: number) => Number((v >> BigInt(i)) & 1n);

// ---------- operasi genetik ----------

/** Meiosis: tiap lokus mengambil satu alel dari tiap parent, lalu kemungkinan mutasi. */
export function meiosis(a: bigint, b: bigint, seed: bigint): bigint {
  const m1 = keccakTwo(seed, MUT_SALT_1);
  const m2 = keccakTwo(seed, MUT_SALT_2);
  let child = 0n;

  for (let i = 0; i < LOCUS_COUNT; i++) {
    const la = getLocus(a, i);
    const lb = getLocus(b, i);
    let fromA = bitAt(seed, i) === 0 ? alleleX(la) : alleleY(la);
    let fromB = bitAt(seed, i + 16) === 0 ? alleleX(lb) : alleleY(lb);

    const count = TRAIT_COUNTS[i];
    if (count > 1 && byteAt(m1, i) < MUTATION_THRESHOLD) {
      const r2 = byteAt(m2, i);
      // + 1 menjamin trait hasil mutasi selalu berbeda dari aslinya
      const shift = 1 + ((r2 & 0x7f) % (count - 1));
      if ((r2 >> 7) & 1) fromB = allele(dom(fromB), (trait(fromB) + shift) % count);
      else fromA = allele(dom(fromA), (trait(fromA) + shift) % count);
    }
    child |= BigInt(locus(fromA, fromB)) << BigInt(16 * i);
  }
  return child;
}

/** Ekspresi: dominance tertinggi menang; seri diputus oleh bit seed. */
export function express(genome: bigint, seed: bigint): number[] {
  const out: number[] = [];
  for (let i = 0; i < LOCUS_COUNT; i++) {
    const l = getLocus(genome, i);
    const x = alleleX(l), y = alleleY(l);
    const dx = dom(x), dy = dom(y);
    if (dx > dy) out.push(trait(x));
    else if (dy > dx) out.push(trait(y));
    else out.push(bitAt(seed, i) === 0 ? trait(x) : trait(y));
  }
  return out;
}

/** Kekerabatan 0-255. relatedness(a,a) == 255, dan simetris. */
export function relatedness(a: bigint, b: bigint): number {
  let shared = 0;
  for (let i = 0; i < LOCUS_COUNT; i++) {
    const la = getLocus(a, i), lb = getLocus(b, i);
    const ax = alleleX(la), ay = alleleY(la), bx = alleleX(lb), by = alleleY(lb);
    if ((ax === bx && ay === by) || (ax === by && ay === bx)) shared += 2;
    else if (ax === bx || ax === by || ay === bx || ay === by) shared += 1;
  }
  return Math.floor((shared * 255) / 32);
}
