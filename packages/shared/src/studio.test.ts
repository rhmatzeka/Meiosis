import { describe, expect, test } from "bun:test";
import { LOCUS, TRAIT_COUNTS, alleleX, alleleY, dom, express, getLocus } from "./genome";
import { STUDIO_VECTORS, defaultTraits, studioGenome, validateTraits } from "./studio";

const base = defaultTraits();

describe("studioGenome", () => {
  test("setiap lokus homozigot dengan dominansi 2", () => {
    const g = studioGenome(base);
    for (let i = 0; i < 16; i++) {
      const l = getLocus(g, i);
      expect(alleleX(l)).toBe(alleleY(l));
      expect(dom(alleleX(l))).toBe(2);
    }
  });

  test("sifat yang dipilih adalah sifat yang terekspresi, tanpa batasan", () => {
    const traits = [...base];
    traits[LOCUS.MODEL_TIER] = 2;        // otak kuat sekarang boleh
    traits[LOCUS.AESTHETIC] = 2;
    traits[LOCUS.TEST_RIGOR] = 2;
    traits[LOCUS.SECURITY_INSTINCT] = 2;
    traits[LOCUS.PERSISTENCE] = 2;       // empat bakat sekaligus
    expect(express(studioGenome(traits), 0n)).toEqual(traits);
  });

  test("deterministik", () => {
    expect(studioGenome(base)).toBe(studioGenome([...base]));
  });
});

describe("validateTraits", () => {
  test("bawaan sah", () => expect(validateTraits(base)).toBeNull());
  test("harus 16 nilai", () => expect(validateTraits(base.slice(0, 15))).toContain("16"));
  test("nilai di luar jangkauan lokusnya ditolak", () => {
    const t = [...base]; t[LOCUS.STACK_AFFINITY] = TRAIT_COUNTS[LOCUS.STACK_AFFINITY];
    expect(validateTraits(t)).toContain("lokus 3");
  });
  test("nilai negatif atau bukan bilangan bulat ditolak", () => {
    const t = [...base]; t[0] = -1;
    expect(validateTraits(t)).not.toBeNull();
    const u = [...base]; u[1] = 1.5;
    expect(validateTraits(u)).not.toBeNull();
  });
  test("nilai tertinggi tiap lokus sah", () => {
    expect(validateTraits(TRAIT_COUNTS.map((c) => c - 1))).toBeNull();
  });
  test("studioGenome melempar untuk sifat tidak sah", () => {
    const t = [...base]; t[0] = 9;
    expect(() => studioGenome(t)).toThrow();
  });
});

test("vektor bersama untuk uji Solidity cocok dengan fungsi", () => {
  expect(STUDIO_VECTORS.length).toBeGreaterThanOrEqual(3);
  for (const v of STUDIO_VECTORS) expect(studioGenome(v.traits)).toBe(v.genome);
});
