/**
 * Cara menyebut seorang agent dalam bahasa awam: untuk apa ia, dari mana ia
 * berasal, siapa pemiliknya, dan berapa harganya. Dipakai kartu dan halaman agent.
 */
import { normalizeStack, slotOf } from "../../../packages/shared/src/profile";

interface Described {
  id: number; designed: boolean; generation: number; parents: [number, number] | number[];
  profile: { role: string; traits: { label: string; value: string }[] };
}

export const originLabel = (a: { designed: boolean; generation: number }) =>
  a.designed ? "Dibuat di Studio" : a.generation === 0 ? "Generasi pertama" : `Keturunan generasi ${a.generation}`;

export const ownerLabel = (owner: string, me?: string) =>
  me && owner.toLowerCase() === me.toLowerCase() ? "milikmu" : `${owner.slice(0, 6)}…${owner.slice(-4)}`;

export function priceText(wei: string) {
  const v = BigInt(wei);
  if (v === 0n) return "pakai jatah gratis";
  return `${(Number(v) / 1e18).toLocaleString("id-ID", { maximumFractionDigits: 4 })} ETH uji`;
}

export function summaryLine(a: Described, nameOf: (id: number) => string | undefined = () => undefined) {
  if (a.profile.role.trim()) return a.profile.role.trim();
  if (a.parents[0] && a.parents[1]) return `Keturunan ${nameOf(a.parents[0]) ?? `#${a.parents[0]}`} × ${nameOf(a.parents[1]) ?? `#${a.parents[1]}`}`;
  return `Agent #${a.id}`;
}

const clip = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Stack lebih dulu (paling sering dicari), lalu sifat lain; sisanya diringkas "+N". */
export function traitChips(a: Described, max = 4): string[] {
  const stack = normalizeStack(a.profile.traits.find((t) => slotOf(t.label)?.tags)?.value ?? "");
  const others = a.profile.traits.filter((t) => !slotOf(t.label)?.tags).map((t) => clip(`${t.label}: ${t.value}`));
  const all = [...stack, ...others];
  return all.length > max ? [...all.slice(0, max - 1), `+${all.length - (max - 1)}`] : all;
}
