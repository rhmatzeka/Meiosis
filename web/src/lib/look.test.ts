import { expect, test } from "bun:test";
import { FOUNDERS } from "../../../packages/shared/src/founders";
import { cellLook } from "./look";

test("wajah sel deterministik: genome sama, tampilan sama", () => {
  for (const f of FOUNDERS) expect(cellLook(f.genome)).toEqual(cellLook(f.genome));
});

test("empat founder punya warna yang berbeda", () => {
  const hues = new Set(FOUNDERS.map((f) => cellLook(f.genome).h));
  expect(hues.size).toBe(FOUNDERS.length);
});

test("nilai berada dalam jangkauan CSS", () => {
  for (const f of FOUNDERS) {
    const l = cellLook(f.genome);
    expect(l.h).toBeGreaterThanOrEqual(0);
    expect(l.h).toBeLessThan(360);
    expect(l.sat).toBeGreaterThanOrEqual(40);
    expect(l.sat).toBeLessThanOrEqual(100);
    expect(l.glow).toBeGreaterThan(0);
    expect(l.glow).toBeLessThanOrEqual(1);
  }
});
