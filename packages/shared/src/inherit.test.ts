// packages/shared/src/inherit.test.ts
import { describe, expect, test } from "bun:test";
import { LOCUS, allele, express, getLocus, locus, meiosis } from "./genome";
import { customSide, expressedSide, inheritProfile, sideOddsA, traitOdds } from "./inherit";
import { defaultTraits, studioGenome } from "./studio";

const ga = studioGenome(defaultTraits());
const gb = studioGenome(defaultTraits().map((v, i) => (i === LOCUS.DISCIPLINE_PRIMARY ? 3 : v)));
const A = { role: "Pembuat API", traits: [{ label: "Keahlian", value: "backend" }, { label: "Hobi", value: "sepak bola" }] };
const B = { role: "Penulis iklan", traits: [{ label: "Keahlian", value: "copywriting" }, { label: "Gaya bicara", value: "santai" }, { label: "Hobi", value: "masak" }] };
const seeds = Array.from({ length: 1000 }, (_, i) => BigInt(i + 1) * 0x9e3779b97f4a7c15n);

test("expressedSide cocok dengan express() di setiap lokus untuk 1.000 seed", () => {
  for (const seed of seeds) {
    const child = meiosis(ga, gb, seed);
    const e = express(child, seed);
    for (let i = 0; i < 16; i++) {
      const l = getLocus(child, i);
      expect(e[i]).toBe(expressedSide(child, seed, i) === "a" ? (l >> 8) & 63 : l & 63);
    }
  }
});

describe("inheritProfile", () => {
  test("sifat milik satu induk selalu turun", () => {
    expect(inheritProfile(A, B, meiosis(ga, gb, 7n), 7n).traits.find((t) => t.label === "Gaya bicara")?.value).toBe("santai");
  });
  test("kolom bawaan mengikuti alel yang terekspresi; peran ikut induk yang menurunkan Keahlian", () => {
    for (const seed of seeds.slice(0, 50)) {
      const child = meiosis(ga, gb, seed);
      const side = expressedSide(child, seed, LOCUS.DISCIPLINE_PRIMARY);
      const p = inheritProfile(A, B, child, seed);
      expect(p.traits.find((t) => t.label === "Keahlian")?.value).toBe(side === "a" ? "backend" : "copywriting");
      expect(p.role).toBe(side === "a" ? "Pembuat API" : "Penulis iklan");
    }
  });
  test("sifat buatan sendiri milik kedua induk diputuskan hash seed, deterministik", () => {
    const p1 = inheritProfile(A, B, meiosis(ga, gb, 99n), 99n);
    expect(inheritProfile(A, B, meiosis(ga, gb, 99n), 99n)).toEqual(p1);
    expect(p1.traits.find((t) => t.label === "Hobi")?.value).toBe(customSide(99n, "hobi") === "a" ? "sepak bola" : "masak");
  });
});

describe("peluang", () => {
  test("dua agent Studio: 50:50", () => expect(sideOddsA(ga, gb, LOCUS.DISCIPLINE_PRIMARY)).toBe(0.5));
  test("alel induk A berdominansi 3: 100%", () => {
    const strong = (ga & ~(0xffffn << 16n)) | (BigInt(locus(allele(3, 1), allele(3, 1))) << 16n);
    expect(sideOddsA(strong, gb, LOCUS.DISCIPLINE_PRIMARY)).toBe(1);
  });
  test("traitOdds cocok dengan sebaran nyata", () => {
    const odds = traitOdds(A, B, ga, gb);
    expect(odds.find((o) => o.label === "Gaya bicara")?.pA).toBe(0);
    const fromA = seeds.filter((s) => inheritProfile(A, B, meiosis(ga, gb, s), s).from["keahlian"] === "a").length;
    expect(Math.abs(fromA / seeds.length - odds.find((o) => o.label === "Keahlian")!.pA)).toBeLessThan(0.05);
  });
});
