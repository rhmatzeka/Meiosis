/**
 * Uji diskriminasi — PLAN.md §22.2.
 *
 * Pertanyaannya bukan "siapa menang", melainkan: apakah perbedaan genome
 * terlihat di skor sama sekali? Kalau G0 dan G1 mendapat angka yang mengumpul,
 * arena tidak akan pernah bisa membuktikan apa pun, dan penyebabnya harus
 * dicari dulu — job yang kurang membedakan, atau model yang kurang patuh.
 *
 * Dijalankan SEBELUM sisa arena dibangun, karena jawabannya menentukan anggaran
 * dan bisa membatalkan asumsi utama proyek.
 */
import { meiosis } from "../packages/shared/src/genome";
import { FOUNDERS } from "../packages/shared/src/founders";
import { runRound, type Contestant } from "../arena/run-round";
import { getProvider } from "../runtime/providers";

const RUNS = Number(process.env.RUNS ?? 1);
const childSeed = 0x5eedn;

const contestants: Contestant[] = [
  { id: 1, label: "G0 Solidity Smith", genome: FOUNDERS[0].genome, seed: 0n },
  { id: 2, label: "G1 Pixel Sense", genome: FOUNDERS[1].genome, seed: 0n },
  { id: 5, label: "Anak G0 x G1", genome: meiosis(FOUNDERS[0].genome, FOUNDERS[1].genome, childSeed), seed: childSeed },
];

const provider = getProvider();
console.log(`\n\x1b[1mUJI DISKRIMINASI\x1b[0m   penyedia ${provider.name}, ${RUNS} run per agent\n`);

const { results, rubricHash } = await runRound({
  jobDir: "arena/jobs/staking-landing",
  contestants, runsPerAgent: RUNS, provider,
  onEvent: (m) => process.stdout.write(`  \x1b[2m${m}…\x1b[0m\n`),
});

console.log(`\n\x1b[1mHASIL\x1b[0m  rubricHash ${rubricHash.slice(0, 18)}…\n`);
console.log(`  ${"agent".padEnd(20)} ${"det".padEnd(6)} ${"judge".padEnd(6)} total   catatan`);
for (const r of results) {
  for (const run of r.runs) {
    const det = run.deterministic.gated ? "GATE" : `${run.deterministic.total}/70`;
    const jg = run.judgeScore ? `${run.judgeScore.total}/30` : "-";
    const note = run.error ?? run.deterministic.lines.find((l) => l.key === "gate")?.detail ?? "";
    console.log(`  ${r.contestant.label.padEnd(20)} ${det.padEnd(6)} ${jg.padEnd(6)} ${String(run.total).padEnd(7)} ${note}`);
  }
}

console.log(`\n\x1b[1mRINCIAN DETERMINISTIK\x1b[0m`);
for (const r of results) {
  const best = r.runs.find((x) => !x.deterministic.gated);
  if (!best) { console.log(`  ${r.contestant.label}: semua run kena gerbang`); continue; }
  console.log(`  \x1b[1m${r.contestant.label}\x1b[0m  (${r.modules.length} modul: ${r.modules.join(", ")})`);
  for (const l of best.deterministic.lines) {
    console.log(`    ${l.key.padEnd(18)} ${String(l.points).padStart(5)}/${String(l.max).padEnd(3)} ${l.detail}`);
  }
  if (best.judgeScore) {
    const j = best.judgeScore;
    console.log(`    judge              ${String(j.total).padStart(5)}/30  vh${j.visualHierarchy} dc${j.designCoherence} cc${j.copyClarity} — ${j.alasan}`);
  }
}

console.log(`\n\x1b[1mMEDIAN\x1b[0m  ${results.map((r) => `${r.contestant.label.split(" ")[0]}=${r.median}`).join("  ")}`);

// Sebaran hanya bermakna di antara agent yang LOLOS gerbang. Agent yang kena
// gerbang mendapat 0, dan memasukkannya akan membuat sebaran tampak besar
// padahal yang terukur cuma kegagalan teknis — itu terjadi di percobaan pertama
// dan sempat menghasilkan verdict yang menyesatkan.
const finished = results.filter((r) => r.runs.some((x) => !x.deterministic.gated));
const gated = results.length - finished.length;
if (finished.length < 2) {
  console.log(`  \x1b[31mTIDAK KONKLUSIF\x1b[0m — hanya ${finished.length} agent yang lolos gerbang`);
} else {
  const m = finished.map((r) => r.median);
  const spread = Math.max(...m) - Math.min(...m);
  if (gated > 0) console.log(`  \x1b[33m${gated} agent kena gerbang, tidak ikut dihitung\x1b[0m`);
  console.log(`  sebaran di antara ${finished.length} yang selesai: ${spread.toFixed(1)} poin`);
  console.log(spread >= 8
    ? `  \x1b[32mTERPISAH\x1b[0m — genome berpengaruh, arena bisa membuktikan sesuatu`
    : `  \x1b[33mMENGUMPUL\x1b[0m — cari penyebabnya sebelum lanjut (PLAN.md §24)`);
}
console.log();
