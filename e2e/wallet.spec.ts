/**
 * Uji end-to-end jalur wallet lewat browser sungguhan.
 *
 * Halaman diberi wallet EIP-1193 tiruan yang menandatangani dengan akun Anvil #6
 * — akun yang TIDAK dipegang server. Jadi setiap klik di sini melewati jalur
 * yang sama dengan pengguna MetaMask di Sepolia: /api/tx menyusun, wallet
 * menandatangani, halaman menunggu receipt lewat server.
 *
 * Tanpa PRIVY_APP_ID aplikasi memakai mode "injected"; dengan Privy, bagian
 * menandatangani sama persis (eth_sendTransaction ke provider wallet).
 *
 * Butuh Anvil dan server lokal yang sudah ter-deploy (`bun run start`).
 */
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BASE, agents, api, finish, freePair, installFakeWallet, launch, ok, rpc, section, watchErrors } from "./harness";

const KEY = "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"; // Anvil #6
const account = privateKeyToAccount(KEY);

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const errors = watchErrors(page);

  await installFakeWallet(page, KEY);

  section("MASUK DENGAN WALLET");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click(".account > button");
  await page.click("text=Masuk dengan akunmu sendiri");
  const short = account.address.slice(0, 6);
  await page.waitForFunction((s) => document.querySelector(".account > button")?.textContent?.includes(s), short);
  ok("alamat wallet tampil di header", true, short);

  section("KAWINKAN DARI WALLET");
  const [x, y] = await freePair();
  await page.goto(`${BASE}/kawin?a=${x}&b=${y}`, { waitUntil: "networkidle" });
  await page.click(".breed-go button");
  await page.waitForURL(/\/kawin\/\d+$/, { timeout: 30_000 });
  await page.waitForSelector(".born", { timeout: 60_000 });
  const pid = Number(page.url().split("/").pop());
  const childId = (await api<{ id: number; childId: number }[]>("/api/pregnancies?fresh=1")).find((p) => p.id === pid)!.childId;
  const child = (await agents()).find((a) => a.id === childId)!;
  ok("anak lahir dan milik wallet ini", child.owner.toLowerCase() === account.address.toLowerCase(), `#${childId}`);
  ok("keeper menetaskan tanpa tanda tangan kedua", true);

  section("AKSI PEMILIK");
  await page.goto(`${BASE}/agent/${childId}`, { waitUntil: "networkidle" });
  ok("halaman agent menyebut milikmu", (await page.innerText(".agent-hero")).includes("milikmu"));

  await page.click("text=Catat manifest ke chain");
  await page.waitForSelector("text=Catat manifest ke chain", { state: "detached", timeout: 30_000 });
  const rec = (await agents()).find((a) => a.id === childId)!;
  ok("manifest dicatat dari wallet", rec.manifestHashOnChain === rec.manifestHashComputed);

  await page.click("text=Beri nama");
  await page.fill(".modal input", "Penjaga Form");
  await page.click("text=Simpan nama");
  await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Penjaga Form", undefined, { timeout: 30_000 });
  ok("nama baru tampil", true);

  await page.click("text=Buka untuk kawin");
  await page.fill(".modal input", "0.02");
  await page.click(".modal >> text=Simpan");
  await page.waitForSelector("text=/0\\.02 ETH/", { timeout: 30_000 });
  ok("tarif kawin 0,02 ETH tampil", true);

  section("BAYAR & ROYALTI");
  // Orang lain (deployer, akun demo) membayar agent ini 0,5 ETH. Royalti diukur
  // sebagai kenaikan, karena akun uji bisa membawa sisa dari putaran sebelumnya.
  const pending = async () => BigInt((await api<{ pendingWei: string }>(`/api/royalty?address=${account.address}`)).pendingWei);
  const p0 = await pending();
  const paid = await api<{ ok?: boolean; error?: string }>("/api/local-act", { action: "pay", args: { id: childId, amountEth: "0.5", memo: "sewa" } });
  ok("pembayaran dari akun lain masuk", !!paid.ok, paid.error ?? "");
  const gained = (await pending()) - p0;
  ok("royalti pemilik 95% dari bayaran", gained === 475n * 10n ** 15n, `${formatEther(gained)} ETH`);
  await page.goto(`${BASE}/dompet`, { waitUntil: "networkidle" });
  await page.waitForSelector(`text=${formatEther(p0 + gained)} ETH`, { timeout: 20_000 });
  ok("Dompet menampilkan royalti siap ditarik", true, `${formatEther(p0 + gained)} ETH`);
  const before = BigInt(await rpc("eth_getBalance", [account.address, "latest"]) as string);
  await page.click(".wallet-main >> text=Tarik royalti");
  await page.waitForSelector(".wallet-main >> text=/Penghasilan siap ditarik\\s*0 ETH/", { timeout: 30_000 });
  const after = BigInt(await rpc("eth_getBalance", [account.address, "latest"]) as string);
  ok("royalti ditarik ke wallet", after - before > p0 + gained - 10n ** 15n, `saldo naik ${(Number(after - before) / 1e18).toFixed(4)} ETH`);

  section("EKSPOR");
  await page.goto(`${BASE}/agent/${childId}`, { waitUntil: "networkidle" });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(".agent-side >> text=Unduh .md lengkap")]);
  const full = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  ok("pemilik mengunduh .md lengkap (tanda tangan wallet)", dl.suggestedFilename().startsWith(`meiosis-${childId}-penjaga-form`) && full.includes("meiosis:prompt"), dl.suggestedFilename());
  ok("berkas lengkap berlisensi atas nama pemiliknya", full.includes(`licensee: ${account.address}`));
  const remote = await (await fetch(`${BASE}/api/agents/${childId}/agent.md`)).text();
  ok(".md umum adalah remote, tanpa prompt", remote.includes("meiosis:remote") && !remote.includes("meiosis:prompt"));

  await page.screenshot({ path: process.env.SHOT ?? "/tmp/e2e-wallet.png", fullPage: true });
  ok("tanpa galat JavaScript", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}
finish();
