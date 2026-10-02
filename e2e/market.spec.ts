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

  section("STUDIO: OTAK DITULIS BEBAS");
  await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
  ok("tidak ada daftar pilihan sifat", (await page.locator("[role=radiogroup]").count()) === 0);
  await page.fill("#studio-desc", "Bikin REST API pakai Laravel dan MySQL, jawab santai");
  await page.click("text=Rancang untukku");
  await page.waitForSelector(".studio-sheet", { timeout: 60_000 });
  const tags = await page.locator(".stack-tag").allInnerTexts();
  ok("stack di luar daftar lama terisi dari deskripsi", tags.some((t) => t.includes("Laravel")) && tags.some((t) => t.includes("MySQL")), tags.join(","));
  await page.locator(".stack-input input").fill("Redis");
  await page.keyboard.press("Enter");
  ok("stack bebas bisa ditambah dengan Enter", (await page.locator(".stack-tag").allInnerTexts()).some((t) => t.includes("Redis")));
  await page.fill('input[aria-label="Cara berpikir"]', "teliti, mikir panjang sebelum menjawab");
  await page.click("text=+ Tambah sifat");
  const last = page.locator(".trait-line").last();
  await last.locator(".trait-label").fill("Bahasa");
  await last.locator(".trait-value input").fill("Jawa halus kalau diajak bahasa Jawa");
  const SOUL = "Kamu pembuat API Laravel. Selalu akhiri jawaban dengan kata SELESAI-UJI.";
  await page.click("text=Sunting instruksi");
  await page.fill(".studio-soul", SOUL);
  await page.fill(".sheet-name", "Perancang Uji");
  const summary = await page.innerText(".studio-summary");
  ok("ringkasan memuat sifat buatan sendiri", summary.includes("Bahasa") && summary.includes("Jawa halus"));
  ok("Studio gratis selama beta", summary.includes("Gratis selama beta"));
  await page.click(".studio-summary .btn-primary");
  await page.waitForURL(/\/agent\/\d+\?baru=1$/, { timeout: 30_000 });
  const id = Number(new URL(page.url()).pathname.split("/").pop());
  const made = (await agents()).find((a) => a.id === id)! as unknown as { owner: string; name: string; soulHash: string; soulFrom: number[]; traits: { value: string }[]; manifestHashOnChain: string; manifestHashComputed: string; profile: { role: string; traits: { label: string; value: string }[] } };
  ok("agent Studio jadi milik pembuatnya", made.owner.toLowerCase() === account.address.toLowerCase(), `#${id}`);
  ok("nama terpasang", made.name === "Perancang Uji");
  ok("profil publik memuat stack bebas dan sifat buatan sendiri",
    made.profile.traits.some((t) => t.label === "Stack & alat" && /Laravel/.test(t.value) && /Redis/.test(t.value)) && made.profile.traits.some((t) => t.label === "Bahasa"));
  ok("instruksi tercatat lewat hash, isinya tidak ikut terkirim", !!made.soulHash && made.soulFrom.includes(id) && !JSON.stringify(made).includes("SELESAI-UJI"));
  ok("kelas model dikunci admin (seimbang)", made.traits[0].value === "balanced", String(made.traits[0].value));
  ok("manifest langsung tercatat", made.manifestHashOnChain === made.manifestHashComputed);
  ok("halaman menyambut agent baru", (await page.innerText("main")).includes("sudah jadi dan milikmu"));

  section("STUDIO DI PONSEL");
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await installFakeWallet(phone, KEY);
  await phone.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
  await phone.click("text=atau isi sendiri dari nol");
  const bar = await phone.locator(".sticky-cta .btn-primary").boundingBox();
  ok("tombol Buat agent terlihat tanpa menggulir", !!bar && bar.y + bar.height <= 844, JSON.stringify(bar));
  const { sw, cw } = await phone.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok("Studio tanpa geser horizontal di ponsel", sw <= cw, `${sw}/${cw}`);
  await phone.close();

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
  const feeBps = BigInt((await api<{ market: { feeBps: number } }>("/api/status")).market.feeBps);
  const salePrice = 2n * 10n ** 16n;
  ok(`penjual mendapat ${(10000 - Number(feeBps)) / 100}% (tanpa leluhur)`, gained === (salePrice * (10000n - feeBps)) / 10000n, `${Number(gained) / 1e18} ETH`);

  await page.goto(`${BASE}/agent/${id}`, { waitUntil: "networkidle" });
  ok("bekas pemilik tidak lagi melihat tombol pemilik", !(await page.isVisible("text=Ubah harga jual")) && !(await page.isVisible(".agent-side >> text=Jual")));

  ok("tanpa galat JavaScript", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}
finish();
