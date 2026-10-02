/**
 * Cek kesehatan beta (dijalankan systemd timer tiap 5 menit): server menjawab,
 * chain terjangkau, kontrak terpasang, saldo operator cukup, dan anggaran token
 * harian belum hampir habis. Bila ada masalah: notifikasi desktop + log.
 *
 *   CHAIN=sepolia bun run scripts/health.ts
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { formatEther } from "viem";

process.env.CHAIN ??= "sepolia";
const { pub, operatorWallet, CHAIN } = await import("../server/chain");
const { dayKey } = await import("../server/quota");

const UI = process.env.HEALTH_URL ?? "http://127.0.0.1:5173";
const problems: string[] = [];

const status = await fetch(`${UI}/api/status`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json() as Promise<{ chainLive: boolean; deployed: boolean }>).catch(() => null);
if (!status) problems.push("server Meiosis tidak menjawab");
else {
  if (!status.chainLive) problems.push("chain tidak terjangkau dari server");
  if (!status.deployed) problems.push("kontrak belum terpasang di chain ini");
}

const op = operatorWallet();
if (op) {
  const bal = await pub.getBalance({ address: op.account.address }).catch(() => null);
  if (bal !== null && bal < 10n ** 16n) problems.push(`saldo operator tinggal ${formatEther(bal)} ETH (faucet dan penetasan otomatis bisa berhenti)`);
} else problems.push("OPERATOR_PRIVATE_KEY belum diisi");

const usage = `.runs/usage-${CHAIN}.json`;
if (existsSync(usage)) {
  const budget = Number(process.env.DAILY_TOKEN_BUDGET ?? 300_000);
  const reset = (((Number(process.env.QUOTA_RESET_HOUR_WIB ?? 7) - 7) % 24) + 24) % 24;
  const day = JSON.parse(readFileSync(usage, "utf8"))[dayKey(Date.now(), reset)] as { tokens?: Record<string, number> } | undefined;
  const used = Object.values(day?.tokens ?? {}).reduce((s, n) => s + n, 0);
  if (used >= budget * 0.85) problems.push(`anggaran token hari ini terpakai ${Math.round((used / budget) * 100)}%`);
}

const line = `${new Date().toISOString()} ${problems.length ? "MASALAH: " + problems.join("; ") : "sehat"}`;
mkdirSync(".runs", { recursive: true });
appendFileSync(".runs/health.log", line + "\n");
console.log(line);
if (problems.length) {
  Bun.spawnSync(["notify-send", "-u", "critical", "Meiosis beta", problems.join("\n")]);
  process.exit(1);
}
