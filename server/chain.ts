/**
 * Lapisan chain untuk UI. Menyimpan kunci operator dan mengirim transaksi atas
 * nama pengguna, sehingga UI tidak perlu wallet browser sama sekali.
 *
 * Ini hanya untuk pengembangan lokal di Anvil, yang kunci-kuncinya memang publik
 * dan sudah diketahui semua orang. Untuk Sepolia nanti, breed() harus dipanggil
 * dari wallet pengguna sendiri — lihat PLAN.md §12.1.
 */
import { createPublicClient, createWalletClient, http, type Address, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { readFileSync, existsSync, writeFileSync } from "node:fs";

export const RPC = process.env.LOCAL_RPC ?? "http://127.0.0.1:8545";
const DEPLOYMENTS = "deployments/anvil.json";

/** Akun bawaan Anvil — publik, hanya untuk chain lokal. */
export const ACCOUNTS = [
  { name: "deployer", key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" },
  { name: "Alice", key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" },
  { name: "Bob", key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" },
  { name: "Carol", key: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" },
] as const;

export const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
export const wallets = ACCOUNTS.map((a) =>
  createWalletClient({ account: privateKeyToAccount(a.key as `0x${string}`), chain: foundry, transport: http(RPC) }),
);
export const ownerName = (addr: string) =>
  ACCOUNTS.find((a, i) => wallets[i].account.address.toLowerCase() === addr.toLowerCase())?.name ?? addr.slice(0, 10);

export const artifact = (n: string) =>
  JSON.parse(readFileSync(`contracts/out/${n}.sol/${n}.json`, "utf8")) as { abi: Abi; bytecode: { object: `0x${string}` } };

export interface Deployment { registry: Address; genesis: Address; hatchery: Address; skills: Address; block: number }

export const loadDeployment = (): Deployment | null =>
  existsSync(DEPLOYMENTS) ? JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) : null;

export const saveDeployment = (d: Deployment) =>
  writeFileSync(DEPLOYMENTS, JSON.stringify(d, null, 2) + "\n");

export async function isLive(): Promise<boolean> {
  try { await pub.getBlockNumber(); return true; } catch { return false; }
}

/** Memastikan alamat tersimpan masih berisi kontrak — Anvil kehilangan state saat restart. */
export async function deploymentValid(d: Deployment | null): Promise<boolean> {
  if (!d) return false;
  try {
    const code = await pub.getCode({ address: d.registry });
    return !!code && code !== "0x";
  } catch { return false; }
}
