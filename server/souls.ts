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

export const MAX_SOUL = 4000;
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
    if (t.length > MAX_SOUL) throw new Error(`instruksi paling panjang ${MAX_SOUL} karakter`);
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
  lookup: (id: number) => { soulHash: string | null; parents: number[] } | undefined,
  get: (hash: string) => string | null,
  cap = 6000,
): { text: string; sources: number[] } {
  const seen = new Set<string>();
  const parts: { id: number; text: string }[] = [];
  const walk = (i: number, depth: number) => {
    const a = lookup(i);
    if (!a || depth > 8) return;
    if (a.soulHash) {
      if (seen.has(a.soulHash)) return;
      const t = get(a.soulHash);
      seen.add(a.soulHash);
      if (t) parts.push({ id: i, text: t });
      return;
    }
    for (const p of a.parents) if (p) walk(p, depth + 1);
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
