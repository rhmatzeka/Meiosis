/**
 * Panel admin beta: hanya wallet admin yang bisa masuk; angka pemakaian ikut
 * bergerak; laporan pengguna bisa dipakai untuk menyembunyikan agent; masukan
 * dari footer sampai ke admin. Butuh `bun run start --test` (Anvil #9 = admin).
 */
import { BASE, agents, api, finish, freePair, installFakeWallet, launch, ok, section, signIn, watchErrors } from "./harness";

const ADMIN_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"; // Anvil #9
const OTHER_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"; // Anvil #4

const post = (path: string, body: unknown, user = "0xpelapor") =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", "x-test-user": user }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> }));

const browser = await launch();
try {
  section("BUKAN ADMIN");
  const other = await browser.newPage();
  const otherErrors = watchErrors(other);
  await installFakeWallet(other, OTHER_KEY);
  await other.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await signIn(other);
  await other.waitForSelector("text=Halaman ini khusus admin", { timeout: 15_000 }).catch(() => {});
  ok("wallet biasa ditolak", (await other.innerText("main")).includes("Halaman ini khusus admin"));
  ok("API admin menolak tanpa tanda tangan", (await post("/api/admin/overview", {})).status === 401);

  section("MASUKAN DARI FOOTER");
  await other.goto(BASE, { waitUntil: "networkidle" });
  await other.click("text=Beri masukan");
  const note = `Tombol bayar kurang jelas ${Date.now()}`;
  await other.fill(".modal textarea", note);
  await other.click(".modal >> text=Kirim");
  await other.waitForSelector(".modal", { state: "detached", timeout: 10_000 });
  ok("masukan terkirim", true);
  await other.close();

  section("LAPORAN → SEMBUNYIKAN");
  const [x] = await freePair();
  const rep = await post("/api/report", { id: x, reason: "isinya menipu" });
  ok("laporan diterima", rep.status === 200, JSON.stringify(rep.body));
  const run = await post("/api/run", { ids: [x], task: "halo", mode: "single" });
  ok("satu tugas berjalan", run.status === 200, JSON.stringify(run.body));

  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = watchErrors(page);
  await installFakeWallet(page, ADMIN_KEY);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await signIn(page);
  await page.waitForSelector("text=Pemakaian AI", { timeout: 15_000 });
  const main = await page.innerText("main");
  ok("admin melihat pemakaian hari ini", /\d+ tugas/.test(main));
  ok("admin melihat saldo operator", main.includes("Wallet operator"));
  ok("admin melihat masukan dari footer", main.includes(note));
  ok("admin melihat laporan", main.includes("isinya menipu"));

  await page.locator(".admin-note", { hasText: "isinya menipu" }).first().locator("text=Sembunyikan").click();
  await page.waitForSelector("text=Tampilkan lagi", { timeout: 15_000 });
  const hiddenRow = (await agents()).find((a) => a.id === x) as unknown as { hidden: boolean };
  ok("agent ditandai tersembunyi", hiddenRow.hidden === true);
  await page.goto(`${BASE}/pasar`, { waitUntil: "networkidle" });
  ok("agent hilang dari Pasar", (await page.locator(`a[href="/agent/${x}"]`).count()) === 0);
  const blocked = await post("/api/run", { ids: [x], task: "halo", mode: "single" });
  ok("agent tersembunyi tidak bisa disewa", blocked.status === 403);

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Tampilkan lagi", { timeout: 15_000 });
  await page.locator("text=Tampilkan lagi").first().click();
  await page.waitForFunction(() => !document.body.innerText.includes("Tampilkan lagi"), undefined, { timeout: 15_000 });
  ok("admin bisa menampilkan lagi", !((await agents()).find((a) => a.id === x) as unknown as { hidden: boolean }).hidden);

  // Wallet biasa memang menerima 403 dari /api/admin/overview; browser mencatatnya sebagai galat sumber daya.
  const unexpected = [...errors, ...otherErrors.filter((e) => !/status of 403/.test(e))];
  ok("tanpa galat JavaScript", unexpected.length === 0, unexpected.join(" | "));
} finally {
  await browser.close();
}
finish();
