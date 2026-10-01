import { expect, test } from "bun:test";
import { crossings, layoutTree, type TreeNode } from "./tree";

const n = (id: number, generation: number, a = 0, b = 0): TreeNode => ({ id, generation, parents: [a, b] });

test("setiap agent mendapat tempat di baris generasinya", () => {
  const nodes = [n(1, 0), n(2, 0), n(3, 1, 1, 2)];
  const { placed, rows } = layoutTree(nodes);
  expect(rows).toHaveLength(2);
  expect(placed.get(3)!.row).toBe(1);
  expect(placed.size).toBe(3);
});

test("anak diurutkan di bawah induknya: silang berkurang dibanding urutan nomor", () => {
  // Induk 1..6; anak-anak lahir dengan nomor yang tidak mengikuti posisi induknya.
  const nodes = [
    n(1, 0), n(2, 0), n(3, 0), n(4, 0), n(5, 0), n(6, 0),
    n(7, 1, 5, 6), n(8, 1, 1, 2), n(9, 1, 3, 4), n(10, 1, 5, 6), n(11, 1, 1, 2),
  ];
  const naive = new Map(nodes.map((x) => [x.id, { id: x.id, row: x.generation, col: x.generation === 0 ? x.id - 1 : x.id - 7 }]));
  const naiveRows = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11]];
  const laid = layoutTree(nodes);
  expect(crossings(nodes, laid.placed, laid.rows)).toBeLessThan(crossings(nodes, naive, naiveRows));
  // Dua induk dengan dua anak selalu bersilang sekali (tak terhindarkan): pasangan
  // (1,2) dan (5,6) masing-masing punya dua anak, jadi minimumnya 2.
  expect(crossings(nodes, laid.placed, laid.rows)).toBe(2);
});

test("saudara kandung berdampingan", () => {
  const nodes = [n(1, 0), n(2, 0), n(3, 0), n(4, 0), n(5, 1, 1, 2), n(6, 1, 3, 4), n(7, 1, 1, 2)];
  const { rows } = layoutTree(nodes);
  expect(Math.abs(rows[1].indexOf(5) - rows[1].indexOf(7))).toBe(1);
});

test("deterministik", () => {
  const nodes = [n(1, 0), n(2, 0), n(3, 1, 1, 2), n(4, 1, 2, 1)];
  expect(layoutTree(nodes).rows).toEqual(layoutTree(nodes).rows);
});

test("agent tunggal tidak meledak", () => {
  expect(layoutTree([n(1, 0)]).rows).toEqual([[1]]);
});
