import { expect, test } from "bun:test";
import { blockRanges } from "./ranges";

test("rentang dipecah per ukuran, inklusif, tanpa celah atau tumpang tindih", () => {
  expect(blockRanges(100n, 125n, 10n)).toEqual([[100n, 109n], [110n, 119n], [120n, 125n]]);
});

test("rentang lebih kecil dari ukuran jadi satu potong", () => {
  expect(blockRanges(5n, 7n, 10n)).toEqual([[5n, 7n]]);
});

test("from > to berarti tidak ada yang perlu dipindai", () => {
  expect(blockRanges(10n, 9n, 10n)).toEqual([]);
});
