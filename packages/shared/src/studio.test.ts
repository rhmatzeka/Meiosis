import { describe, expect, test } from "bun:test";
import { LOCUS, alleleX, alleleY, dom, express, getLocus, trait } from "./genome";
import { NO_TALENT, STUDIO_VECTORS, studioGenome, validateDesign, type Design } from "./studio";

const base: Design = { tier: 1, discipline: 1, stack: 1, verbosity: 0, talentA: LOCUS.SECURITY_INSTINCT, talentB: LOCUS.AESTHETIC };

describe("studioGenome", () => {
  test("setiap lokus homozigot dengan dominansi 1", () => {
    const g = studioGenome(base);
    for (let i = 0; i < 16; i++) {
      const l = getLocus(g, i);
      expect(alleleX(l)).toBe(alleleY(l));
      expect(dom(alleleX(l))).toBe(1);
    }
  });

  test("pilihan dan bakat terekspresi sesuai tabel", () => {
    const t = express(studioGenome(base), 0n);
    expect(t[LOCUS.MODEL_TIER]).toBe(1);
    expect(t[LOCUS.DISCIPLINE_PRIMARY]).toBe(1);
    expect(t[LOCUS.DISCIPLINE_SECONDARY]).toBe(0);
    expect(t[LOCUS.STACK_AFFINITY]).toBe(1);
    expect(t[LOCUS.SECURITY_INSTINCT]).toBe(2); // bakat
    expect(t[LOCUS.AESTHETIC]).toBe(2);         // bakat
    expect(t[LOCUS.TEST_RIGOR]).toBe(1);        // bukan bakat → sedang
    expect(t[LOCUS.PERSISTENCE]).toBe(1);
    expect(t[LOCUS.MCP_SET_A]).toBe(3);
    expect(t[LOCUS.MCP_SET_B]).toBe(0);
    expect(t[LOCUS.TOOL_TIER]).toBe(1);
    expect(t[LOCUS.VERBOSITY]).toBe(0);
    expect(t[LOCUS.RESERVED]).toBe(0);
  });

  test("tanpa bakat semua sifat kualitas sedang", () => {
    const t = express(studioGenome({ ...base, talentA: NO_TALENT, talentB: NO_TALENT }), 0n);
    for (const l of [4, 5, 6, 14]) expect(t[l]).toBe(1);
  });

  test("deterministik", () => {
    expect(studioGenome(base)).toBe(studioGenome({ ...base }));
  });
});

describe("validateDesign", () => {
  test("desain sah lolos", () => expect(validateDesign(base)).toBeNull());
  test("otak kuat ditolak", () => expect(validateDesign({ ...base, tier: 2 })).toContain("otak"));
  test("bakat kembar ditolak", () => expect(validateDesign({ ...base, talentB: base.talentA })).toContain("bakat"));
  test("dua bakat kosong boleh", () => expect(validateDesign({ ...base, talentA: NO_TALENT, talentB: NO_TALENT })).toBeNull());
  test("bakat di luar daftar ditolak", () => expect(validateDesign({ ...base, talentA: LOCUS.MODEL_TIER })).toContain("bakat"));
  test("keahlian di luar jangkauan ditolak", () => expect(validateDesign({ ...base, discipline: 6 })).toContain("keahlian"));
  test("stack di luar jangkauan ditolak", () => expect(validateDesign({ ...base, stack: 4 })).toContain("stack"));
  test("gaya bicara di luar jangkauan ditolak", () => expect(validateDesign({ ...base, verbosity: 3 })).toContain("gaya"));
  test("studioGenome melempar untuk desain tidak sah", () => expect(() => studioGenome({ ...base, tier: 2 })).toThrow());
});

test("vektor bersama untuk uji Solidity cocok dengan fungsi", () => {
  expect(STUDIO_VECTORS.length).toBeGreaterThanOrEqual(3);
  for (const v of STUDIO_VECTORS) expect(studioGenome(v.design)).toBe(v.genome);
});

test("vektor mencakup desain tanpa bakat", () => {
  expect(STUDIO_VECTORS.some((v) => v.design.talentA === NO_TALENT)).toBe(true);
  expect(trait(0)).toBe(0);
});
