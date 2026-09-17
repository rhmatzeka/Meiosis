/**
 * Sebaran seluruh anakan — PLAN.md §4.3.
 *
 * Satu anak tidak membuktikan apa pun. Mengawinkan sekali lalu menampilkan
 * hasilnya yang bagus justru terlihat seperti kurasi. Yang membuktikan sistemnya
 * benar-benar genetik adalah SEBARAN: banyak anak dari induk yang sama, dengan
 * skor yang bervariasi, sebagian melewati induknya dan sebagian tidak.
 *
 * Kedua induk ikut dijalankan di sesi yang sama supaya pembandingnya adil —
 * kuota, suhu, dan kondisi penyedia bisa berbeda antar hari.
 */
import { keccak256, toHex } from "viem";
import { meiosis, express, LOCUS, traitName } from "../packages/shared/src/genome";
import { FOUNDERS } from "../packages/shared/src/founders";
import { runRound, type Contestant } from "../arena/run-round";
import { getProvider } from "../runtime/providers";

const N = Number(process.env.LITTER ?? 8);

const contestants: Contestant[] = [
  { id: 1, label: "G0 Solidity Smith", genome: FOUNDERS[0].genome, seed: 0n },
  { id: 2, label: "G1 Pixel Sense", genome: FOUNDERS[1].genome, seed: 0n },
];

for (let i = 0; i < N; i++) {
  const seed = BigInt(keccak256(toHex(BigInt(1000 + i), { size: 32 })));
  contestants.push({
    id: 100 + i,
    label: `Anak ${i + 1}`,
    genome: meiosis(FOUNDERS[0].genome, FOUNDERS[1].genome, seed),
    seed,
  });
}

const provider = getProvider();
console.log(`\n\x1b[1mSEBARAN ANAKAN\x1b[0m   ${N} anak dari G0 x G1, plus kedua induk`);
console.log(`penyedia ${provider.name}, 1 run per agent\n`);

// Trait kunci tiap anak, dicatat sebelum arena supaya bisa dikaitkan dengan skor.
console.log(`  ${"agent".padEnd(18)} security  aesthetic`);
for (const c of contestants) {
  const e = express(c.genome, c.seed);
  console.log(`  ${c.label.padEnd(18)} ${traitName(LOCUS.SECURITY_INSTINCT, e[LOCUS.SECURITY_INSTINCT]).padEnd(9)} ${traitName(LOCUS.AESTHETIC, e[LOCUS.AESTHETIC])}`);
}
console.log();

const { results, rubricHash } = await runRound({
  jobDir: "arena/jobs/staking-landing",
  contestants, runsPerAgent: 1, provider,
  onEvent: (m) => process.stdout.write(`  \x1b[2m${m}…\x1b[0m\n`),
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
await Bun.write(`arena/results/litter-${stamp}.json`, JSON.stringify({
  ranAt: new Date().toISOString(), provider: provider.name, rubricHash, kind: "litter",
  agents: results.map((r) => ({
    id: r.contestant.id, label: r.contestant.label,
    genome: r.contestant.genome.toString(), seed: r.contestant.seed.toString(),
    modules: r.modules, median: r.median,
    runs: r.runs.map((x) => ({
      run: x.run, total: x.total, gated: x.deterministic.gated,
      deterministic: x.deterministic.total, lines: x.deterministic.lines,
      metrics: x.deterministic.metrics, judge: x.judgeScore, error: x.error,
    })),
  })),
}, null, 2));

// --- laporan ---
const parents = results.slice(0, 2);
const kids = results.slice(2);
const pa = parents[0].median, pb = parents[1].median;
const lo = Math.min(pa, pb), hi = Math.max(pa, pb);

console.log(`\n\x1b[1mSEBARAN\x1b[0m`);
const all = results.map((r) => r.median).filter((x) => x > 0);
const min = Math.min(...all, lo), max = Math.max(...all, hi);
const col = (v: number) => Math.round(((v - min) / Math.max(max - min, 1)) * 46);

for (const r of results) {
  const isKid = r.contestant.id >= 100;
  const v = r.median;
  const gated = r.runs.every((x) => x.deterministic.gated);
  const mark = gated ? "\x1b[31m×\x1b[0m" : v > hi ? "\x1b[32m●\x1b[0m" : v < lo ? "\x1b[31m●\x1b[0m" : "\x1b[33m●\x1b[0m";
  const bar = gated ? "\x1b[2m(gagal di gerbang)\x1b[0m" : " ".repeat(col(v)) + mark;
  console.log(`  ${r.contestant.label.padEnd(18)} ${String(v).padStart(5)}  ${bar}`);
}

const done = kids.filter((k) => !k.runs.every((x) => x.deterministic.gated));
const above = done.filter((k) => k.median > hi).length;
const between = done.filter((k) => k.median <= hi && k.median >= lo).length;
const below = done.filter((k) => k.median < lo).length;

console.log(`\n\x1b[1mRINGKASAN\x1b[0m  induk: ${parents[0].contestant.label.split(" ")[0]}=${pa}  ${parents[1].contestant.label.split(" ")[0]}=${pb}`);
console.log(`  ${done.length}/${kids.length} anak selesai (${kids.length - done.length} kena gerbang)`);
console.log(`  \x1b[32m${above}\x1b[0m melewati KEDUA induk`);
console.log(`  \x1b[33m${between}\x1b[0m di antara keduanya`);
console.log(`  \x1b[31m${below}\x1b[0m di bawah keduanya`);
if (done.length) {
  const m = done.map((k) => k.median);
  console.log(`  rentang anak ${Math.min(...m)} – ${Math.max(...m)}, rata-rata ${(m.reduce((a, b) => a + b, 0) / m.length).toFixed(1)}`);
}
console.log(above > 0
  ? `\n  \x1b[32mHybrid vigor TERJADI pada ${above} dari ${done.length} anak yang selesai.\x1b[0m`
  : `\n  \x1b[33mTidak ada anak yang melewati kedua induk pada ronde ini.\x1b[0m`);
console.log();
