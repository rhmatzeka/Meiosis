import { describe, expect, test } from "bun:test";
import {
  G0_SOLIDITY_SMITH as SMITH, G1_PIXEL_SENSE as PIXEL, G2_DOC_WEAVER as WEAVER,
} from "../../../packages/shared/src/founders";
import {
  LOCUS, LOCUS_COUNT, alleleX, alleleY, getLocus, meiosis, trait,
} from "../../../packages/shared/src/genome";
import { canPickParent, cooldownLabel, geneOrigin, inheritanceOdds } from "./genetics";

const oddsAt = (a: bigint, b: bigint, locus: number) =>
  inheritanceOdds(a, b).find((o) => o.locus === locus)!.odds;

describe("inheritanceOdds", () => {
  test("peluang di setiap lokus berjumlah 1", () => {
    for (const [a, b] of [[SMITH, PIXEL], [PIXEL, WEAVER], [WEAVER, SMITH]]) {
      for (const { odds } of inheritanceOdds(a, b)) {
        expect(odds.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1, 10);
      }
    }
  });

  test("keamanan tinggi Solidity Smith (homozigot dominan) pasti diwariskan", () => {
    const sec = oddsAt(SMITH, PIXEL, LOCUS.SECURITY_INSTINCT);
    expect(sec).toEqual([{ trait: 2, p: 1 }]);
  });

  test("estetika tinggi Pixel Sense (heterozigot) diwariskan separuh kemungkinan", () => {
    const aes = oddsAt(SMITH, PIXEL, LOCUS.AESTHETIC);
    expect(aes.find((o) => o.trait === 2)?.p).toBeCloseTo(0.5, 10);
  });

  test("urutan hasil dari peluang terbesar", () => {
    for (const { odds } of inheritanceOdds(SMITH, PIXEL)) {
      for (let i = 1; i < odds.length; i++) expect(odds[i - 1].p).toBeGreaterThanOrEqual(odds[i].p);
    }
  });
});

describe("geneOrigin", () => {
  test("alel X dari induk pertama, Y dari induk kedua, sesuai meiosis()", () => {
    for (let s = 1n; s <= 50n; s++) {
      const seed = s * 0x9e3779b97f4a7c15n;
      const child = meiosis(SMITH, PIXEL, seed);
      const origin = geneOrigin(child, SMITH, PIXEL);
      expect(origin).toHaveLength(LOCUS_COUNT);
      for (const g of origin) {
        const l = getLocus(child, g.locus);
        const fromA = trait(alleleX(l)), fromB = trait(alleleY(l));
        expect(g.trait).toBe(g.from === "a" ? fromA : fromB);
      }
    }
  });

  test("mutasi ditandai hanya bila trait tidak ada di alel induk asalnya", () => {
    let seen = 0;
    for (let s = 1n; s <= 400n; s++) {
      const child = meiosis(SMITH, PIXEL, s * 0x51ed27n);
      for (const g of geneOrigin(child, SMITH, PIXEL)) {
        const parent = g.from === "a" ? SMITH : PIXEL;
        const pl = getLocus(parent, g.locus);
        const has = trait(alleleX(pl)) === g.trait || trait(alleleY(pl)) === g.trait;
        expect(g.mutated).toBe(!has);
        if (g.mutated) seen++;
      }
    }
    expect(seen).toBeGreaterThan(0); // 400 anak × 16 lokus pasti memuat mutasi
  });
});

describe("canPickParent", () => {
  const agent = (id: number, owner: string, studListed: boolean) => ({ id, owner, studListed });

  test("agent yang sama tidak bisa dipilih dua kali", () => {
    expect(canPickParent(agent(1, "0xA", true), [1]).ok).toBe(false);
  });

  test("agent orang lain yang tertutup untuk kawin tidak bisa dipilih", () => {
    const r = canPickParent(agent(3, "0xB", false), [], "0xA");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("belum dibuka");
  });

  test("agent milik sendiri boleh walau tertutup", () => {
    expect(canPickParent(agent(3, "0xa", false), [], "0xA").ok).toBe(true);
  });

  test("agent terbuka boleh dipilih siapa saja", () => {
    expect(canPickParent(agent(2, "0xB", true), [1]).ok).toBe(true);
  });
});

describe("cooldownLabel", () => {
  test("null bila sudah siap", () => {
    expect(cooldownLabel(100, 100, 12)).toBeNull();
    expect(cooldownLabel(0, 100, 12)).toBeNull();
  });

  test("menit dibulatkan ke atas", () => {
    expect(cooldownLabel(130, 100, 12)).toBe("istirahat, siap ±6 menit lagi");
  });

  test("di bawah satu menit disebut detik", () => {
    expect(cooldownLabel(103, 100, 2)).toBe("istirahat, siap ±6 detik lagi");
  });
});
