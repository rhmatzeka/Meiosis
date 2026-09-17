/**
 * Menerapkan bobot rubrik pada angka yang dihasilkan sandbox.
 *
 * Tidak ada pengukuran yang terjadi di sini — semuanya sudah diukur di dalam
 * container. Pemisahan ini membuat rubrik bisa diubah dan diterapkan ulang pada
 * artefak lama tanpa menjalankan agent sekali lagi, dan membuat siapa pun bisa
 * memverifikasi skor dari artefak yang dipublikasikan.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SandboxResult } from "../../sandbox/run";
import { scoreDesign, type VisualFacts } from "./design";

export interface Checks {
  jobId: string;
  rubricVersion: number;
  deterministic: Record<string, {
    points: number; zeroAt?: number; worstAt?: number; bestAt?: number; keys?: string[];
  }>;
  judge: Record<string, { points: number }>;
}

export interface ScoreLine { key: string; points: number; max: number; detail: string }
export interface DeterministicScore {
  gated: boolean;
  total: number;
  max: number;
  lines: ScoreLine[];
  metrics: Record<string, number | boolean>;
}

const readJson = (dir: string, f: string) =>
  existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), "utf8")) : null;

/** Nilai turun linear dari `best` (poin penuh) ke `worst` (nol). */
function ramp(value: number, best: number, worst: number, points: number): number {
  if (value <= best) return points;
  if (value >= worst) return 0;
  return Math.round(((worst - value) / (worst - best)) * points * 10) / 10;
}

export function scoreDeterministic(r: SandboxResult, checks: Checks): DeterministicScore {
  const d = checks.deterministic;
  const bundle = readJson(r.outDir, "bundle.json") ?? { totalKb: 9999 };
  const patterns = readJson(r.outDir, "patterns.json") ?? { dangerous: [] };
  const eslint = readJson(r.outDir, "eslint.json") ?? [];
  const positives = (readJson(r.outDir, "positives.json")?.positives ?? {}) as Record<string, boolean>;

  const eslintSecurityErrors = (eslint as { messages?: { ruleId?: string; severity: number }[] }[])
    .flatMap((f) => f.messages ?? [])
    .filter((m) => m.severity === 2 && (m.ruleId ?? "").startsWith("security/")).length;
  const securityFindings = eslintSecurityErrors + (patterns.dangerous?.length ?? 0);

  const axeCount = (r.render?.axeViolations ?? []).reduce((s, v) => s + v.count, 0);
  const bundleKb = bundle.totalKb as number;
  const noOverflow = r.render?.horizontalOverflowOnMobile === false;

  const metrics = {
    rendersOk: r.rendersOk, typecheckOk: r.typecheckOk, buildOk: r.buildOk,
    securityFindings, axeViolations: axeCount, bundleKb, mobileNoOverflow: noOverflow,
    ...positives,
    consoleErrors: r.render?.consoleErrors.length ?? 0,
  };

  const max = Object.values(d).reduce((s, x) => s + x.points, 0);

  // Gerbang: halaman yang tidak benar-benar merender isi mendapat nol.
  // Ini bukan "build gagal" — vite meloloskan kode rusak. Lihat PLAN.md §11.2.
  if (!r.rendersOk) {
    return {
      gated: true, total: 0, max, metrics,
      lines: [{
        key: "gate", points: 0, max,
        detail: r.timedOut ? "waktu habis"
          : !r.buildOk ? "build gagal"
          : `merender ${metrics.consoleErrors} galat konsol / isi kosong`,
      }],
    };
  }

  /** Bagian dari daftar cek positif yang terpenuhi. */
  const hits = (keys: string[] = []) => keys.filter((k) => positives[k]).length;
  const design = scoreDesign(r.render?.visual as VisualFacts | undefined, d.designQuality.points);

  const robustKeys = d.inputRobustness.keys ?? [];
  const a11yKeys = d.a11yPositives.keys ?? [];
  const robustHits = hits(robustKeys);
  const a11yHits = hits(a11yKeys);

  const lines: ScoreLine[] = [
    { key: "rendersOk", points: d.rendersOk.points, max: d.rendersOk.points, detail: "halaman merender isi tanpa galat" },
    { key: "typecheckOk", points: r.typecheckOk ? d.typecheckOk.points : 0, max: d.typecheckOk.points,
      detail: r.typecheckOk ? "tsc bersih" : "tsc menemukan galat" },
    { key: "securityFindings", points: ramp(securityFindings, d.securityFindings.zeroAt ?? 0, d.securityFindings.worstAt ?? 4, d.securityFindings.points),
      max: d.securityFindings.points, detail: `${securityFindings} temuan` },
    // Cek POSITIF: menghindari hal buruk saja tidak cukup untuk membedakan agent.
    { key: "inputRobustness",
      points: Math.round((robustHits / Math.max(robustKeys.length, 1)) * d.inputRobustness.points * 10) / 10,
      max: d.inputRobustness.points,
      detail: `${robustHits}/${robustKeys.length}: ${robustKeys.filter((k) => positives[k]).join(", ") || "tidak ada"}` },
    { key: "axeViolations", points: ramp(axeCount, d.axeViolations.zeroAt ?? 0, d.axeViolations.worstAt ?? 8, d.axeViolations.points),
      max: d.axeViolations.points, detail: `${axeCount} pelanggaran a11y` },
    { key: "a11yPositives",
      points: Math.round((a11yHits / Math.max(a11yKeys.length, 1)) * d.a11yPositives.points * 10) / 10,
      max: d.a11yPositives.points,
      detail: `${a11yHits}/${a11yKeys.length}: ${a11yKeys.filter((k) => positives[k]).join(", ") || "tidak ada"}` },
    { key: "designQuality", points: design.total, max: design.max, detail: design.detail },
    { key: "bundleKb", points: ramp(bundleKb, d.bundleKb.bestAt ?? 220, d.bundleKb.worstAt ?? 600, d.bundleKb.points),
      max: d.bundleKb.points, detail: `${bundleKb} kB` },
  ];

  const total = Math.round(lines.reduce((s, l) => s + l.points, 0) * 10) / 10;
  return { gated: false, total, max, lines, metrics };
}
