/**
 * Membedah hasil sebaran anakan: mencari baris rubrik mana yang menjatuhkan
 * anak dibanding induk, dan menguji apakah sebuah modul warisan berkorelasi
 * dengan skor.
 *
 * Dipakai untuk mendiagnosis ronde 17 Sep, yang menunjukkan 0 dari 7 anak
 * melewati kedua induk. Lihat PLAN.md §22.2c.
 */
import { readFileSync, readdirSync } from "node:fs";

const files = readdirSync("arena/results").filter((f) => f.startsWith("litter-")).sort();
const file = process.argv[2] ?? `arena/results/${files.at(-1)}`;
const d = JSON.parse(readFileSync(file, "utf8"));

const kids = d.agents.filter((a: { label: string; runs: { gated: boolean }[] }) =>
  a.label.startsWith("Anak") && !a.runs[0].gated);
const parents = d.agents.filter((a: { label: string }) => !a.label.startsWith("Anak"));

console.log(`\n\x1b[1m${file}\x1b[0m\n`);

/** Apakah membawa modul tertentu berkorelasi dengan skor lebih tinggi? */
const modules = [...new Set(kids.flatMap((k: { modules: string[] }) => k.modules))] as string[];
console.log(`\x1b[1mPengaruh tiap modul pada anak\x1b[0m`);
for (const m of modules.sort()) {
  const withM = kids.filter((k: { modules: string[] }) => k.modules.includes(m));
  const without = kids.filter((k: { modules: string[] }) => !k.modules.includes(m));
  if (!withM.length || !without.length) continue;
  const avg = (xs: { median: number }[]) => xs.reduce((s, x) => s + x.median, 0) / xs.length;
  const diff = avg(withM) - avg(without);
  const mark = Math.abs(diff) >= 3 ? (diff > 0 ? "\x1b[32m" : "\x1b[31m") : "\x1b[2m";
  console.log(`  ${m.padEnd(24)} n=${withM.length} ${avg(withM).toFixed(1)}  vs  n=${without.length} ${avg(without).toFixed(1)}   ${mark}${diff >= 0 ? "+" : ""}${diff.toFixed(1)}\x1b[0m`);
}

console.log(`\n\x1b[1mBaris rubrik: anak vs induk terbaik\x1b[0m`);
const avgLines = (agents: { runs: { gated: boolean; lines: { key: string; points: number }[] }[] }[]) => {
  const acc: Record<string, number[]> = {};
  for (const a of agents) for (const l of a.runs[0].lines ?? []) (acc[l.key] ??= []).push(l.points);
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.reduce((x, y) => x + y, 0) / v.length]));
};
const pl = avgLines(parents), kl = avgLines(kids);
for (const k of Object.keys(pl)) {
  const diff = (kl[k] ?? 0) - pl[k];
  const mark = diff <= -1.5 ? "\x1b[31m  <- menjatuhkan\x1b[0m" : "";
  console.log(`  ${k.padEnd(20)} induk ${pl[k].toFixed(1).padStart(5)}   anak ${(kl[k] ?? 0).toFixed(1).padStart(5)}   ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}${mark}`);
}
console.log();
