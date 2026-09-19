/**
 * Lapisan chain untuk server dan skrip.
 *
 * Dua mode, dipilih lewat CHAIN:
 *
 *   anvil    chain lokal. Server memegang empat akun bawaan Anvil — kuncinya
 *            memang publik — dan mengirim transaksi atas nama pengguna, sehingga
 *            UI bisa dicoba tanpa wallet browser sama sekali.
 *
 *   sepolia  chain publik. Server TIDAK memegang kunci pengguna mana pun: ia
 *            hanya membaca chain dan menyusun transaksi, dan pengguna sendiri
 *            yang menandatanganinya dari wallet browser. Lihat PLAN.md §12.1.
 */
import {
  createPublicClient, createWalletClient, http, fallback,
  type Address, type Abi, type Chain, type WalletClient, type Account, type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, sepolia } from "viem/chains";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

export type ChainName = "anvil" | "sepolia";
export const CHAIN: ChainName = process.env.CHAIN === "sepolia" ? "sepolia" : "anvil";
export const IS_LOCAL = CHAIN === "anvil";

/**
 * RPC publik sebagai cadangan terakhir. RPC publik Sepolia rutin melambat, dan
 * itu selalu terjadi di saat paling buruk — PLAN.md §19.3.
 */
const SEPOLIA_PUBLIC = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://sepolia.drpc.org",
];

const RPC_URLS = IS_LOCAL
  ? [process.env.LOCAL_RPC ?? "http://127.0.0.1:8545"]
  : [process.env.SEPOLIA_RPC_URL, process.env.SEPOLIA_RPC_URL_FALLBACK, ...SEPOLIA_PUBLIC]
      .filter((u): u is string => !!u);

export const RPC = RPC_URLS[0];
export const chain: Chain = IS_LOCAL ? foundry : sepolia;
export const EXPLORER = IS_LOCAL ? null : "https://sepolia.etherscan.io";

const transport: Transport = RPC_URLS.length > 1
  ? fallback(RPC_URLS.map((u) => http(u)))
  : http(RPC_URLS[0]);

/**
 * Di Sepolia, pembacaan yang dilakukan bersamaan digabung jadi satu panggilan
 * multicall3. Tanpa ini, menampilkan roster berarti puluhan permintaan RPC tiap
 * beberapa detik — dan RPC publik akan membalas dengan 429.
 */
export const pub = createPublicClient({
  chain, transport, batch: { multicall: !IS_LOCAL },
  // Anvil menambang tiap 2 detik; polling bawaan 4 detik membuat deploy 36
  // transaksi melewati batas waktu request UI.
  pollingInterval: IS_LOCAL ? 500 : 4000,
});

const wallet = (key: `0x${string}`): WalletClient<Transport, Chain, Account> =>
  createWalletClient({ account: privateKeyToAccount(key), chain, transport });

/** Akun bawaan Anvil — publik, hanya untuk chain lokal. */
export const ACCOUNTS = [
  { name: "deployer", key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" },
  { name: "Alice", key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" },
  { name: "Bob", key: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" },
  { name: "Carol", key: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" },
] as const;

/** Wallet yang dipegang server. Kosong di Sepolia — itu disengaja. */
export const wallets = IS_LOCAL ? ACCOUNTS.map((a) => wallet(a.key as `0x${string}`)) : [];

/**
 * Kunci deployer. Di Anvil memakai akun bawaan; di Sepolia wajib dari
 * DEPLOYER_PRIVATE_KEY dan hanya dibaca oleh skrip deploy, tidak pernah oleh server.
 */
export function deployerWallet() {
  if (IS_LOCAL) return wallet(ACCOUNTS[0].key as `0x${string}`);
  const k = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  if (!k || !/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("DEPLOYER_PRIVATE_KEY belum diisi di .env");
  return wallet(k as `0x${string}`);
}

export const ownerName = (addr: string) => {
  const i = wallets.findIndex((w) => w.account.address.toLowerCase() === addr.toLowerCase());
  return i >= 0 ? ACCOUNTS[i].name : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
};

export const artifact = (n: string) =>
  JSON.parse(readFileSync(`contracts/out/${n}.sol/${n}.json`, "utf8")) as { abi: Abi; bytecode: { object: `0x${string}` } };

export interface Deployment {
  chainId: number;
  registry: Address;
  genesis: Address;
  hatchery: Address;
  royalty: Address;
  skills: Address;
  block: number;
}

const DEPLOYMENTS = `deployments/${CHAIN}.json`;

export const loadDeployment = (): Deployment | null => {
  if (!existsSync(DEPLOYMENTS)) return null;
  const d = JSON.parse(readFileSync(DEPLOYMENTS, "utf8")) as Deployment;
  // Berkas dari versi sebelum royalti ada tidak bisa dipakai lagi.
  return d.royalty ? d : null;
};

export const saveDeployment = (d: Deployment) => {
  mkdirSync("deployments", { recursive: true });
  writeFileSync(DEPLOYMENTS, JSON.stringify(d, null, 2) + "\n");
};

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
