/** Perlengkapan bersama uji e2e: browser, pencatat hasil, dan akses chain lokal. */
import { existsSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

export const BASE = process.env.UI_BASE ?? "http://127.0.0.1:5173";
export const RPC = process.env.RPC ?? "http://127.0.0.1:8545";

/** Chromium di container sandbox, atau Chrome/Chromium yang terpasang di mesin ini. */
export const browserPath = () =>
  process.env.CHROMIUM_PATH
  ?? ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/opt/google/chrome/chrome"].find(existsSync);

export async function launch() {
  const executablePath = browserPath();
  if (!executablePath) throw new Error("Tidak ada Chrome/Chromium. Pasang salah satunya atau isi CHROMIUM_PATH.");
  const b = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
  // Animasi dimatikan secara bawaan supaya uji tidak bergantung pada waktu;
  // uji yang memang memeriksa animasi meminta "no-preference" sendiri.
  const newPage = b.newPage.bind(b);
  b.newPage = (o = {}) => newPage({ reducedMotion: "reduce", ...o });
  return b;
}

export const fails: string[] = [];
export const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
  if (!cond) fails.push(label);
};
export const section = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);

export function finish(): never {
  console.log(fails.length === 0
    ? `\n\x1b[32m\x1b[1mSEMUA LULUS\x1b[0m\n`
    : `\n\x1b[31m\x1b[1m${fails.length} GAGAL:\x1b[0m ${fails.join(", ")}\n`);
  process.exit(fails.length === 0 ? 0 : 1);
}

export const rpc = async (method: string, params: unknown[] = []) =>
  (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;

export const api = async <T,>(path: string, body?: unknown): Promise<T> =>
  (await fetch(BASE + path, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })).json() as Promise<T>;

interface AgentRow { id: number; generation: number; owner: string; readyAtBlock: number; stud: { listed: boolean }; manifestHashOnChain: string; manifestHashComputed: string; name: string }
export const agents = () => api<AgentRow[]>("/api/agents?fresh=1");
export const block = async () => (await api<{ block: number }>("/api/status")).block;

/**
 * Dua founder (generasi nol) yang sedang tidak istirahat. Hanya founder: anak
 * dari uji sebelumnya bisa milik akun uji sendiri, dan itu mengubah hitungan royalti.
 */
export async function freePair(): Promise<[number, number]> {
  for (let i = 0; i < 60; i++) {
    const [as, b] = await Promise.all([agents(), block()]);
    const free = as.filter((a) => a.generation === 0 && a.readyAtBlock <= b && a.stud.listed).map((a) => a.id);
    if (free.length >= 2) return [free[0], free[1]];
    await rpc("anvil_mine", ["0x4"]);
  }
  throw new Error("tidak ada dua agent yang siap kawin");
}

/** Galat konsol dan galat halaman; peringatan HMR dev Bun bukan galat. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|auth\.privy\.io/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  return errors;
}

/**
 * Wallet EIP-1193 tiruan: tanda tangan diteruskan ke Node (kunci Anvil yang
 * TIDAK dipegang server), permintaan lain ke Anvil. Jalurnya sama dengan
 * pengguna MetaMask sungguhan.
 */
export async function installFakeWallet(page: Page, key: `0x${string}`) {
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { foundry } = await import("viem/chains");
  const account = privateKeyToAccount(key);
  const signer = createWalletClient({ account, chain: foundry, transport: http(RPC) });
  await page.exposeFunction("__walletSend", async (tx: { to: string; data: string; value: string }) =>
    signer.sendTransaction({ to: tx.to as `0x${string}`, data: tx.data as `0x${string}`, value: BigInt(tx.value) }));
  await page.exposeFunction("__rpc", rpc);
  await page.exposeFunction("__walletSign", (message: string) => account.signMessage({ message }));
  await page.addInitScript((addr: string) => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      on() {},
      async request({ method, params }: { method: string; params?: unknown[] }) {
        const w = window as unknown as { __walletSend: (t: unknown) => Promise<string>; __walletSign: (m: string) => Promise<string>; __rpc: (m: string, p?: unknown[]) => Promise<unknown> };
        if (method === "personal_sign") return w.__walletSign((params as string[])[0]);
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [addr];
        if (method === "eth_chainId") return "0x7a69";
        if (method === "wallet_switchEthereumChain") return null;
        if (method === "eth_sendTransaction") return w.__walletSend((params as unknown[])[0]);
        return w.__rpc(method, params);
      },
    };
  }, account.address);
  return account;
}

/** Masuk dengan wallet tiruan lewat menu akun. */
export async function signIn(page: Page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click(".account > button");
  await page.click("text=Masuk dengan akunmu sendiri");
  await page.waitForFunction(() => /0x[0-9a-f]{4}/i.test(document.querySelector(".account > button")?.textContent ?? ""));
}
