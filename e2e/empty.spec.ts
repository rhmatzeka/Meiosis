/**
 * Pasar yang masih kosong (chain baru tanpa founder): setiap halaman harus
 * tetap jalan, tanpa galat, dan mengarahkan ke Studio. Data agent dicegat
 * menjadi kosong supaya uji ini tidak bergantung pada isi chain.
 */
import { BASE, finish, launch, ok, section, watchErrors } from "./harness";

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = watchErrors(page);
  await page.route("**/api/agents*", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/pregnancies*", (r) => r.fulfill({ json: [] }));

  section("HALAMAN KOSONG");
  for (const path of ["/", "/pasar", "/kawin", "/silsilah", "/tugas"]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const links = await page.locator('main a[href="/studio"]').count();
    ok(`${path}: mengarah ke Studio`, links > 0, `${links} tautan`);
  }

  await page.goto(`${BASE}/pasar`, { waitUntil: "networkidle" });
  ok("Pasar menjelaskan bahwa belum ada agent", (await page.innerText("main")).includes("Belum ada agent di pasar"));
  await page.goto(`${BASE}/kawin`, { waitUntil: "networkidle" });
  ok("Kawinkan menjelaskan butuh dua agent", (await page.innerText("main")).includes("Butuh dua agent"));
  await page.goto(BASE, { waitUntil: "networkidle" });
  const home = await page.innerText("main");
  ok("beranda tidak menampilkan hitungan 0 agent", !/\b0 agent\b/.test(home));
  ok("contoh peluang ditandai sebagai contoh", home.includes("(contoh)"));

  ok("tanpa galat JavaScript", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}
finish();
