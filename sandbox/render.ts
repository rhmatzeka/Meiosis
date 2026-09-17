/**
 * Berjalan DI DALAM container, setelah kode buatan agent dibangun.
 *
 * Menyajikan dist/ di localhost, merendernya dengan Chromium, lalu menulis
 * screenshot dan hasil pemindaian axe-core ke /work/out.
 *
 * Kenapa axe dijalankan di sini dan bukan di host: halaman React baru punya DOM
 * setelah JavaScript-nya dieksekusi. Mengeksekusi kode buatan mesin hanya boleh
 * terjadi di dalam container ini. Rencana awal memakai jsdom di host, dan itu
 * keliru — jsdom pun harus menjalankan skrip halaman untuk menghasilkan DOM.
 */
import { chromium } from "playwright-core";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIST = "/work/dist";
const OUT = "/work/out";
const PORT = 4173;

if (!existsSync(DIST)) {
  console.error("dist/ tidak ada — build gagal, tidak ada yang bisa dirender");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(DIST, path));
    // 404 yang rapi, bukan lemparan. Berkas yang tidak ada bukan alasan untuk
    // menjatuhkan seluruh run.
    if (!(await file.exists())) return new Response("not found", { status: 404 });
    return new Response(file);
  },
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 300)));

  const res = await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(600); // beri ruang untuk render pasca-hidrasi

  await page.screenshot({ path: join(OUT, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  // axe-core disuntikkan dari node_modules, bukan diunduh — container tanpa jaringan
  await page.addScriptTag({ content: readFileSync("/work/node_modules/axe-core/axe.min.js", "utf8") });
  const axe = await page.evaluate(async () => {
    // @ts-expect-error axe disuntikkan saat runtime
    const r = await window.axe.run(document, { resultTypes: ["violations"] });
    return {
      violations: r.violations.map((v: { id: string; impact: string; nodes: unknown[] }) => ({
        id: v.id, impact: v.impact, count: v.nodes.length,
      })),
    };
  });

  const text = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  const domNodes = await page.evaluate(() => document.querySelectorAll("*").length);
  // deteksi scroll horizontal di lebar ponsel
  await page.setViewportSize({ width: 390, height: 844 });
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

  Bun.write(join(OUT, "render.json"), JSON.stringify({
    ok: true,
    status: res?.status() ?? 0,
    consoleErrors,
    axeViolations: axe.violations,
    domNodes,
    horizontalOverflowOnMobile: overflows,
    text,
  }, null, 2));

  console.log(`render selesai: ${axe.violations.length} pelanggaran axe, ${consoleErrors.length} galat konsol`);
} catch (err) {
  Bun.write(join(OUT, "render.json"), JSON.stringify({ ok: false, error: String(err).slice(0, 500) }, null, 2));
  console.error("render gagal:", err);
  process.exitCode = 3;
} finally {
  await browser.close();
  server.stop(true);
}
