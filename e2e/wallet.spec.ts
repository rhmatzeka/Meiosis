/**
 * Uji end-to-end alur wallet lewat browser sungguhan.
 *
 * Halaman diberi wallet EIP-1193 tiruan yang menandatangani dengan akun Anvil #6
 * — akun yang TIDAK dipegang server. Jadi setiap klik di sini melewati jalur
 * yang sama dengan pengguna MetaMask di Sepolia: /api/tx menyusun, wallet
 * menandatangani, halaman menunggu receipt.
 *
 * Butuh Anvil dan server lokal yang sudah ter-deploy.
 */
import { chromium } from "playwright-core";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:5173";
const RPC = process.env.RPC ?? "http://127.0.0.1:8545";
const KEY = "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"; // Anvil #6
const account = privateKeyToAccount(KEY);
const signer = createWalletClient({ account, chain: foundry, transport: http(RPC) });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

const fails: string[] = [];
const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
  if (!cond) fails.push(label);
};
const rpc = async (method: string, params: unknown[] = []) =>
  (await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

  // Jawaban prompt() berikutnya. Halaman memakai prompt() untuk nama, tarif, dan jumlah bayar.
  let nextPrompt = "";
  page.on("dialog", (d) => d.accept(nextPrompt));

  // Wallet tiruan: permintaan tanda tangan diteruskan ke Node, sisanya ke Anvil.
  await page.exposeFunction("__walletSend", async (tx: { to: string; data: string; value: string }) =>
    signer.sendTransaction({ to: tx.to as `0x${string}`, data: tx.data as `0x${string}`, value: BigInt(tx.value) }));
  await page.exposeFunction("__rpc", rpc);
  await page.addInitScript((addr: string) => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      isMetaMask: true,
      on() {},
      async request({ method, params }: { method: string; params?: unknown[] }) {
        const w = window as unknown as {
          __walletSend: (t: unknown) => Promise<string>; __rpc: (m: string, p?: unknown[]) => Promise<unknown>;
        };
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [addr];
        if (method === "eth_chainId") return "0x7a69";
        if (method === "wallet_switchEthereumChain") return null;
        if (method === "eth_sendTransaction") return w.__walletSend((params as unknown[])[0]);
        return w.__rpc(method, params);
      },
    };
  }, account.address);

  console.log("\n\x1b[1mHUBUNGKAN WALLET\x1b[0m");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  ok("tombol wallet ada", (await page.textContent("#btn-wallet"))?.includes("Hubungkan") ?? false);
  await page.click("#btn-wallet");
  await page.waitForFunction(() => (window as unknown as { __state: { wallet: string | null } }).__state.wallet !== null);
  await page.waitForTimeout(800);
  const short = `${account.address.slice(0, 6)}`;
  ok("alamat tampil di header", (await page.textContent("#btn-wallet"))?.includes(short) ?? false);
  ok("panel dompet tampil", (await page.textContent("#wallet-panel"))?.includes("Dompetmu") ?? false);
  ok("tanpa galat JavaScript", errors.length === 0, errors.join(" | "));

  console.log("\n\x1b[1mKAWINKAN DARI WALLET\x1b[0m");
  const agents0 = await page.evaluate(() => (window as unknown as { __state: { agents: { id: number; owner: string }[] } }).__state.agents.length);
  await page.click('nav button[data-tab="breed"]');
  await page.waitForTimeout(400);
  // Pilih pasangan founder yang tidak sedang masa jeda.
  let bred = false;
  for (const [x, y] of [[1, 2], [3, 4], [1, 3], [2, 4], [1, 4], [2, 3]]) {
    const r = await page.evaluate(async ([a, b, from]) => (await fetch("/api/tx", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "breed", args: { a, b }, from }) })).json(),
      [x, y, account.address] as const);
    if (r.error) continue;
    await page.evaluate(() => { (window as unknown as { __state: { sel: number[] } }).__state.sel = []; });
    await page.click(`#pick .card:nth-child(${x})`);
    await page.click(`#pick .card:nth-child(${y})`);
    await page.waitForSelector("#go:not([disabled])");
    ok("panel perkawinan menyebut wallet", (await page.textContent("#breed"))?.includes("dari wallet") ?? false);
    await page.click("#go");
    await page.waitForSelector("[data-hatch]", { timeout: 30_000 });
    bred = true;
    break;
  }
  ok("kehamilan muncul setelah tx breed", bred);

  await rpc("anvil_mine", ["0x6"]);
  await page.waitForSelector("[data-hatch]:not([disabled])", { timeout: 20_000 });
  await page.click("[data-hatch]:not([disabled])");
  await page.waitForFunction((n) => (window as unknown as { __state: { agents: unknown[] } }).__state.agents.length > n, agents0, { timeout: 30_000 });
  const child = await page.evaluate(() => (window as unknown as { __state: { agents: { id: number; owner: string }[] } }).__state.agents.at(-1)!);
  ok("anak lahir dan milik wallet ini", child.owner.toLowerCase() === account.address.toLowerCase(), `#${child.id}`);

  console.log("\n\x1b[1mAKSI PEMILIK\x1b[0m");
  await page.click('nav button[data-tab="roster"]');
  await page.waitForTimeout(500);
  const card = `#roster .card:nth-child(${child.id})`;
  ok("kartu bertanda milikmu", (await page.textContent(card))?.includes("milikmu") ?? false);

  await page.click(`${card} [data-do="manifest"]`);
  await page.waitForFunction((id) => (window as unknown as { __state: { agents: { id: number; manifestHashOnChain: string }[] } })
    .__state.agents.find((a) => a.id === id)?.manifestHashOnChain !== "0x0000000000000000", child.id, { timeout: 20_000 });
  ok("manifest dicatat dari wallet", (await page.textContent(card))?.includes("cocok") ?? false);

  nextPrompt = "Penjaga Form";
  await page.click(`${card} [data-do="name"]`);
  await page.waitForFunction((id) => (window as unknown as { __state: { agents: { id: number; name: string }[] } })
    .__state.agents.find((a) => a.id === id)?.name === "Penjaga Form", child.id, { timeout: 20_000 });
  ok("nama baru tampil", (await page.textContent(card))?.includes("Penjaga Form") ?? false);

  nextPrompt = "0.02";
  await page.click(`${card} [data-do="stud"]`);
  await page.waitForFunction((id) => (window as unknown as { __state: { agents: { id: number; stud: { feeEth: string; listed: boolean } }[] } })
    .__state.agents.find((a) => a.id === id)?.stud.feeEth === "0.02", child.id, { timeout: 20_000 });
  ok("tarif kawin 0,02 ETH tampil", (await page.textContent(card))?.includes("0.02 ETH") ?? false);

  console.log("\n\x1b[1mBAYAR & ROYALTI\x1b[0m");
  nextPrompt = "0.5";
  await page.click(`${card} [data-do="pay"]`);
  await page.waitForFunction(() => {
    const r = (window as unknown as { __state: { royalty: Record<string, string> } }).__state.royalty;
    return Object.values(r).some((v) => Number(v) > 0);
  }, undefined, { timeout: 20_000 });
  const owed = await page.evaluate(() => Object.values((window as unknown as { __state: { royalty: Record<string, string> } }).__state.royalty)[0]);
  ok("royalti pemilik 95% dari bayaran", owed === "0.475", `${owed} ETH`);

  const before = BigInt(await rpc("eth_getBalance", [account.address, "latest"]) as string);
  await page.click('#wallet-panel button:not([disabled])');
  await page.waitForFunction(() => Object.values((window as unknown as { __state: { royalty: Record<string, string> } }).__state.royalty)[0] === "0", undefined, { timeout: 20_000 });
  const after = BigInt(await rpc("eth_getBalance", [account.address, "latest"]) as string);
  ok("royalti ditarik ke wallet", after - before > 47n * 10n ** 16n, `saldo naik ${(Number(after - before) / 1e18).toFixed(4)} ETH`);

  console.log("\n\x1b[1mEKSPOR\x1b[0m");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`${card} a[download]`)]);
  const text = await (await fetch(`${BASE}/api/agents/${child.id}/agent.md`)).text();
  ok("berkas .md terunduh", dl.suggestedFilename().startsWith(`meiosis-${child.id}-penjaga-form`), dl.suggestedFilename());
  ok("isinya subagent Claude Code", /^---\nname: meiosis-/.test(text) && text.includes("meiosis:prompt"));

  await page.screenshot({ path: process.env.SHOT ?? "/tmp/e2e-wallet.png", fullPage: true });
  ok("tetap tanpa galat JavaScript", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}

console.log(fails.length === 0
  ? `\n\x1b[32m\x1b[1mSEMUA LULUS\x1b[0m\n`
  : `\n\x1b[31m\x1b[1m${fails.length} GAGAL:\x1b[0m ${fails.join(", ")}\n`);
process.exit(fails.length === 0 ? 0 : 1);
