import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FeedbackStore, HiddenList, isAdmin } from "./admin";

const dir = mkdtempSync(join(tmpdir(), "meiosis-admin-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const A = "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720";

test("isAdmin: hanya alamat di ADMIN_ADDRESSES, tidak peka huruf besar/kecil", () => {
  expect(isAdmin(A.toLowerCase(), { ADMIN_ADDRESSES: `0x1111111111111111111111111111111111111111, ${A}` })).toBe(true);
  expect(isAdmin("0x2222222222222222222222222222222222222222", { ADMIN_ADDRESSES: A })).toBe(false);
  expect(isAdmin("", { ADMIN_ADDRESSES: A })).toBe(false);
  expect(isAdmin(A, { ADMIN_ADDRESSES: "" })).toBe(false);
  expect(isAdmin(A, {})).toBe(false);
});

test("HiddenList bertahan setelah restart dan bisa dibuka lagi", () => {
  const f = join(dir, "hidden.json");
  new HiddenList(f).hide(7, "penipuan");
  const again = new HiddenList(f);
  expect(again.has(7)).toBe(true);
  expect(again.list()).toEqual([{ id: 7, reason: "penipuan", at: expect.any(Number) }]);
  again.unhide(7);
  expect(new HiddenList(f).has(7)).toBe(false);
});

test("masukan dibatasi 5 per akun per hari dan dipotong 1000 karakter", () => {
  const fb = new FeedbackStore(join(dir, "fb.json"), "garam");
  const T = Date.UTC(2026, 9, 2, 5);
  for (let i = 0; i < 5; i++) expect(fb.add("privy:1", "x".repeat(2000), "/studio", T).ok).toBe(true);
  expect(fb.add("privy:1", "lagi", "/", T).ok).toBe(false);
  expect(fb.add("privy:2", "akun lain", "/", T).ok).toBe(true);
  const items = fb.latest(30);
  expect(items[0].text).toBe("akun lain");
  expect(items[1].text).toHaveLength(1000);
  expect(JSON.stringify(items)).not.toContain("privy:");
});
