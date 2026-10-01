import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SoulStore, inheritedSoul, profileFor, promptSoul, soulHash, type ProfileNode } from "./souls";

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
    expect(() => s.put("x".repeat(7001))).toThrow(/7000/);
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

describe("profil publik (profileFor)", () => {
  // pohon: 1, 2, 4 rancangan Studio; 3 = 1 × 2; 5 = 3 × 4; 6 = anak yang punya soul sendiri (disunting)
  const { composeSoul, normalizeTraits } = require("../packages/shared/src/profile") as typeof import("../packages/shared/src/profile");
  const { inheritProfile } = require("../packages/shared/src/inherit") as typeof import("../packages/shared/src/inherit");
  const { meiosis } = require("../packages/shared/src/genome") as typeof import("../packages/shared/src/genome");
  const { defaultTraits, studioGenome } = require("../packages/shared/src/studio") as typeof import("../packages/shared/src/studio");
  const g = (v: number) => studioGenome(defaultTraits().map((x, i) => (i === 1 ? v : x)));
  const soul = (role: string, traits: [string, string][], instructions: string) =>
    composeSoul({ role, traits: traits.map(([label, value]) => ({ label, value })), instructions });
  const s1 = soul("Pembuat API", [["Keahlian", "backend"], ["Stack & alat", "Go, Docker"]], "RAHASIA-1");
  const s2 = soul("Penulis iklan", [["Keahlian", "copywriting"], ["Gaya bicara", "santai"]], "RAHASIA-2");
  const s4 = soul("Perancang UI", [["Stack & alat", "Figma"], ["Bahasa", "Jawa halus"]], "RAHASIA-4");
  const s6 = soul("Versi sunting", [["Keahlian", "data"]], "RAHASIA-6");
  const seed3 = 0x1234n, seed5 = 0xbeefn, seed6 = 0x77n;
  const g3 = meiosis(g(1), g(2), seed3);
  const g5 = meiosis(g3, g(3), seed5);
  const nodes = new Map<number, ProfileNode>([
    [1, { genome: g(1), seed: 0n, parents: [0, 0], soulText: s1 }],
    [2, { genome: g(2), seed: 0n, parents: [0, 0], soulText: s2 }],
    [3, { genome: g3, seed: seed3, parents: [1, 2], soulText: null }],
    [4, { genome: g(3), seed: 0n, parents: [0, 0], soulText: s4 }],
    [5, { genome: g5, seed: seed5, parents: [3, 4], soulText: null }],
    [6, { genome: meiosis(g(1), g(2), seed6), seed: seed6, parents: [1, 2], soulText: s6 }],
  ]);
  const look = (id: number) => nodes.get(id);

  test("agent Studio memakai profilnya sendiri", () => {
    expect(profileFor(1, look)).toEqual({ role: "Pembuat API", traits: normalizeTraits([{ label: "Keahlian", value: "backend" }, { label: "Stack & alat", value: "Go, Docker" }]), inherited: false });
  });

  test("tiga generasi sama dengan inheritProfile manual", () => {
    const p1 = profileFor(1, look), p2 = profileFor(2, look), p4 = profileFor(4, look);
    const p3 = inheritProfile(p1, p2, g3, seed3);
    const p5 = inheritProfile({ role: p3.role, traits: p3.traits }, p4, g5, seed5);
    expect(profileFor(3, look)).toMatchObject({ role: p3.role, traits: p3.traits, inherited: true });
    expect(profileFor(5, look)).toMatchObject({ role: p5.role, traits: p5.traits, inherited: true });
  });

  test("anak yang sudah disunting memakai soul miliknya, bukan warisan", () => {
    expect(profileFor(6, look)).toMatchObject({ role: "Versi sunting", inherited: false });
  });

  test("profil publik tidak pernah memuat instruksi", () => {
    for (const id of [1, 2, 3, 4, 5, 6]) expect(JSON.stringify(profileFor(id, look))).not.toContain("RAHASIA");
  });

  test("agent tanpa soul dan tanpa induk: profil kosong", () => {
    const empty = new Map<number, ProfileNode>([[9, { genome: 0n, seed: 0n, parents: [0, 0], soulText: "Soul lama tanpa profil" }]]);
    expect(profileFor(9, (i) => empty.get(i))).toEqual({ role: "", traits: [], inherited: false });
  });
});

describe("instruksi untuk prompt (promptSoul)", () => {
  test("instruksi rahasia leluhur digabung tanpa blok profil; profil ikut terpisah", () => {
    const { composeSoul } = require("../packages/shared/src/profile") as typeof import("../packages/shared/src/profile");
    const texts = new Map([["hA", composeSoul({ role: "A", traits: [{ label: "Hobi", value: "bola" }], instructions: "Instruksi A." })], ["hB", "Instruksi B."]]);
    const tree = new Map<number, { soulHash: string | null; parents: number[] }>([
      [1, { soulHash: "hA", parents: [0, 0] }], [2, { soulHash: "hB", parents: [0, 0] }], [3, { soulHash: null, parents: [1, 2] }],
    ]);
    const s = promptSoul(3, { role: "A", traits: [{ label: "Hobi", value: "bola" }] }, (i) => tree.get(i), (h) => texts.get(h) ?? null);
    expect(s.instructions).toBe("Instruksi A.\n\nInstruksi B.");
    expect(s.instructions).not.toContain("[profil]");
    expect(s.traits).toEqual([{ label: "Hobi", value: "bola" }]);
  });
});

test("soul 12 sifat × 200 karakter + instruksi 4000 bisa disimpan", () => {
  const { composeSoul } = require("../packages/shared/src/profile") as typeof import("../packages/shared/src/profile");
  const text = composeSoul({
    role: "r".repeat(120),
    traits: Array.from({ length: 12 }, (_, i) => ({ label: `Sifat ke ${i}`, value: "v".repeat(200) })),
    instructions: "i".repeat(4000),
  });
  expect(() => new SoulStore(join(dir, "big.json")).put(text)).not.toThrow();
});
