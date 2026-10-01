/**
 * Perjalanan juri, lewat browser sungguhan, di chain lokal tanpa wallet:
 * beranda → kawinkan → (refresh di tengah) → lahir → bawa pulang .md → verifikasi.
 *
 * Ditambah hal yang paling mungkin menggigit orang sungguhan: induk yang sedang
 * istirahat, chain yang mati, dan layar ponsel 375 px.
 *
 * Butuh `bun run start` (Anvil + server, kontrak ter-deploy, keeper aktif).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE, agents, api, block, finish, freePair, launch, ok, section, watchErrors } from "./harness";

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = watchErrors(page);

  section("BERANDA");
  const res = await page.goto(BASE, { waitUntil: "networkidle" });
  ok("halaman merespons 200", res?.status() === 200);
  ok("judul menjelaskan dalam satu kalimat", (await page.textContent("h1"))?.includes("lahir dari perkawinan") ?? false);
  ok("tombol utama ada", await page.isVisible("text=Buat agent-mu"));
  ok("tiga cara pakai dijelaskan", (await page.innerText("main")).includes("tiga langkah"));
  ok("mode demo terlihat di header", (await page.textContent(".header"))?.includes("Akun demo") ?? false);

  section("TANPA AGENT BAWAAN");
  ok("tidak ada founder/agent bawaan di chain", (await agents()).every((a) => a.generation > 0 || (a as unknown as { designed: boolean }).designed));

  section("PILIH INDUK");
  const [x, y] = await freePair();
  await page.goto(`${BASE}/kawin?a=${x}&b=${y}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".odds-row");
  ok("peluang warisan tampil sebelum kawin", (await page.locator(".odds-row").count()) === 8);
  ok("tanpa istilah teknis (hex/lokus/blok) di jalur utama", !/0x[0-9a-f]{8}|lokus|commit/i.test(await page.innerText("main")));
  const go = page.locator(".breed-go button");
  ok("tombol Kawinkan aktif", await go.isEnabled());

  section("PEMBUAHAN (dengan refresh di tengah)");
  await go.click();
  await page.waitForURL(/\/kawin\/\d+$/, { timeout: 30_000 });
  const pid = Number(page.url().split("/").pop());
  ok("pindah ke halaman kehamilan", pid > 0, `#${pid}`);

  // Induk yang baru kawin sedang istirahat: harus terlihat SEBELUM menekan tombol.
  const [as, b] = await Promise.all([agents(), block()]);
  const resting = as.find((a) => a.id === x)!;
  if (resting.readyAtBlock > b) {
    const p2 = await browser.newPage();
    await p2.goto(`${BASE}/kawin?a=${x}&b=${y}`, { waitUntil: "networkidle" });
    await p2.waitForSelector(".breed-go button");
    ok("induk yang istirahat diberi tahu", (await p2.innerText(".breed-stage")).includes("istirahat"));
    ok("tombol Kawinkan nonaktif saat induk istirahat", await p2.locator(".breed-go button").isDisabled());
    await p2.close();
  } else {
    console.log("  · cooldown sudah lewat sebelum sempat diperiksa (jeda dasar kecil), dilewati");
  }

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".born", { timeout: 60_000 });
  ok("setelah refresh, kehamilan berlanjut sampai lahir", true);
  await page.waitForSelector(".legend");
  ok("asal tiap gen ditunjukkan", (await page.innerText(".born")).includes("dari "));

  section("BAWA PULANG & VERIFIKASI");
  const preg = (await api<{ id: number; childId: number | null }[]>("/api/pregnancies?fresh=1")).find((p) => p.id === pid);
  const childId = preg?.childId ?? 0;
  ok("server memetakan kehamilan ke anaknya", childId > 0, `anak #${childId}`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Bawa pulang (.md lengkap)")]);
  const dir = mkdtempSync(join(tmpdir(), "meiosis-e2e-"));
  const file = join(dir, dl.suggestedFilename());
  await dl.saveAs(file);
  ok("berkas .md terunduh", /^meiosis-\d+-.+\.md$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  // Keeper mencatat manifest anak akun demo; beri waktu satu-dua blok.
  for (let i = 0; i < 20; i++) {
    const c = (await agents()).find((a) => a.id === childId);
    if (c && c.manifestHashOnChain === c.manifestHashComputed) break;
    await Bun.sleep(1000);
  }
  const v = Bun.spawnSync(["bun", "run", "scripts/verify-agent.ts", file], { stdout: "pipe", stderr: "pipe" });
  const out = v.stdout.toString();
  ok("verify-agent menyatakan SAH", v.exitCode === 0 && out.includes("SAH"), out.split("\n").filter((l) => /✓|✗|⊘/.test(l)).length + " baris cek");
  ok("manifest tercatat di chain", !out.includes("belum dicatat"));
  ok("berkas lengkap berlisensi dan ber-watermark", out.includes("ditandatangani operator Meiosis") && out.includes("watermark cocok"));

  section("BERI TUGAS (mode tiruan)");
  await page.goto(`${BASE}/tugas?id=${childId}`, { waitUntil: "networkidle" });
  await page.click("text=Komponen form");
  await page.click("text=Mode tiruan");
  await page.click(".stage button.btn-primary");
  await page.waitForSelector("article.plate", { timeout: 30_000 });
  ok("hasil tugas tampil", (await page.innerText("article.plate")).includes("[MOCK]"));

  section("TAUTAN KEHAMILAN YANG TIDAK ADA");
  // Kasus terburuk: chain yang belum pernah punya kehamilan sama sekali.
  const p4 = await browser.newPage();
  await p4.route("**/api/pregnancies*", (r) => r.fulfill({ json: [] }));
  await p4.goto(`${BASE}/kawin/999999`, { waitUntil: "networkidle" });
  await p4.waitForSelector("text=tidak ditemukan", { timeout: 8000 }).catch(() => {});
  ok("kehamilan yang tidak ada dijelaskan, bukan memuat selamanya", (await p4.innerText("main")).includes("tidak ditemukan"));
  await p4.close();

  section("CHAIN MATI");
  const p3 = await browser.newPage();
  await p3.route("**/api/status", async (r) => {
    const real = await (await fetch(`${BASE}/api/status`)).json();
    await r.fulfill({ json: { ...real, chainLive: false } });
  });
  await p3.goto(BASE, { waitUntil: "networkidle" });
  await p3.waitForSelector("text=Chain tidak terjangkau", { timeout: 8000 }).catch(() => {});
  ok("banner menjelaskan chain mati", (await p3.innerText("body")).includes("Chain tidak terjangkau"));
  await p3.close();

  section("ANIMASI");
  const moving = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "no-preference" });
  const movingErrors = watchErrors(moving);
  await moving.goto(BASE, { waitUntil: "networkidle" });
  await moving.waitForFunction(() => getComputedStyle(document.querySelector(".hero-cta")!).opacity === "1", undefined, { timeout: 8000 }).catch(() => {});
  const heroOpacity = await moving.evaluate(() => getComputedStyle(document.querySelector(".hero-cta")!).opacity);
  ok("animasi pembuka selesai dan ajakan terlihat", heroOpacity === "1", `opacity ${heroOpacity}`);
  await moving.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await moving.waitForFunction(() => [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity === "0").length <= 2, undefined, { timeout: 8000 }).catch(() => {});
  const hidden = await moving.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((e) => getComputedStyle(e).opacity === "0").length);
  ok("isi yang digulir ikut muncul", hidden <= 2, `${hidden} masih tersembunyi`);
  ok("GSAP tanpa galat", movingErrors.length === 0, movingErrors.join(" | "));
  await moving.close();

  section("PONSEL 375 px");
  const phone = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const phoneErrors = watchErrors(phone);
  for (const path of ["/", `/kawin?a=${x}&b=${y}`, `/kawin/${pid}`, `/agent/${childId}`, "/pasar", "/studio", "/panduan", "/silsilah", "/tugas", "/arena", "/dompet"]) {
    await phone.goto(BASE + path, { waitUntil: "networkidle" });
    await phone.waitForTimeout(300);
    const { sw, cw } = await phone.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`tanpa geser horizontal: ${path}`, sw <= cw, `${sw}/${cw}`);
  }
  await phone.goto(BASE, { waitUntil: "networkidle" });
  await phone.click(".menu-btn");
  ok("menu ponsel terbuka dan berisi Pasar", await phone.isVisible(".mobile-menu >> text=Pasar"));
  await phone.screenshot({ path: join(dir, "phone.png") });

  ok("tanpa galat JavaScript", errors.length + phoneErrors.length === 0, [...errors, ...phoneErrors].join(" | "));
  writeFileSync(join(dir, "ok"), "");
  console.log(`  \x1b[2martefak: ${dir}\x1b[0m`);
} finally {
  await browser.close();
}
finish();
