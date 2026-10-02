import { afterEach, expect, test } from "bun:test";
import { addPending, listPending, removePending } from "./pending";

const mem = new Map<string, string>();
const fake = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
(globalThis as { localStorage?: unknown }).localStorage = fake;
afterEach(() => mem.clear());

test("tambah, daftar (terbaru dulu), hapus", () => {
  addPending({ hash: "0x1", label: "buat agent", at: 1 });
  addPending({ hash: "0x2", label: "sewa", at: 2 });
  expect(listPending().map((p) => p.hash)).toEqual(["0x2", "0x1"]);
  removePending("0x1");
  expect(listPending().map((p) => p.hash)).toEqual(["0x2"]);
});
test("paling banyak 20, yang tertua dibuang", () => {
  for (let i = 0; i < 25; i++) addPending({ hash: `0x${i}`, label: "x", at: i });
  const l = listPending();
  expect(l).toHaveLength(20);
  expect(l.at(-1)?.hash).toBe("0x5");
});
test("penyimpanan yang melempar galat tidak membuat fungsi melempar", () => {
  (globalThis as { localStorage?: unknown }).localStorage = { getItem() { throw new Error("diblokir"); }, setItem() { throw new Error("diblokir"); }, removeItem() { throw new Error("diblokir"); } };
  expect(() => addPending({ hash: "0x9", label: "x", at: 1 })).not.toThrow();
  expect(listPending()).toEqual([]);
  expect(() => removePending("0x9")).not.toThrow();
  (globalThis as { localStorage?: unknown }).localStorage = fake;
});
