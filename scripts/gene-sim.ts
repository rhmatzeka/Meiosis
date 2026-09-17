/**
 * P0 — simulator gen. Menjawab pertanyaan yang menentukan sebelum apa pun
 * di-deploy: apakah genome founder menghasilkan anakan yang layak?
 *
 * Lihat PLAN.md §4.4. Ambang lulus: >=40% anak mewarisi SECURITY_INSTINCT high
 * dan AESTHETIC high sekaligus.
 */
import { keccak256, toHex } from "viem";
import {
  meiosis, express, relatedness, LOCUS, LOCUS_NAMES, traitName,
  getLocus, alleleX, alleleY, dom, trait, LOCUS_COUNT,
} from "../packages/shared/src/genome";
import { FOUNDERS, G0_SOLIDITY_SMITH, G1_PIXEL_SENSE, G2_DOC_WEAVER } from "../packages/shared/src/founders";

const N = 10_000;
const HIGH = 2;
const seedOf = (i: number) => BigInt(keccak256(toHex(BigInt(i), { size: 32 })));
const pct = (n: number) => ((n / N) * 100).toFixed(1) + "%";
const bar = (p: number, w = 28) => "█".repeat(Math.round((p / 100) * w)).padEnd(w, "·");

console.log("\n\x1b[1mMEIOSIS — simulasi gen P0\x1b[0m");
console.log(`${N.toLocaleString("id-ID")} perkawinan G0 x G1\n`);

// ---------- fenotipe founder ----------
console.log("\x1b[1mFenotipe founder\x1b[0m (seed 0)");
for (const f of FOUNDERS) {
  const e = express(f.genome, 0n);
  const hi = [LOCUS.AESTHETIC, LOCUS.SECURITY_INSTINCT, LOCUS.TEST_RIGOR, LOCUS.PERSISTENCE, LOCUS.DOC_HABIT]
    .map((l) => `${LOCUS_NAMES[l].toLowerCase()}=${traitName(l, e[l])}`)
    .join("  ");
  console.log(`  G${f.id} ${f.name.padEnd(16)} ${hi}`);
}
console.log(`\n  genome G0 = 0x${G0_SOLIDITY_SMITH.toString(16).padStart(64, "0")}`);
console.log(`  genome G1 = 0x${G1_PIXEL_SENSE.toString(16).padStart(64, "0")}`);

// ---------- simulasi ----------
let bothHigh = 0, secHigh = 0, aesHigh = 0, worseBoth = 0, mutated = 0;
const locusValues: Set<number>[] = Array.from({ length: LOCUS_COUNT }, () => new Set());
const parentAlleles = new Set<number>();
for (const g of [G0_SOLIDITY_SMITH, G1_PIXEL_SENSE])
  for (let i = 0; i < LOCUS_COUNT; i++) {
    const l = getLocus(g, i);
    parentAlleles.add((i << 8) | alleleX(l));
    parentAlleles.add((i << 8) | alleleY(l));
  }

const g0e = express(G0_SOLIDITY_SMITH, 0n);
const g1e = express(G1_PIXEL_SENSE, 0n);

for (let i = 0; i < N; i++) {
  const seed = seedOf(i);
  const child = meiosis(G0_SOLIDITY_SMITH, G1_PIXEL_SENSE, seed);
  const e = express(child, seed);

  const s = e[LOCUS.SECURITY_INSTINCT];
  const a = e[LOCUS.AESTHETIC];
  if (s === HIGH) secHigh++;
  if (a === HIGH) aesHigh++;
  if (s === HIGH && a === HIGH) bothHigh++;
  if (s < g0e[LOCUS.SECURITY_INSTINCT] && a < g1e[LOCUS.AESTHETIC]) worseBoth++;

  for (let j = 0; j < LOCUS_COUNT; j++) locusValues[j].add(e[j]);

  // deteksi mutasi: ada alel anak yang tidak ada pada kedua parent
  let mut = false;
  for (let j = 0; j < LOCUS_COUNT && !mut; j++) {
    const l = getLocus(child, j);
    if (!parentAlleles.has((j << 8) | alleleX(l)) || !parentAlleles.has((j << 8) | alleleY(l))) mut = true;
  }
  if (mut) mutated++;
}

