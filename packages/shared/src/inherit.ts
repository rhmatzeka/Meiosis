/**
 * Pewarisan sifat bebas. Alel X anak berasal dari induk A dan alel Y dari
 * induk B (GeneLib.meiosis), jadi alel yang terekspresi di lokus sebuah kolom
 * menentukan induk mana yang menurunkan teks kolom itu. Seed diambil dari
 * event Hatched, sehingga siapa pun bisa menghitung ulang hasilnya.
 */
import { encodePacked, keccak256 } from "viem";
import { LOCUS, alleleX, alleleY, dom, getLocus } from "./genome";
import { normalizeTraits, slotOf, type FreeTrait, type Profile } from "./profile";

export type Side = "a" | "b";

export function expressedSide(child: bigint, seed: bigint, locus: number): Side {
  const l = getLocus(child, locus);
  const dx = dom(alleleX(l)), dy = dom(alleleY(l));
  if (dx !== dy) return dx > dy ? "a" : "b";
  return ((seed >> BigInt(locus)) & 1n) === 0n ? "a" : "b";
}

export function customSide(seed: bigint, label: string): Side {
  const h = BigInt(keccak256(encodePacked(["uint256", "string"], [seed, label.trim().toLowerCase()])));
  return (h & 1n) === 0n ? "a" : "b";
}

const keyOf = (label: string) => label.trim().toLowerCase();
const find = (p: Profile, label: string) => p.traits.find((t) => keyOf(t.label) === keyOf(label));
const labelsOf = (a: Profile, b: Profile) => [...new Map([...a.traits, ...b.traits].map((t) => [keyOf(t.label), t.label])).values()];

export function inheritProfile(a: Profile, b: Profile, child: bigint, seed: bigint): Profile & { from: Record<string, Side> } {
  const from: Record<string, Side> = {};
  const traits: FreeTrait[] = labelsOf(a, b).map((label) => {
    const ta = find(a, label), tb = find(b, label);
    const slot = slotOf(label);
    const side: Side = !tb ? "a" : !ta ? "b" : slot ? expressedSide(child, seed, slot.locus) : customSide(seed, label);
    from[keyOf(label)] = side;
    return (side === "a" ? ta : tb)!;
  });
  const roleSide = expressedSide(child, seed, LOCUS.DISCIPLINE_PRIMARY);
  const preferred = roleSide === "a" ? a.role : b.role;
  const role = preferred || a.role || b.role;
  from["peran"] = preferred ? roleSide : a.role ? "a" : "b";
  return { role, traits: normalizeTraits(traits), from };
}

/** Peluang anak mengekspresikan alel dari induk A di lokus ini (mutasi diabaikan). */
export function sideOddsA(ga: bigint, gb: bigint, locus: number): number {
  const la = getLocus(ga, locus), lb = getLocus(gb, locus);
  let p = 0;
  for (const x of [alleleX(la), alleleY(la)]) for (const y of [alleleX(lb), alleleY(lb)]) {
    p += dom(x) > dom(y) ? 1 : dom(x) < dom(y) ? 0 : 0.5;
  }
  return p / 4;
}

export function traitOdds(a: Profile, b: Profile, ga: bigint, gb: bigint) {
  return labelsOf(a, b).map((label) => {
    const ta = find(a, label)?.value, tb = find(b, label)?.value;
    const slot = slotOf(label);
    return { label, a: ta, b: tb, pA: !tb ? 1 : !ta ? 0 : slot ? sideOddsA(ga, gb, slot.locus) : 0.5 };
  });
}