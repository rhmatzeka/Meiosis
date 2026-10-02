/**
 * Alat admin beta: siapa admin, agent yang disembunyikan (moderasi off-chain),
 * dan masukan pengguna. Semua tersimpan sebagai berkas di .runs/ supaya
 * bertahan setelah restart dan ikut dicadangkan.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const isAdmin = (address: string, env: Record<string, string | undefined>) =>
  !!address && (env.ADMIN_ADDRESSES ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean).includes(address.toLowerCase());

function load<T>(file: string, empty: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : empty;
}
function save(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + ".tmp", JSON.stringify(data));
  renameSync(file + ".tmp", file);
}
export const hashUser = (user: string, salt: string) => createHash("sha256").update(user + salt).digest("hex").slice(0, 16);

export class HiddenList {
  private items: { id: number; reason: string; at: number }[];
  constructor(private file: string) { this.items = load(file, []); }
  has(id: number) { return this.items.some((x) => x.id === id); }
  list() { return [...this.items]; }
  hide(id: number, reason: string, now = Date.now()) {
    if (!this.has(id)) this.items.push({ id, reason: reason.slice(0, 200), at: now });
    save(this.file, this.items);
  }
  unhide(id: number) {
    this.items = this.items.filter((x) => x.id !== id);
    save(this.file, this.items);
  }
}

export interface Note { at: number; page: string; text: string; who: string; agentId?: number }

/** Masukan dan laporan: teks pendek, dibatasi per akun per hari, tanpa identitas mentah. */
export class FeedbackStore {
  private items: Note[];
  constructor(private file: string, private salt: string, private perDay = 5) { this.items = load(file, []); }
  add(user: string, text: string, page: string, now = Date.now(), agentId?: number): { ok: boolean } {
    const who = hashUser(user, this.salt);
    const since = now - 86_400_000;
    if (this.items.filter((x) => x.who === who && x.at > since).length >= this.perDay) return { ok: false };
    const t = text.trim().slice(0, 1000);
    if (!t) return { ok: false };
    this.items.push({ at: now, page: page.slice(0, 120), text: t, who, ...(agentId ? { agentId } : {}) });
    save(this.file, this.items.slice(-2000));
    return { ok: true };
  }
  /** Terbaru dulu; yang masuk di milidetik yang sama diurutkan menurut urutan masuknya. */
  latest(n: number) {
    return this.items.map((x, i) => ({ x, i })).sort((a, b) => b.x.at - a.x.at || b.i - a.i).slice(0, n).map((e) => e.x);
  }
}
