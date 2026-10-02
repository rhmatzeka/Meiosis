import { expect, test } from "bun:test";
import { proofStamp } from "./proof";

test("dua bukti di milidetik yang sama tetap punya waktu berbeda", () => {
  const now = Date.parse("2026-10-02T07:40:46.652Z");
  const a = proofStamp(now), b = proofStamp(now);
  expect(a).not.toBe(b);
  expect(Date.parse(b)).toBeGreaterThan(Date.parse(a));
});

test("waktu yang lebih baru dipakai apa adanya", () => {
  const later = Date.parse("2026-10-02T08:00:00.000Z");
  expect(proofStamp(later)).toBe("2026-10-02T08:00:00.000Z");
});
