import { expect, test } from "bun:test";
import { checkRent, effectiveRentWei, type RentEvent } from "./rent";

const ev = (o: Partial<RentEvent> = {}): RentEvent => ({ agentId: 7, amount: 10n, market: "0xMarket", ...o });
const base = { agentId: 7, priceWei: 10n, market: "0xmarket", txHash: "0xaaa", used: new Set<string>() };

test("harga sewa efektif: harga pemilik bila ada, selain itu bawaan platform", () => {
  expect(effectiveRentWei(0n, 5n)).toBe(5n);
  expect(effectiveRentWei(12n, 5n)).toBe(12n);
});

test("bukti sewa yang sah diterima", () => {
  expect(checkRent([ev()], base)).toEqual({ ok: true });
});

test("tx yang sudah dipakai ditolak", () => {
  const r = checkRent([ev()], { ...base, used: new Set(["0xaaa"]) });
  expect(r.ok).toBe(false);
  expect(!r.ok && r.error).toContain("sudah dipakai");
});

test("bayar kurang dari harga ditolak", () => {
  const r = checkRent([ev({ amount: 9n })], base);
  expect(!r.ok && r.error).toContain("kurang");
});

test("sewa untuk agent lain ditolak", () => {
  const r = checkRent([ev({ agentId: 8 })], base);
  expect(!r.ok && r.error).toContain("bukan sewa");
});

test("event dari kontrak lain ditolak (alamat pasar dicocokkan tanpa peduli huruf besar)", () => {
  expect(checkRent([ev({ market: "0xPalsu" })], base).ok).toBe(false);
  expect(checkRent([ev({ market: "0xMARKET" })], base).ok).toBe(true);
});

test("tx tanpa event sewa ditolak", () => {
  expect(checkRent([], base).ok).toBe(false);
});
