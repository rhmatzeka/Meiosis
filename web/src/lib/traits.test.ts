import { expect, test } from "bun:test";
import { LOCUS_COUNT, TRAITS } from "../../../packages/shared/src/genome";
import { LOCI, traitLabel } from "./traits";

test("setiap lokus punya label, ikon, dan label untuk setiap trait-nya", () => {
  expect(LOCI).toHaveLength(LOCUS_COUNT);
  LOCI.forEach((l, i) => {
    expect(l.index).toBe(i);
    expect(l.label.length).toBeGreaterThan(0);
    expect(l.icon.length).toBeGreaterThan(0);
    expect(l.values).toHaveLength(TRAITS[i].length);
    l.values.forEach((v, t) => {
      expect(v.length).toBeGreaterThan(0);
      expect(traitLabel(i, t)).toBe(v);
    });
  });
});

test("lokus yang punya modul skill ditandai matters", () => {
  const matters = LOCI.filter((l) => l.matters).map((l) => l.key);
  expect(matters).toEqual([
    "MODEL_TIER", "DISCIPLINE_PRIMARY", "STACK_AFFINITY", "AESTHETIC",
    "TEST_RIGOR", "SECURITY_INSTINCT", "VERBOSITY", "PERSISTENCE",
  ]);
});

test("trait di luar jangkauan tidak meledak", () => {
  expect(traitLabel(3, 60)).toBe("?");
});
