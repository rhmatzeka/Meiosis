/**
 * Tata letak pohon keluarga: satu baris per generasi, dan urutan dalam baris
 * dipilih supaya anak berada sedekat mungkin di bawah induknya (heuristik
 * barycenter, beberapa putaran turun-naik). Murni, supaya bisa diuji.
 */
export interface TreeNode { id: number; generation: number; parents: [number, number] | number[] }
export interface Placed { id: number; row: number; col: number }

export function layoutTree(nodes: TreeNode[]): { placed: Map<number, Placed>; rows: number[][] } {
  const gens = [...new Set(nodes.map((n) => n.generation))].sort((a, b) => a - b);
  const rows = gens.map((g) => nodes.filter((n) => n.generation === g).map((n) => n.id).sort((a, b) => a - b));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<number, number[]>();
  for (const n of nodes) for (const p of n.parents) if (p) children.set(p, [...(children.get(p) ?? []), n.id]);

  // Posisi horizontal ternormalkan (-0.5..0.5) supaya baris berbeda panjang bisa dibandingkan.
  const pos = new Map<number, number>();
  const index = () => rows.forEach((r) => r.forEach((id, i) => pos.set(id, r.length === 1 ? 0 : i / (r.length - 1) - 0.5)));
  const mean = (ids: number[]) => {
    const xs = ids.filter((i) => pos.has(i)).map((i) => pos.get(i)!);
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  };
  const sortBy = (row: number[], key: (id: number) => number | null) => {
    const keyed = row.map((id, i) => ({ id, k: key(id), i }));
    // Yang tidak punya kerabat mempertahankan posisi relatifnya.
    keyed.sort((a, b) => (a.k ?? pos.get(a.id)!) - (b.k ?? pos.get(b.id)!) || a.i - b.i);
    return keyed.map((x) => x.id);
  };

  index();
  for (let round = 0; round < 4; round++) {
    for (let r = 1; r < rows.length; r++) { rows[r] = sortBy(rows[r], (id) => mean(byId.get(id)!.parents.filter(Boolean) as number[])); index(); }
    for (let r = rows.length - 2; r >= 0; r--) { rows[r] = sortBy(rows[r], (id) => mean(children.get(id) ?? [])); index(); }
  }

  const placed = new Map<number, Placed>();
  rows.forEach((r, row) => r.forEach((id, col) => placed.set(id, { id, row, col })));
  return { placed, rows };
}

/** Jumlah garis induk→anak yang bersilangan; dipakai untuk menguji tata letak. */
export function crossings(nodes: TreeNode[], placed: Map<number, Placed>, rows: number[][]): number {
  const x = (id: number) => { const p = placed.get(id)!; const n = rows[p.row].length; return n === 1 ? 0 : p.col / (n - 1) - 0.5; };
  const edges = nodes.flatMap((n) => n.parents.filter(Boolean).map((p) => ({ a: p, b: n.id })))
    .filter((e) => placed.has(e.a) && placed.has(e.b) && placed.get(e.b)!.row - placed.get(e.a)!.row === 1);
  let c = 0;
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const e = edges[i], f = edges[j];
    if (placed.get(e.a)!.row !== placed.get(f.a)!.row) continue;
    if ((x(e.a) - x(f.a)) * (x(e.b) - x(f.b)) < 0) c++;
  }
  return c;
}
