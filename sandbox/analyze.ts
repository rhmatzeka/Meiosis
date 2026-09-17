/**
 * Pengukuran deterministik yang tidak butuh browser: ukuran bundel dan pola
 * berbahaya di sumber kode.
 *
 * Dijalankan DI DALAM container bersama yang lain. Memisahkan "mengukur" dari
 * "memberi nilai" disengaja: sandbox hanya menghasilkan angka, dan seluruh
 * kebijakan pembobotan hidup di host pada arena/scorers/. Dengan begitu rubrik
 * bisa diubah tanpa menjalankan ulang agent.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = "/work/out";

// --- ukuran bundel ---
let jsBytes = 0, cssBytes = 0;
const assets = join("/work/dist", "assets");
if (existsSync(assets)) {
  for (const f of readdirSync(assets)) {
    const size = statSync(join(assets, f)).size;
    if (f.endsWith(".js")) jsBytes += size;
    if (f.endsWith(".css")) cssBytes += size;
  }
}
Bun.write(join(OUT, "bundle.json"), JSON.stringify({
  jsKb: Math.round(jsBytes / 1024),
  cssKb: Math.round(cssBytes / 1024),
  totalKb: Math.round((jsBytes + cssBytes) / 1024),
}, null, 2));

// --- pola berbahaya yang harus selalu ditangkap, terlepas dari eslint ---
const DANGEROUS: [string, RegExp][] = [
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/],
  ["eval", /\beval\s*\(/],
  ["new Function", /new\s+Function\s*\(/],
  ["innerHTML langsung", /\.innerHTML\s*=/],
  ["target=_blank tanpa noopener", /target\s*=\s*["']_blank["'](?![^>]*noopener)/],
  ["rahasia tertanam", /(api[_-]?key|secret|private[_-]?key)\s*[:=]\s*["'][^"']{12,}/i],
];

const files: string[] = [];
const walk = (dir: string) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|jsx|html)$/.test(e.name)) files.push(p);
  }
};
walk("/work/src");
if (existsSync("/work/index.html")) files.push("/work/index.html");

const hits: { file: string; pattern: string }[] = [];
let sourceBytes = 0;
for (const f of files.sort()) {
  const src = readFileSync(f, "utf8");
  sourceBytes += src.length;
  for (const [name, re] of DANGEROUS) {
    if (re.test(src)) hits.push({ file: f.replace("/work/", ""), pattern: name });
  }
}
Bun.write(join(OUT, "patterns.json"), JSON.stringify({
  fileCount: files.length, sourceBytes, dangerous: hits,
}, null, 2));

console.log(`analisis: ${Math.round((jsBytes + cssBytes) / 1024)}kB bundel, ${hits.length} pola berbahaya`);

// ---------------------------------------------------------------------------
// Cek POSITIF: apakah agent melakukan hal baik, bukan sekadar menghindari hal
// buruk. Uji diskriminasi pertama menunjukkan seluruh cek negatif dilewati
// semua agent dengan nilai sempurna — rubrik yang hanya mengukur lantai tidak
// bisa membedakan siapa pun. Lihat PLAN.md §11.2.
// ---------------------------------------------------------------------------
const allSource = files.map((f) => readFileSync(f, "utf8")).join("\n");

const POSITIVE: [string, RegExp][] = [
  // ketahanan terhadap input pengguna
  ["validasiAngka", /isNaN|Number\.isFinite|parseFloat|parseInt|type\s*=\s*["']number["']/],
  ["batasNilai", /\b(min|max|step)\s*=|<=|>=|Math\.(min|max)/],
  ["stateGalat", /\b(error|invalid|isError|errorMessage)\b/i],
  ["tombolNonaktif", /disabled\s*=/],
  ["cegahSubmitDefault", /preventDefault/],
  // aksesibilitas yang disengaja
  ["labelTerkait", /htmlFor\s*=|aria-label|aria-labelledby/],
  ["tipeTombol", /<button[^>]*type\s*=/],
  ["landmarkSemantik", /<(main|header|footer|nav|section)\b/],
  ["fokusTerlihat", /:focus|focus-visible|outline/],
];

const positives = Object.fromEntries(POSITIVE.map(([k, re]) => [k, re.test(allSource)]));
Bun.write(join(OUT, "positives.json"), JSON.stringify({
  positives,
  count: Object.values(positives).filter(Boolean).length,
  max: POSITIVE.length,
}, null, 2));
console.log(`cek positif: ${Object.values(positives).filter(Boolean).length}/${POSITIVE.length}`);
