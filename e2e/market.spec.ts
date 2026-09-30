/**
 * Pasar lewat browser sungguhan: rancang agent di Studio dengan wallet tiruan,
 * jual lewat dialog (izin + harga), lalu akun demo lain membeli. Uang penjual
 * diukur sebagai kenaikan royalti, jadi uji ini bisa diulang.
 *
 * Butuh `bun run start` dengan Studio & Market ter-deploy.
 */
import { BASE, agents, api, finish, installFakeWallet, launch, ok, section, signIn, watchErrors } from "./harness";

const KEY = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356"; // Anvil #7
const BOB = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = watchErrors(page);
  const account = await installFakeWallet(page, KEY);
  await signIn(page);

  section("STUDIO");
  await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
  await page.click("text=Desain");
  const talents = page.locator("section:has(h2:text-is('Bakat')) .choice[aria-pressed=true]");
  await page.click(".choice-row >> text=Estetika");       // bakat kedua (keamanan sudah terpilih)
  await page.click(".choice-row >> text=Ketekunan");      // ketiga: menggeser bakat paling lama
  ok("paling banyak dua bakat terpilih", (await talents.count()) === 2, `${await talents.count()} terpilih`);
  await page.fill(".studio-preview input", "Perancang Uji");
  const preview = await page.innerText(".studio-preview");
  ok("pratinjau menunjukkan sifat pilihan", preview.includes("Keahlian utama desain") && preview.includes("Ketekunan tinggi"));
  await page.click(".studio-preview .btn-primary");
  await page.waitForURL(/\/agent\/\d+\?baru=1$/, { timeout: 30_000 });
  const id = Number(new URL(page.url()).pathname.split("/").pop());
  const made = (await agents()).find((a) => a.id === id)!;
  ok("agent Studio jadi milik pembuatnya", made.owner.toLowerCase() === account.address.toLowerCase(), `#${id}`);
  ok("nama terpasang", made.name === "Perancang Uji");
  ok("manifest langsung tercatat", made.manifestHashOnChain === made.manifestHashComputed);
  ok("halaman menyambut agent baru", (await page.innerText("main")).includes("sudah jadi dan milikmu"));

  section("JUAL");
  await page.click(".agent-side >> text=Jual");
  await page.fill(".modal input", "0.02");
  await page.click(".modal .btn-primary");
  await page.waitForSelector(".agent-hero >> text=/dijual 0\\.02 ETH/", { timeout: 40_000 });
  ok("izin + pasang harga dalam satu dialog", true);
  await page.goto(`${BASE}/pasar?tab=dijual`, { waitUntil: "networkidle" });
  await page.waitForSelector(`a[href="/agent/${id}"]`, { timeout: 15_000 });
  ok("muncul di tab Dijual di Pasar", true);

  section("DIBELI ORANG LAIN");
  const pending = async () => BigInt((await api<{ pendingWei: string }>(`/api/royalty?address=${account.address}`)).pendingWei);
  const p0 = await pending();
  const bought = await api<{ ok?: boolean; error?: string }>("/api/local-act", { action: "buy", args: { id }, as: BOB });
  ok("Bob membeli lewat Pasar", !!bought.ok, bought.error ?? "");
  const after = (await agents()).find((a) => a.id === id)!;
  ok("agent pindah ke pembeli", after.owner.toLowerCase() === BOB.toLowerCase());
  const gained = (await pending()) - p0;
  ok("penjual mendapat 97,5% (tanpa leluhur)", gained === 195n * 10n ** 14n, `${Number(gained) / 1e18} ETH`);

  await page.goto(`${BASE}/agent/${id}`, { waitUntil: "networkidle" });
  ok("bekas pemilik tidak lagi melihat tombol pemilik", !(await page.isVisible("text=Ubah harga jual")) && !(await page.isVisible(".agent-side >> text=Jual")));

  ok("tanpa galat JavaScript", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}
finish();
