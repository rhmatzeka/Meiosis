import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SoulStore, inheritedSoul, soulHash } from "./souls";

const dir = mkdtempSync(join(tmpdir(), "meiosis-souls-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("SoulStore", () => {
  test("teks disimpan dan diambil lewat hash-nya", () => {
    const s = new SoulStore(join(dir, "a.json"));
    const h = s.put("Kamu agent yang ramah.");
    expect(h).toBe(soulHash("Kamu agent yang ramah."));
    expect(s.get(h)).toBe("Kamu agent yang ramah.");
    expect(new SoulStore(join(dir, "a.json")).get(h)).toBe("Kamu agent yang ramah.");
  });

  test("spasi di ujung dan akhir baris Windows tidak mengubah hash", () => {
    expect(soulHash("  Halo\r\ndunia  ")).toBe(soulHash("Halo\ndunia"));
  });

  test("teks kosong dan terlalu panjang ditolak", () => {
    const s = new SoulStore(join(dir, "b.json"));
    expect(() => s.put("   ")).toThrow(/kosong/);
    expect(() => s.put("x".repeat(4001))).toThrow(/4000/);
  });

  test("hash yang tidak dikenal menghasilkan null", () => {
    expect(new SoulStore(join(dir, "c.json")).get("0x" + "0".repeat(64))).toBeNull();
  });
});

describe("inheritedSoul", () => {
  const store = new Map<string, string>([["hA", "Instruksi A."], ["hB", "Instruksi B."], ["hC", "Instruksi C."]]);
  const get = (h: string) => store.get(h) ?? null;
  const agents = new Map<number, { soulHash: string | null; parents: number[] }>([
    [1, { soulHash: "hA", parents: [0, 0] }],
    [2, { soulHash: "hB", parents: [0, 0] }],
    [3, { soulHash: null, parents: [0, 0] }],   // founder tanpa instruksi
    [4, { soulHash: null, parents: [1, 2] }],   // anak A × B
    [5, { soulHash: "hC", parents: [0, 0] }],
    [6, { soulHash: null, parents: [4, 5] }],   // cucu
    [7, { soulHash: null, parents: [4, 1] }],   // A muncul dua kali
  ]);
  const of = (id: number) => inheritedSoul(id, (i) => agents.get(i), get);

  test("agent rancangan memakai instruksinya sendiri", () => {
    expect(of(1)).toEqual({ text: "Instruksi A.", sources: [1] });
  });

  test("anak mewarisi instruksi kedua induk, induk pertama dulu", () => {
    expect(of(4)).toEqual({ text: "Instruksi A.\n\nInstruksi B.", sources: [1, 2] });
  });

  test("cucu mewarisi dari seluruh garis keturunannya", () => {
    expect(of(6).sources).toEqual([1, 2, 5]);
  });

  test("instruksi yang sama tidak diulang", () => {
    expect(of(7)).toEqual({ text: "Instruksi A.\n\nInstruksi B.", sources: [1, 2] });
  });

  test("tanpa instruksi di garis keturunan: kosong", () => {
    expect(of(3)).toEqual({ text: "", sources: [] });
  });

  test("total dibatasi supaya prompt tidak membengkak", () => {
    const long = new Map<number, { soulHash: string | null; parents: number[] }>([
      [1, { soulHash: "x", parents: [0, 0] }], [2, { soulHash: "y", parents: [0, 0] }], [3, { soulHash: null, parents: [1, 2] }],
    ]);
    const texts = new Map([["x", "a".repeat(4000)], ["y", "b".repeat(4000)]]);
    const r = inheritedSoul(3, (i) => long.get(i), (h) => texts.get(h) ?? null, 6000);
    expect(r.text.length).toBeLessThanOrEqual(6000);
    expect(r.text.startsWith("a")).toBe(true);
  });
});
