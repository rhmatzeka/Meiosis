/**
 * Agent terlindungi & Claude Code berbayar, lewat browser sungguhan:
 * isi saldo pakai dan buat API key di Dompet (wallet tiruan, tanda tangan
 * sungguhan), lalu panggil MCP online seperti Claude Code — saldo turun
 * sebesar harga, royalti pemilik naik. Ditambah: `.md` umum tanpa prompt,
 * `.md` lengkap ditolak untuk bukan pemilik, dan watermark melacak kebocoran.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE, api, finish, installFakeWallet, launch, ok, section, signIn, watchErrors } from "./harness";

const KEY = "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97"; // Anvil #8
const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // pemilik founder #1

const credits = async (addr: string) => BigInt((await api<{ balanceWei: string }>(`/api/credits?address=${addr}`)).balanceWei);
const royalty = async (addr: string) => BigInt((await api<{ pendingWei: string }>(`/api/royalty?address=${addr}`)).pendingWei);

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = watchErrors(page);
  const account = await installFakeWallet(page, KEY);
  await signIn(page);

  section("SALDO PAKAI");
  const c0 = await credits(account.address);
  await page.goto(`${BASE}/dompet`, { waitUntil: "networkidle" });
  await page.click(".wallet-credits >> text=Isi saldo");
  await page.fill(".modal input", "0.01");
  await page.click(".modal .btn-primary");
  await page.waitForSelector(".modal", { state: "detached", timeout: 30_000 });
  const c1 = await credits(account.address);
  ok("saldo pakai bertambah 0,01 ETH", c1 - c0 === 10n ** 16n);

  section("API KEY");
  await page.click("text=Buat API key");
  await page.waitForSelector(".key-fresh", { timeout: 15_000 });
  const key = (await page.locator(".key-fresh .copy").first().innerText()).replace(/[⧉✓]/g, "").trim();
  ok("kunci ditampilkan sekali dengan perintah pemasangan", key.startsWith("mk_") && (await page.innerText(".key-fresh")).includes("perintah"));

  const mcp = (body: object, k = key) => fetch(`${BASE}/mcp`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${k}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  }).then((r) => r.json() as Promise<{ result?: { tools?: { name: string }[]; content?: { text: string }[]; isError?: boolean }; error?: { message: string } }>);

  section("MCP SEPERTI CLAUDE CODE");
  ok("kunci palsu ditolak", !!(await mcp({ method: "tools/list" }, "mk_palsu")).error);
  const tools = (await mcp({ method: "tools/list" })).result?.tools?.map((t) => t.name) ?? [];
  ok("tiga tool tersedia", tools.join() === "meiosis_list_agents,meiosis_balance,meiosis_run", tools.join());
  const r0 = await royalty(ALICE);
  const run = await mcp({ method: "tools/call", params: { name: "meiosis_run", arguments: { agent_id: 1, task: "Buat fungsi tambah", mock: true } } });
  ok("tugas berjalan dan hasilnya kembali", !run.result?.isError && (run.result?.content?.[0].text ?? "").includes("[MOCK]"), run.result?.content?.[0].text.slice(0, 60));
  const c2 = await credits(account.address);
  const price = c1 - c2;
  ok("saldo dipotong sebesar harga satu tugas", price > 0n && price <= 10n ** 15n, `${Number(price) / 1e18} ETH`);
  ok("pemilik agent menerima 97,5%", (await royalty(ALICE)) - r0 === (price * 975n) / 1000n);
  const bad = await mcp({ method: "tools/call", params: { name: "meiosis_run", arguments: { agent_id: 1, task: "x", context: "a".repeat(70_000), mock: true } } });
  ok("konteks terlalu besar ditolak tanpa memotong saldo", !!bad.result?.isError && (await credits(account.address)) === c2);

  section("BERKAS .md");
  const remote = await (await fetch(`${BASE}/api/agents/1/agent.md`)).text();
  ok(".md umum tanpa prompt, memakai MCP", !remote.includes("meiosis:prompt") && remote.includes("mcp__meiosis__meiosis_run"));
  const msg = `Meiosis: unduh agent #1 untuk ${account.address} pada ${new Date().toISOString()}`;
  const signature = await account.signMessage({ message: msg });
  const denied = await fetch(`${BASE}/api/agents/1/agent.md`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: account.address, message: msg, signature }) });
  ok("bukan pemilik tidak bisa mengunduh .md lengkap", denied.status === 403);

  const full = await (await fetch(`${BASE}/api/agents/1/agent.md`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ as: ALICE }) })).text();
  const dir = mkdtempSync(join(tmpdir(), "meiosis-leak-"));
  const leaked = join(dir, "bocor.md");
  writeFileSync(leaked, full.replace(/<!-- meiosis:provenance[\s\S]*?-->/, "")); // header dibuang si pembocor
  const trace = Bun.spawnSync(["bun", "run", "scripts/trace-leak.ts", leaked], { stdout: "pipe" }).stdout.toString();
  ok("kebocoran tanpa header tetap terlacak ke pemiliknya", trace.includes(ALICE), trace.split("\n").find((l) => l.includes("pemegang"))?.trim());

  ok("tanpa galat JavaScript", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}
finish();