// ---------- laporan ----------
const p = (n: number) => (n / N) * 100;
console.log("\n\x1b[1mPewarisan trait unggulan\x1b[0m");
console.log(`  security high (dari G0)   ${bar(p(secHigh))} ${pct(secHigh)}`);
console.log(`  aesthetic high (dari G1)  ${bar(p(aesHigh))} ${pct(aesHigh)}`);
console.log(`  \x1b[1mKEDUANYA\x1b[0m                  ${bar(p(bothHigh))} \x1b[1m${pct(bothHigh)}\x1b[0m  (ambang: 40%)`);
console.log(`  lebih buruk dari keduanya ${bar(p(worseBoth))} ${pct(worseBoth)}`);
console.log(`\n  laju mutasi teramati      ${pct(mutated)} anak membawa >=1 alel baru`);

console.log("\n\x1b[1mVariasi per lokus\x1b[0m");
const frozen: string[] = [];
for (let i = 0; i < LOCUS_COUNT; i++) {
  const vals = [...locusValues[i]].sort();
  const names = vals.map((v) => traitName(i, v)).join(", ");
  const flag = vals.length === 1 ? "\x1b[33m beku\x1b[0m" : "";
  if (vals.length === 1) frozen.push(LOCUS_NAMES[i]);
  console.log(`  L${String(i).padStart(2)} ${LOCUS_NAMES[i].padEnd(21)} ${String(vals.length).padStart(2)} nilai  ${names}${flag}`);
}

console.log("\n\x1b[1mKekerabatan\x1b[0m");
console.log(`  relatedness(G0, G0) = ${relatedness(G0_SOLIDITY_SMITH, G0_SOLIDITY_SMITH)}  (harus 255)`);
console.log(`  relatedness(G0, G1) = ${relatedness(G0_SOLIDITY_SMITH, G1_PIXEL_SENSE)}`);
console.log(`  relatedness(G0, G2) = ${relatedness(G0_SOLIDITY_SMITH, G2_DOC_WEAVER)}`);

// ---------- vektor uji silang untuk Solidity ----------
const vec: string[] = [];
for (let i = 0; i < 8; i++) {
  const seed = seedOf(i * 37 + 1);
  const a = FOUNDERS[i % 4].genome;
  const b = FOUNDERS[(i + 1) % 4].genome;
  vec.push(`        [uint256(${a}), ${b}, ${seed}, ${meiosis(a, b, seed)}, ${relatedness(a, b)}]`);
}
const sol = `// SPDX-License-Identifier: MIT
// DIHASILKAN OLEH scripts/gene-sim.ts — JANGAN DIEDIT TANGAN.
// Vektor ini membuktikan implementasi TypeScript dan Solidity identik.
pragma solidity ^0.8.24;

library Vectors {
    /// @return v [genomeA, genomeB, seed, expectedChild, expectedRelatedness]
    function all() internal pure returns (uint256[5][8] memory v) {
        v = [
${vec.join(",\n")}
        ];
    }

    /// @return f genome G0..G3, dirancang tangan di packages/shared/src/founders.ts
    function founders() internal pure returns (uint256[4] memory f) {
        f = [${FOUNDERS.map((x) => `uint256(${x.genome})`).join(", ")}];
    }
}
`;
await Bun.write("contracts/test/Vectors.sol", sol);

const pass = p(bothHigh) >= 40 && frozen.length <= 2;
console.log(`\n  8 vektor uji silang ditulis ke contracts/test/Vectors.sol`);
console.log(`\n\x1b[1m  GERBANG P0: ${pass ? "\x1b[32mLULUS" : "\x1b[31mGAGAL"}\x1b[0m\n`);
process.exit(pass ? 0 : 1);
