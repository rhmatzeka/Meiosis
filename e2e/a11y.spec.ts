/**
 * Aksesibilitas: axe-core di setiap halaman utama, desktop dan ponsel.
 * Gagal bila ada pelanggaran berdampak "serious" atau "critical".
 */
import { readFileSync } from "node:fs";
import { BASE, finish, launch, ok, section } from "./harness";

const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PAGES = ["/", "/pasar", "/studio", "/kawin", "/tugas", "/silsilah", "/panduan", "/dompet", "/ketentuan", "/agent/1"];

const browser = await launch();
try {
  for (const [tag, vp] of [["desktop", { width: 1366, height: 900 }], ["ponsel", { width: 390, height: 844 }]] as const) {
    section(`AXE ${tag.toUpperCase()}`);
    const page = await browser.newPage({ viewport: vp });
    for (const path of PAGES) {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      await page.addScriptTag({ content: AXE });
      const v = await page.evaluate(async () => {
        const r = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } })
          .axe.run(document, { resultTypes: ["violations"] });
        return r.violations.filter((x) => x.impact === "serious" || x.impact === "critical").map((x) => `${x.id} (${x.impact}) ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`);
      });
      ok(`${path}`, v.length === 0, v.join(" | ").slice(0, 400));
    }
    await page.close();
  }

  section("STUDIO DENGAN KEYBOARD SAJA");
  const kb = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await kb.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
  const tabTo = async (match: (el: { tag: string; text: string; label: string }) => boolean) => {
    for (let i = 0; i < 60; i++) {
      await kb.keyboard.press("Tab");
      const el = await kb.evaluate(() => { const a = document.activeElement as HTMLElement | null; return { tag: a?.tagName ?? "", text: a?.textContent?.trim() ?? "", label: a?.getAttribute("aria-label") ?? "" }; });
      if (match(el)) return true;
    }
    return false;
  };
  ok("tombol 'atau isi sendiri' terjangkau Tab", await tabTo((e) => e.text === "atau isi sendiri dari nol"));
  await kb.keyboard.press("Enter");
  await kb.waitForSelector(".studio-sheet");
  ok("kolom stack terjangkau Tab", await tabTo((e) => e.label === "Stack & alat"));
  await kb.keyboard.type("Rust");
  await kb.keyboard.press("Enter");
  ok("stack ditambah dengan Enter", (await kb.locator(".stack-tag").allInnerTexts()).some((t) => t.includes("Rust")));
  ok("tombol tambah sifat terjangkau Tab", await tabTo((e) => e.text === "+ Tambah sifat"));
  const before = await kb.locator(".trait-line").count();
  await kb.keyboard.press("Enter");
  ok("sifat baru ditambah dengan Enter", (await kb.locator(".trait-line").count()) === before + 1);
  await kb.close();
} finally {
  await browser.close();
}
finish();
