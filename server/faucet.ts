/**
 * Faucet: pengguna baru yang masuk lewat Privy mendapat wallet kosong. Tanpa
 * ETH ia tidak bisa mengawinkan apa pun, dan juri tidak akan mencari faucet
 * Sepolia sendiri. Server mengirim sedikit ETH dari wallet operator.
 *
 * Karena wallet operator berisi uang sungguhan (walau testnet), setiap
 * permintaan harus membawa token Privy yang sah, dan dibatasi per user,
 * per alamat, per IP, dan per hari. Aturannya fungsi murni supaya bisa diuji.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface FaucetRecord { userId: string; address: string; ip: string; at: number; wei: string }
export interface FaucetState { records: FaucetRecord[] }
export interface FaucetConfig { amountWei: bigint; perIpPerDay: number; dailyCapWei: bigint }
export type FaucetReason = "sudah" | "alamat" | "ip" | "harian" | "saldo-cukup";

const DAY = 24 * 3_600_000;
const lower = (s: string) => s.toLowerCase();

export function faucetDecision(
  state: FaucetState,
  req: { userId: string; address: string; ip: string; balanceWei: bigint; now: number },
  cfg: FaucetConfig,
): { ok: true } | { ok: false; reason: FaucetReason } {
  if (req.balanceWei >= cfg.amountWei / 2n) return { ok: false, reason: "saldo-cukup" };
  if (state.records.some((r) => r.userId === req.userId)) return { ok: false, reason: "sudah" };
  if (state.records.some((r) => lower(r.address) === lower(req.address))) return { ok: false, reason: "alamat" };
  const today = state.records.filter((r) => req.now - r.at < DAY);
  if (today.filter((r) => r.ip === req.ip).length >= cfg.perIpPerDay) return { ok: false, reason: "ip" };
  const spent = today.reduce((s, r) => s + BigInt(r.wei), 0n);
  if (spent + cfg.amountWei > cfg.dailyCapWei) return { ok: false, reason: "harian" };
  return { ok: true };
}

export function faucetMessage(r: FaucetReason): string {
  return {
    "sudah": "Akunmu sudah pernah menerima ETH gratis dari kami.",
    "alamat": "Alamat ini sudah pernah menerima ETH gratis dari kami.",
    "ip": "Terlalu banyak permintaan dari jaringanmu hari ini. Coba lagi besok, atau isi dari faucet Sepolia.",
    "harian": "Jatah ETH gratis hari ini sudah habis. Isi dari faucet Sepolia, atau coba lagi besok.",
    "saldo-cukup": "Saldomu sudah cukup untuk bertransaksi.",
  }[r];
}

// --- penyimpanan: satu berkas JSON, ditulis atomik ---

export function loadFaucetState(file: string): FaucetState {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as FaucetState) : { records: [] };
  } catch {
    return { records: [] };
  }
}

export function saveFaucetState(file: string, s: FaucetState) {
  mkdirSync(dirname(file), { recursive: true });
  // Catatan lebih dari 30 hari tidak memengaruhi keputusan apa pun kecuali
  // "sudah"/"alamat" — dan itu justru harus diingat, jadi tidak dipangkas.
  writeFileSync(file + ".tmp", JSON.stringify(s));
  renameSync(file + ".tmp", file);
}

// --- token Privy ---

const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Memverifikasi access token Privy dengan kunci publik app (JWKS). Tidak butuh
 * app secret. Mengembalikan user id Privy (`did:privy:…`), atau melempar galat.
 */
export async function verifyPrivyToken(token: string, appId: string): Promise<string> {
  let set = jwks.get(appId);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
    jwks.set(appId, set);
  }
  const { payload } = await jwtVerify(token, set, { issuer: "privy.io", audience: appId });
  if (!payload.sub) throw new Error("token tanpa sub");
  return payload.sub;
}
