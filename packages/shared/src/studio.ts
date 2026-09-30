/**
 * Studio: merancang agent generasi nol dari pilihan manusia.
 *
 * Kembaran persis dari `Studio.preview()` di contracts/src/Studio.sol — keduanya
 * diuji dengan STUDIO_VECTORS yang sama. Aturannya menjaga kawin tetap
 * berharga: semua gen berdominansi 1 (kalah dari alel founder yang 2–3), otak
 * paling tinggi "seimbang", dan paling banyak dua bakat.
 */
import { LOCUS, LOCUS_COUNT, allele, buildGenome, locus } from "./genome";

export interface Design {
  tier: number;        // 0 cepat, 1 seimbang
  discipline: number;  // 0..5
  stack: number;       // 0..3
  verbosity: number;   // 0..2
  talentA: number;     // lokus bakat, atau NO_TALENT
  talentB: number;
}

export const NO_TALENT = 255;
export const TALENT_LOCI = [LOCUS.AESTHETIC, LOCUS.TEST_RIGOR, LOCUS.SECURITY_INSTINCT, LOCUS.PERSISTENCE] as const;
const STUDIO_DOMINANCE = 1;

export function validateDesign(d: Design): string | null {
  if (!(d.tier === 0 || d.tier === 1)) return "otak hanya boleh cepat atau seimbang";
  if (!(d.discipline >= 0 && d.discipline <= 5)) return "keahlian tidak dikenal";
  if (!(d.stack >= 0 && d.stack <= 3)) return "stack tidak dikenal";
  if (!(d.verbosity >= 0 && d.verbosity <= 2)) return "gaya bicara tidak dikenal";
  const ok = (t: number) => t === NO_TALENT || (TALENT_LOCI as readonly number[]).includes(t);
  if (!ok(d.talentA) || !ok(d.talentB)) return "bakat harus salah satu dari estetika, tes, keamanan, ketekunan";
  if (d.talentA === d.talentB && d.talentA !== NO_TALENT) return "dua bakat tidak boleh sama";
  return null;
}

export function studioGenome(d: Design): bigint {
  const bad = validateDesign(d);
  if (bad) throw new Error(bad);
  const talent = (l: number) => (d.talentA === l || d.talentB === l ? 2 : 1);
  const value: number[] = new Array(LOCUS_COUNT).fill(0);
  value[LOCUS.MODEL_TIER] = d.tier;
  value[LOCUS.DISCIPLINE_PRIMARY] = d.discipline;
  value[LOCUS.DISCIPLINE_SECONDARY] = 0;
  value[LOCUS.STACK_AFFINITY] = d.stack;
  value[LOCUS.AESTHETIC] = talent(LOCUS.AESTHETIC);
  value[LOCUS.TEST_RIGOR] = talent(LOCUS.TEST_RIGOR);
  value[LOCUS.SECURITY_INSTINCT] = talent(LOCUS.SECURITY_INSTINCT);
  value[LOCUS.DOC_HABIT] = 1;
  value[LOCUS.TOOL_TIER] = 1;
  value[LOCUS.MCP_SET_A] = 3;
  value[LOCUS.MCP_SET_B] = 0;
  value[LOCUS.VERBOSITY] = d.verbosity;
  value[LOCUS.RISK_APPETITE] = 1;
  value[LOCUS.CREATIVITY] = 1;
  value[LOCUS.PERSISTENCE] = talent(LOCUS.PERSISTENCE);
  value[LOCUS.RESERVED] = 0;
  return buildGenome(value.map((v) => {
    const a = allele(STUDIO_DOMINANCE, v);
    return locus(a, a);
  }));
}

/** Dicetak sekali dari studioGenome lalu dibekukan; Studio.t.sol memakai angka yang sama. */
export const STUDIO_VECTORS: { design: Design; genome: bigint }[] = [
  { design: { tier: 1, discipline: 1, stack: 1, verbosity: 0, talentA: 6, talentB: 4 },
    genome: 0x4040414141414141404040404343414141414242414142424141404041414141n },
  { design: { tier: 0, discipline: 2, stack: 0, verbosity: 1, talentA: 255, talentB: 255 },
    genome: 0x4040414141414141414140404343414141414141414141414040404042424040n },
  { design: { tier: 1, discipline: 5, stack: 3, verbosity: 2, talentA: 14, talentB: 5 },
    genome: 0x4040424241414141424240404343414141414141424241414343404045454141n },
];
