/**
 * API key untuk memakai agent dari Claude Code, dan pemeriksaan pesan
 * bertanda tangan wallet (dipakai juga untuk mengunduh `.md` lengkap).
 *
 * Kunci hanya ditampilkan sekali; yang disimpan adalah SHA-256-nya. Berkasnya
 * bisa bocor tanpa membocorkan kunci siapa pun.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getAddress, isAddress, verifyMessage } from "viem";

const VALID_MS = 10 * 60_000;

/** Pesan yang ditandatangani wallet. `action` mis. "buat API key" atau "unduh agent #7". */
export const signedMessage = (action: string, address: string, iso: string) =>
  `Meiosis: ${action} untuk ${getAddress(address)} pada ${iso}`;

/** Tanda tangan yang sudah diterima, disimpan selama masih berlaku supaya tidak bisa diputar ulang. */
export class UsedSignatures {
  private at = new Map<string, number>();
  /** Kuncinya pesan (aksi + alamat + waktu), bukan tanda tangan: bentuk tanda tangan ECDSA bisa diubah tanpa jadi tidak sah. */
  claim(message: string, now: number) {
    for (const [m, t] of this.at) if (now - t > VALID_MS + 60_000) this.at.delete(m);
    if (this.at.has(message)) return false;
    this.at.set(message, now);
    return true;
  }
}

export async function checkSigned(o: {
  address: string; message: string; signature: string; action: string; now?: number; seen?: UsedSignatures;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAddress(o.address)) return { ok: false, error: "alamat tidak sah" };
  const m = o.message.match(/^Meiosis: (.+) untuk (0x[0-9a-fA-F]{40}) pada (.+)$/);
  if (!m || m[1] !== o.action) return { ok: false, error: "pesan tanda tangan tidak sesuai aksinya" };
  if (getAddress(m[2]) !== getAddress(o.address)) return { ok: false, error: "pesan menyebut alamat lain" };
  const at = Date.parse(m[3]);
  const now = o.now ?? Date.now();
  if (!Number.isFinite(at) || now - at > VALID_MS || at - now > 60_000) return { ok: false, error: "tanda tangan kedaluwarsa, coba lagi" };
  const valid = await verifyMessage({ address: getAddress(o.address), message: o.message, signature: o.signature as `0x${string}` }).catch(() => false);
  if (!valid) return { ok: false, error: "tanda tangan tidak cocok dengan alamat" };
  if (o.seen && !o.seen.claim(o.message, now)) return { ok: false, error: "tanda tangan sudah dipakai, coba lagi" };
  return { ok: true };
}

export interface KeyRecord { hash: string; prefix: string; address: string; label: string; createdAt: number }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export class KeyStore {
  private records: KeyRecord[];
  constructor(private file: string) {
    this.records = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as KeyRecord[]) : [];
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file + ".tmp", JSON.stringify(this.records));
    renameSync(this.file + ".tmp", this.file);
  }

  create(address: string, label: string) {
    const key = "mk_" + randomBytes(32).toString("base64url");
    const record: KeyRecord = { hash: sha(key), prefix: key.slice(0, 10), address: getAddress(address), label: label.slice(0, 40), createdAt: Date.now() };
    this.records.push(record);
    this.save();
    return { key, record };
  }

  find(key: string): KeyRecord | null {
    if (!key.startsWith("mk_")) return null;
    const h = sha(key);
    return this.records.find((r) => r.hash === h) ?? null;
  }

  list(address: string) {
    return this.records.filter((r) => r.address === getAddress(address)).map(({ prefix, label, createdAt }) => ({ prefix, label, createdAt }));
  }

  revoke(address: string, prefix: string): boolean {
    const before = this.records.length;
    this.records = this.records.filter((r) => !(r.prefix === prefix && r.address === getAddress(address)));
    if (this.records.length === before) return false;
    this.save();
    return true;
  }
}
