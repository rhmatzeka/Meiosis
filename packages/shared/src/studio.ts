/**
 * Studio: merancang agent generasi nol dengan bebas.
 *
 * Pembuat memilih nilai untuk setiap lokus tanpa batasan (termasuk otak kuat),
 * dan boleh menulis instruksi khusus sendiri (disimpan di server; hash-nya di
 * chain). Kembaran persis `Studio.preview()` di contracts/src/Studio.sol —
 * keduanya diuji dengan STUDIO_VECTORS yang sama.
 *
 * Setiap lokus homozigot dengan dominansi 2: sifat pilihan pasti terekspresi,
 * dan saat dikawinkan masih bisa dikalahkan alel berdominansi 3.
 */
import { LOCUS, LOCUS_COUNT, TRAIT_COUNTS, allele, buildGenome, locus } from "./genome";

const STUDIO_DOMINANCE = 2;

/** Titik awal yang masuk akal untuk formulir Studio. */
export function defaultTraits(): number[] {
  const t = new Array<number>(LOCUS_COUNT).fill(1);
  t[LOCUS.MODEL_TIER] = 1;          // seimbang
  t[LOCUS.DISCIPLINE_PRIMARY] = 1;  // kode
  t[LOCUS.DISCIPLINE_SECONDARY] = 0;
  t[LOCUS.STACK_AFFINITY] = 0;      // bebas
  t[LOCUS.MCP_SET_A] = 3;           // build + berkas
  t[LOCUS.MCP_SET_B] = 0;
  t[LOCUS.RESERVED] = 0;
  return t;
}

export function validateTraits(traits: number[]): string | null {
  if (!Array.isArray(traits) || traits.length !== LOCUS_COUNT) return "sifat harus 16 nilai, satu per lokus";
  for (let i = 0; i < LOCUS_COUNT; i++) {
    const v = traits[i];
    if (!Number.isInteger(v) || v < 0 || v >= TRAIT_COUNTS[i]) return `nilai lokus ${i} tidak sah`;
  }
  return null;
}

export function studioGenome(traits: number[]): bigint {
  const bad = validateTraits(traits);
  if (bad) throw new Error(bad);
  return buildGenome(traits.map((v) => {
    const a = allele(STUDIO_DOMINANCE, v);
    return locus(a, a);
  }));
}

/** Dicetak sekali dari studioGenome lalu dibekukan; Studio.t.sol memakai angka yang sama. */
export const STUDIO_VECTORS: { traits: number[]; genome: bigint }[] = [
  { traits: [1, 1, 0, 0, 1, 1, 1, 1, 1, 3, 0, 1, 1, 1, 1, 0],
    genome: 0x8080818181818181818180808383818181818181818181818080808081818181n },
  { traits: [2, 5, 5, 3, 2, 2, 2, 2, 2, 3, 3, 2, 2, 2, 2, 0],
    genome: 0x8080828282828282828283838383828282828282828282828383858585858282n },
  { traits: [2, 2, 4, 1, 2, 0, 2, 1, 2, 1, 3, 0, 2, 2, 0, 0],
    genome: 0x8080808082828282808083838181828281818282808082828181848482828282n },
];
