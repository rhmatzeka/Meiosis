import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Metrics } from "./metrics";

const dir = mkdtempSync(join(tmpdir(), "meiosis-metrics-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const day = (d: number, h = 5) => Date.UTC(2026, 9, d, h);

test("funnel menghitung akun unik per langkah", () => {
  const m = new Metrics(join(dir, "a.json"), "garam");
  m.record("masuk", "privy:1", day(1)); m.record("masuk", "privy:1", day(1)); m.record("masuk", "privy:2", day(1));
  m.record("buat", "privy:1", day(1)); m.record("buat", "privy:1", day(1));
  m.record("tugas", "privy:1", day(1));
  const f = m.funnel("2026-10-01", "2026-10-01");
  expect(f.steps).toMatchObject({ masuk: 2, buat: 1, tugas: 1, coba: 0, kawin: 0, "pasang-harga": 0, "tugas-berbayar": 0 });
});

test("D7: akun yang kembali tepat 7 hari setelah pertama masuk", () => {
  const m = new Metrics(join(dir, "b.json"), "garam");
  m.record("masuk", "privy:1", day(1)); m.record("masuk", "privy:1", day(8));
  m.record("masuk", "privy:2", day(1)); m.record("masuk", "privy:2", day(3));
  expect(m.funnel("2026-10-01", "2026-10-08").d7).toEqual({ cohort: 2, returned: 1 });
});

test("bertahan setelah restart, dan berkas tidak memuat identitas mentah", () => {
  const f = join(dir, "c.json");
  new Metrics(f, "garam").record("masuk", "privy:did:privy:abc", day(2));
  expect(new Metrics(f, "garam").funnel("2026-10-02", "2026-10-02").steps.masuk).toBe(1);
  expect(readFileSync(f, "utf8")).not.toContain("privy:");
});
