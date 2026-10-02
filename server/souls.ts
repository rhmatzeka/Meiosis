/**
 * Instruksi khusus ("soul"): teks bebas yang ditulis pembuat agent di Studio.
 *
 * Teksnya rahasia server (sama seperti prompt modul); yang publik hanya
 * hash-nya di kontrak Studio. Agent hasil kawin tidak punya soul sendiri —
 * ia mewarisi soul seluruh garis keturunannya, induk pertama lebih dulu.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { keccak256, toBytes } from "viem";
import { inheritProfile } from "../packages/shared/src/inherit";
import { parseSoul, type FreeTrait, type Profile, type Soul } from "../packages/shared/src/profile";

export const MAX_SOUL = 4000;
/** Instruksi 4000 karakter ditambah blok profil (peran 120, 12 sifat x ±240). */
export const MAX_SOUL_STORED = 7000;
const normalize = (t: string) => t.replace(/\r\n/g, "\n").trim();

export const soulHash = (text: string) => keccak256(toBytes(normalize(text)));

export class SoulStore {
  private map: Record<string, string>;
  constructor(private file: string) {
    this.map = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>) : {};
  }

  put(text: string): string {
    const t = normalize(text);
    if (!t) throw new Error("instruksi masih kosong");
    if (t.length > MAX_SOUL_STORED) throw new Error(`profil dan instruksi paling panjang ${MAX_SOUL_STORED} karakter`);
    const h = soulHash(t);
    if (this.map[h] !== t) {
      this.map[h] = t;
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file + ".tmp", JSON.stringify(this.map));
      renameSync(this.file + ".tmp", this.file);
    }
    return h;
  }

  get(hash: string): string | null {
    return this.map[hash.toLowerCase()] ?? this.map[hash] ?? null;
  }
}

/**
 * Soul yang berlaku untuk seorang agent: miliknya sendiri bila ia rancangan
 * Studio, selain itu gabungan soul leluhurnya (tanpa pengulangan), dibatasi `cap`.
 */
export function inheritedSoul(
  id: number,
  /** `at`: blok tempat leluhur dibaca (saat keturunannya lahir); kosong = versi terbaru. */
  lookup: (id: number, at?: number) => { soulHash: string | null; parents: number[]; birthBlock?: number } | undefined,
  get: (hash: string) => string | null,
  cap = 6000,
): { text: string; sources: number[] } {
  const seen = new Set<string>();
  const parts: { id: number; text: string }[] = [];
  const walk = (i: number, depth: number, at?: number) => {
    const a = lookup(i, at);
    if (!a || depth > 8) return;
    if (a.soulHash) {
      if (seen.has(a.soulHash)) return;
      const t = get(a.soulHash);
      seen.add(a.soulHash);
      if (t) parts.push({ id: i, text: t });
      return;
    }
    // Induk dibaca sebagaimana adanya saat agent ini lahir: suntingan sesudahnya tidak ikut turun.
    for (const p of a.parents) if (p) walk(p, depth + 1, a.birthBlock);
  };
  walk(id, 0);

  const kept: typeof parts = [];
  let used = 0;
  for (const p of parts) {
    const room = cap - used - (kept.length ? 2 : 0);
    if (room <= 0) break;
    kept.push({ id: p.id, text: p.text.slice(0, room) });
    used += Math.min(p.text.length, room) + (kept.length > 1 ? 2 : 0);
  }
  return { text: kept.map((p) => p.text).join("\n\n"), sources: kept.map((p) => p.id) };
}

/** Yang dibutuhkan untuk menghitung profil seorang agent. */
export interface ProfileNode { genome: bigint; seed: bigint; parents: [number, number] | number[]; soulText: string | null; birthBlock?: number }
export interface PublicProfile { role: string; traits: FreeTrait[]; inherited: boolean; from?: Record<string, "a" | "b"> }

/**
 * Profil publik: miliknya sendiri bila agent punya soul (rancangan Studio, atau
 * anak yang sudah disunting pemiliknya); selain itu diwariskan dari kedua
 * induk mengikuti alel yang terekspresi (inheritProfile). Instruksi tidak ikut.
 */
/**
 * `node(id, at)` memberi soul agent sebagaimana pada blok `at` (kosong = terbaru).
 * Anak membaca induknya pada blok kelahirannya, jadi suntingan induk sesudahnya
 * tidak mengubah sifat anak milik orang lain.
 */
export function profileFor(id: number, node: (id: number, at?: number) => ProfileNode | undefined, memo = new Map<string, PublicProfile>(), at?: number): PublicProfile {
  const key = `${id}@${at ?? "now"}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const n = node(id, at);
  let out: PublicProfile = { role: "", traits: [], inherited: false };
  if (n?.soulText) {
    const p = parseSoul(n.soulText);
    out = { role: p.role, traits: p.traits, inherited: false };
  } else if (n && n.parents[0] && n.parents[1]) {
    const a = profileFor(n.parents[0], node, memo, n.birthBlock), b = profileFor(n.parents[1], node, memo, n.birthBlock);
    const p = inheritProfile(a, b, n.genome, n.seed);
    out = { role: p.role, traits: p.traits, inherited: true, from: p.from };
  }
  memo.set(key, out);
  return out;
}

/** Soul lengkap untuk prompt: profil publik + instruksi rahasia garis keturunannya (tanpa blok profil). */
export function promptSoul(
  id: number,
  profile: Profile,
  lookup: (id: number, at?: number) => { soulHash: string | null; parents: number[]; birthBlock?: number } | undefined,
  get: (hash: string) => string | null,
): Soul {
  const own = inheritedSoul(id, lookup, (h) => { const t = get(h); return t === null ? null : parseSoul(t).instructions || null; });
  return { role: profile.role, traits: profile.traits, instructions: own.text };
}
