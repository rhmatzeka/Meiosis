/**
 * Uji end-to-end lewat browser sungguhan.
 *
 * Memeriksa API saja tidak cukup: halaman bisa saja mati karena satu galat
 * JavaScript sementara seluruh endpoint tetap sehat. Uji ini memuat halaman,
 * mengumpulkan galat konsol, menekan tombolnya seperti manusia, lalu menunggu
 * hasilnya benar-benar muncul di DOM.
 */
import { chromium } from "playwright-core";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:5173";
const RUN_AGENT = process.env.RUN_AGENT !== "0";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

const fails: string[] = [];
const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
  if (!cond) fails.push(label);
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

  console.log("\n\x1b[1mMEMUAT HALAMAN\x1b[0m");
  const res = await page.goto(BASE, { waitUntil: "networkidle", timeout: 30_000 });
  ok("halaman merespons 200", res?.status() === 200, `status ${res?.status()}`);
  await page.waitForTimeout(1500);
  ok("tanpa galat JavaScript", consoleErrors.length === 0, consoleErrors.join(" | "));

  const tabs = await page.$$eval("nav button", (bs) => bs.map((b) => (b as HTMLElement).dataset.tab));
  ok("lima tab ada", tabs.length === 5, tabs.join(", "));
  ok("tab Jalankan ada", tabs.includes("run"));

  console.log("\n\x1b[1mTAB ROSTER\x1b[0m");
  const cards = await page.$$("#roster .card");
  ok("kartu agent ter-render", cards.length > 0, `${cards.length} kartu`);
  const cocok = await page.$$eval("#roster .card", (cs) =>
    cs.filter((c) => c.textContent?.includes("cocok")).length);
  ok("manifest terverifikasi", cocok > 0, `${cocok} agent bertanda cocok`);

  console.log("\n\x1b[1mTAB JALANKAN\x1b[0m");
  await page.click('nav button[data-tab="run"]');
  await page.waitForTimeout(600);
  ok("tab terbuka", await page.isVisible("#tab-run"));
  ok("centang mode agent ada", await page.isVisible("#agentmode"));
  ok("mode agent aktif secara bawaan", await page.isChecked("#agentmode"));
  ok("kotak tugas ada", await page.isVisible("#task"));
  ok("tombol jalankan ada", await page.isVisible("#go-run"));
  ok("tombol nonaktif sebelum agent dipilih", await page.isDisabled("#go-run"));

  await page.click("#rpick .card");
  await page.waitForTimeout(400);
  ok("agent bisa dipilih", (await page.$$("#rpick .card.sel")).length === 1);
  ok("tombol aktif setelah memilih", !(await page.isDisabled("#go-run")));

  await page.click('[data-eg="0"]');
  const taskVal = await page.inputValue("#task");
  ok("tugas contoh terisi", taskVal.length > 20, `${taskVal.length} karakter`);

  if (RUN_AGENT) {
    console.log("\n\x1b[1mMENJALANKAN AGENT\x1b[0m  (beberapa menit)");
    await page.fill("#task", "Ubah src/App.tsx jadi halaman sambutan Epoch: satu judul, satu paragraf, satu tombol.");
    await page.click("#go-run");
    await page.waitForTimeout(1000);
    ok("tombol berubah jadi sibuk", (await page.textContent("#go-run"))?.includes("menjalankan"));

    await page.waitForSelector("#run .card pre, #run .card img, #run table", { timeout: 600_000 });
    await page.waitForTimeout(2000);

    const body = await page.textContent("#tab-run");
    ok("jejak langkah tampil", /list_files|read_file|write_file/.test(body ?? ""));
    ok("status build tampil", /typecheck|build|render/.test(body ?? ""));
    const imgs = await page.$$eval("#run img", (is) => is.map((i) => (i as HTMLImageElement).naturalWidth));
    ok("screenshot hasil ter-render", imgs.length > 0 && imgs.every((w) => w > 0), `${imgs.length} gambar`);
    ok("tanpa galat JavaScript setelah run", consoleErrors.length === 0, consoleErrors.join(" | "));

    await page.screenshot({ path: "/tmp/e2e-run.png", fullPage: true });
  }

  console.log("\n\x1b[1mTAB LAIN\x1b[0m");
  for (const [tab, sel] of [["tree", "#tree svg"], ["arena", "#arena"]] as const) {
    await page.click(`nav button[data-tab="${tab}"]`);
    await page.waitForTimeout(800);
    ok(`tab ${tab} ter-render`, await page.isVisible(sel));
  }
  ok("tetap tanpa galat JavaScript", consoleErrors.length === 0, consoleErrors.join(" | "));
} finally {
  await browser.close();
}

console.log(fails.length === 0
  ? `\n\x1b[32m\x1b[1mSEMUA LULUS\x1b[0m\n`
  : `\n\x1b[31m\x1b[1m${fails.length} GAGAL:\x1b[0m ${fails.join(", ")}\n`);
process.exit(fails.length === 0 ? 0 : 1);
