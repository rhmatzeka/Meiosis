// server/quota.test.ts
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QuotaLedger, dayKey } from "./quota";

const dir = mkdtempSync(join(tmpdir(), "meiosis-quota-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const cfg = { tasksPerDay: 2, studioPerDay: 1, tokenBudget: 1_000_000, resetHourUtc: 0 };
const T0 = Date.UTC(2026, 9, 1, 5, 0);   // 1 Okt 12.00 WIB
const file = (n: string) => join(dir, n);

test("jatah per akun habis, akun lain tidak terpengaruh", () => {
  const q = new QuotaLedger(file("a.json"), cfg);
  expect(q.reserveTask("privy:1", T0).ok).toBe(true);
  expect(q.reserveTask("privy:1", T0).ok).toBe(true);
  const third = q.reserveTask("privy:1", T0);
  expect(third).toMatchObject({ ok: false, reason: "jatah-akun" });
  expect(q.reserveTask("privy:2", T0).ok).toBe(true);
});
test("tugas gagal sebelum model dipanggil mengembalikan jatah", () => {
  const q = new QuotaLedger(file("b.json"), cfg);
  const r = q.reserveTask("privy:1", T0);
  if (!r.ok) throw new Error("harus lolos");
  q.release(r.ticket);
  expect(q.snapshot(T0).byUser["privy:1"]?.tasks ?? 0).toBe(0);
});
test("anggaran token global menghentikan semua akun", () => {
  const q = new QuotaLedger(file("c.json"), { ...cfg, tasksPerDay: 100, tokenBudget: 5_000 }, 1_000);
  const r = q.reserveTask("privy:1", T0);
  if (!r.ok) throw new Error("harus lolos");
  q.settle(r.ticket, 5_000);
  expect(q.reserveTask("privy:2", T0)).toMatchObject({ ok: false, reason: "anggaran-harian" });
});
test("tercatat di berkas: restart server tidak mengembalikan jatah", () => {
  new QuotaLedger(file("d.json"), cfg).reserveTask("privy:1", T0);
  const again = new QuotaLedger(file("d.json"), cfg);
  again.reserveTask("privy:1", T0);
  expect(again.reserveTask("privy:1", T0).ok).toBe(false);
});
test("jatah pulih pada jam reset (07.00 WIB = 00.00 UTC)", () => {
  const q = new QuotaLedger(file("e.json"), cfg);
  q.reserveTask("privy:1", T0); q.reserveTask("privy:1", T0);
  const before = Date.UTC(2026, 9, 1, 23, 59), after = Date.UTC(2026, 9, 2, 0, 0);
  expect(q.reserveTask("privy:1", before).ok).toBe(false);
  expect(q.reserveTask("privy:1", after).ok).toBe(true);
  expect(dayKey(before, 0)).not.toBe(dayKey(after, 0));
});
test("batas Studio per akun per hari", () => {
  const q = new QuotaLedger(file("f.json"), cfg);
  expect(q.reserveStudio("privy:1", T0).ok).toBe(true);
  expect(q.reserveStudio("privy:1", T0).ok).toBe(false);
});
test("pemakaian sistem (saran AI) masuk anggaran tanpa memakai jatah akun", () => {
  const q = new QuotaLedger(file("g.json"), { ...cfg, tokenBudget: 5_000 }, 1_000);
  expect(q.canSpend(4_000, T0)).toBe(true);
  q.addTokens("sistem:saran", 4_500, T0);
  expect(q.canSpend(1_000, T0)).toBe(false);
  expect(q.reserveTask("privy:1", T0)).toMatchObject({ ok: false, reason: "anggaran-harian" });
  expect(q.snapshot(T0).byUser["privy:1"]).toBeUndefined();
});
test("sisa jatah per akun dan kapan pulih", () => {
  const q = new QuotaLedger(file("h.json"), cfg);
  q.reserveTask("privy:1", T0);
  expect(q.left("privy:1", T0)).toEqual({ tasks: 1, tasksPerDay: 2, studio: 1, studioPerDay: 1, resetsAt: Date.UTC(2026, 9, 2, 0, 0) });
});
test("batas bisa diubah admin tanpa restart", () => {
  const q = new QuotaLedger(file("i.json"), cfg);
  q.reserveTask("privy:1", T0); q.reserveTask("privy:1", T0);
  q.configure({ tasksPerDay: 5 });
  expect(q.reserveTask("privy:1", T0).ok).toBe(true);
});
