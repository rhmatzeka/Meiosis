/**
 * Genome generasi nol, dirancang tangan.
 *
 * Prinsip perancangan (lihat PLAN.md §4.2):
 *  - Trait unggulan tiap founder diberi dominance tinggi agar lolos ke anak.
 *  - Founder lemah di sisi yang dikuasai pasangannya — inilah yang membuat
 *    hybrid vigor mungkin.
 *  - Sebagian lokus sengaja dibuat heterozigot agar anakan tetap bervariasi.
 *    Tanpa variasi, tidak ada sebaran untuk ditampilkan di demo.
 */
import { allele as A, locus as L, buildGenome } from "./genome";

// A(dominance 0-3, traitId)

/** G0 — homozigot dominan untuk security & test rigor, resesif untuk estetika. */
export const G0_SOLIDITY_SMITH = buildGenome([
  L(A(2, 1), A(2, 1)), // L0  tier balanced
  L(A(3, 1), A(3, 1)), // L1  code
  L(A(1, 4), A(0, 0)), // L2  security / generalist
  L(A(2, 2), A(0, 1)), // L3  solidity, membawa react resesif
  L(A(0, 0), A(0, 0)), // L4  estetika plain — resesif murni  ← lemah
  L(A(3, 2), A(3, 2)), // L5  test rigor high
  L(A(3, 2), A(3, 2)), // L6  security high — selalu diwariskan  ★
  L(A(1, 1), A(0, 0)), // L7  doc medium
  L(A(2, 2), A(2, 2)), // L8  tool full
  L(A(1, 1), A(1, 1)), // L9  mcp build
  L(A(0, 0), A(0, 0)), // L10 mcp none
  L(A(2, 0), A(2, 0)), // L11 terse
  L(A(1, 1), A(1, 0)), // L12 risk medium/low
  L(A(1, 0), A(1, 1)), // L13 creativity low/medium
  L(A(2, 2), A(1, 1)), // L14 persistence high/medium
  L(A(0, 0), A(0, 0)), // L15
]);

/** G1 — heterozigot untuk estetika, sehingga hanya ~50% anak mewarisi yang tinggi. */
export const G1_PIXEL_SENSE = buildGenome([
  L(A(2, 1), A(2, 1)), // L0  tier balanced
  L(A(3, 2), A(3, 2)), // L1  design
  L(A(1, 1), A(0, 3)), // L2  code / research resesif
  L(A(2, 1), A(2, 1)), // L3  react
  L(A(3, 2), A(1, 1)), // L4  estetika high / medium — heterozigot  ★
  L(A(0, 0), A(0, 0)), // L5  test rigor low                        ← lemah
  L(A(0, 0), A(0, 0)), // L6  security low                          ← lemah
  L(A(1, 1), A(1, 1)), // L7  doc medium
  L(A(1, 1), A(1, 1)), // L8  tool standard
  L(A(0, 0), A(1, 1)), // L9
  L(A(1, 1), A(1, 1)), // L10 mcp web
  L(A(1, 1), A(1, 2)), // L11 normal / verbose
  L(A(2, 2), A(1, 1)), // L12 risk high/medium
  L(A(2, 2), A(2, 2)), // L13 creativity high
  L(A(1, 1), A(0, 0)), // L14 persistence medium/low
  L(A(0, 0), A(0, 0)), // L15
]);

/** G2 — pembawa security tinggi yang RESESIF: ia sendiri tidak mengekspresikannya. */
export const G2_DOC_WEAVER = buildGenome([
  L(A(1, 0), A(1, 0)), // L0  tier fast
  L(A(3, 3), A(3, 3)), // L1  research
  L(A(1, 0), A(1, 0)), // L2  generalist
  L(A(1, 3), A(0, 1)), // L3  python
  L(A(1, 1), A(1, 1)), // L4  estetika medium
  L(A(1, 1), A(1, 1)), // L5  test rigor medium
  L(A(1, 0), A(0, 2)), // L6  ekspresi low, MEMBAWA high resesif  ★ demo generasi 2
  L(A(3, 2), A(3, 2)), // L7  doc high
  L(A(1, 1), A(1, 1)), // L8
  L(A(1, 1), A(0, 0)), // L9
  L(A(2, 1), A(2, 1)), // L10 mcp web
  L(A(1, 2), A(1, 2)), // L11 verbose
  L(A(1, 0), A(1, 0)), // L12 risk low
  L(A(1, 1), A(1, 1)), // L13 creativity medium
  L(A(1, 1), A(1, 1)), // L14 persistence medium
  L(A(0, 0), A(0, 0)), // L15
]);

/** G3 — ketekunan tinggi dan akses tool build. Menambah keluasan gene pool. */
export const G3_OPS_HOUND = buildGenome([
  L(A(2, 0), A(2, 0)), // L0  tier fast
  L(A(3, 1), A(3, 1)), // L1  code
  L(A(1, 5), A(0, 0)), // L2  data resesif generalist
  L(A(1, 0), A(1, 0)), // L3  stack none
  L(A(0, 0), A(0, 0)), // L4  estetika plain
  L(A(2, 1), A(2, 1)), // L5  test rigor medium
  L(A(1, 1), A(1, 1)), // L6  security medium
  L(A(1, 0), A(1, 0)), // L7  doc low
  L(A(2, 2), A(2, 2)), // L8  tool full
  L(A(2, 3), A(2, 3)), // L9  mcp build+fs
  L(A(1, 2), A(1, 2)), // L10 mcp data
  L(A(1, 0), A(1, 0)), // L11 terse
  L(A(1, 1), A(1, 1)), // L12 risk medium
  L(A(1, 0), A(1, 0)), // L13 creativity low
  L(A(3, 2), A(3, 2)), // L14 persistence high  ★
  L(A(0, 0), A(0, 0)), // L15
]);

export const FOUNDERS = [
  { id: 0, name: "Solidity Smith", genome: G0_SOLIDITY_SMITH },
  { id: 1, name: "Pixel Sense", genome: G1_PIXEL_SENSE },
  { id: 2, name: "Doc Weaver", genome: G2_DOC_WEAVER },
  { id: 3, name: "Ops Hound", genome: G3_OPS_HOUND },
] as const;
