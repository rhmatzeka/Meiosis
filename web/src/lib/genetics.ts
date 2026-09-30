/**
 * Genetika dari sisi penonton: apa yang MUNGKIN diwarisi sebelum kawin, dan
 * dari mana setiap gen anak berasal sesudahnya. Murni, tanpa jaringan.
 *
 * Aturannya mengikuti packages/shared/src/genome.ts:
 *  - meiosis(): alel X anak diambil dari induk pertama, alel Y dari induk kedua;
 *    masing-masing induk menyumbang alel X atau Y-nya dengan peluang ½.
 *  - express(genome, 0n): dominansi tertinggi menang; seri → alel X (induk
 *    pertama), karena seed 0 adalah yang dipakai runtime untuk merakit agent.
 * Mutasi (±0,8% per lokus) sengaja diabaikan di peluang.
 */
import {
  LOCUS_COUNT, alleleX, alleleY, dom, getLocus, trait,
} from "../../../packages/shared/src/genome";

export interface LocusOdds { locus: number; odds: { trait: number; p: number }[] }

export function inheritanceOdds(a: bigint, b: bigint): LocusOdds[] {
  const out: LocusOdds[] = [];
  for (let i = 0; i < LOCUS_COUNT; i++) {
    const la = getLocus(a, i), lb = getLocus(b, i);
    const tally = new Map<number, number>();
    for (const x of [alleleX(la), alleleY(la)]) {
      for (const y of [alleleX(lb), alleleY(lb)]) {
        const t = dom(y) > dom(x) ? trait(y) : trait(x);
        tally.set(t, (tally.get(t) ?? 0) + 0.25);
      }
    }
    const odds = [...tally].map(([t, p]) => ({ trait: t, p })).sort((m, n) => n.p - m.p || m.trait - n.trait);
    out.push({ locus: i, odds });
  }
  return out;
}

export interface GeneOrigin { locus: number; trait: number; from: "a" | "b"; mutated: boolean }

export function geneOrigin(child: bigint, a: bigint, b: bigint): GeneOrigin[] {
  const out: GeneOrigin[] = [];
  for (let i = 0; i < LOCUS_COUNT; i++) {
    const l = getLocus(child, i);
    const x = alleleX(l), y = alleleY(l);
    const from = dom(y) > dom(x) ? "b" : "a";
    const t = trait(from === "a" ? x : y);
    const pl = getLocus(from === "a" ? a : b, i);
    const mutated = trait(alleleX(pl)) !== t && trait(alleleY(pl)) !== t;
    out.push({ locus: i, trait: t, from, mutated });
  }
  return out;
}

export interface Pickable { id: number; owner: string; studListed: boolean }

const same = (p?: string, q?: string) => !!p && !!q && p.toLowerCase() === q.toLowerCase();

export function canPickParent(agent: Pickable, picked: number[], me?: string): { ok: boolean; reason?: string } {
  if (picked.includes(agent.id)) return { ok: false, reason: "sudah dipilih" };
  if (!agent.studListed && !same(agent.owner, me)) return { ok: false, reason: "belum dibuka pemiliknya untuk kawin" };
  return { ok: true };
}

export function cooldownLabel(readyAtBlock: number, block: number, secPerBlock: number): string | null {
  const left = readyAtBlock - block;
  if (left <= 0) return null;
  const sec = left * secPerBlock;
  return sec < 60 ? `istirahat, siap ±${sec} detik lagi` : `istirahat, siap ±${Math.ceil(sec / 60)} menit lagi`;
}
