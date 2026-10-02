/**
 * Menjalankan uji end-to-end lewat browser sungguhan terhadap server lokal.
 *
 *   bun run e2e          seluruh spec e2e (butuh `bun run start --test`)
 *
 * Butuh `bun run start --test` lebih dulu, dan Chrome/Chromium terpasang
 * (atau CHROMIUM_PATH menunjuk ke sana).
 */
import { browserPath } from "../e2e/harness";

const st = await fetch("http://127.0.0.1:5173/api/status").then((r) => r.json() as Promise<{ testMode?: boolean }>).catch(() => null);
if (!st) {
  console.error("\n  Server tidak menjawab di :5173. Jalankan `bun run start --test` lebih dulu.\n");
  process.exit(1);
}
if (st.testMode !== true) {
  console.error("\n  Server berjalan dalam mode biasa. Jalankan `bun run stop && bun run start --test` dulu.\n");
  process.exit(1);
}
if (!browserPath()) {
  console.error("\n  Tidak ada Chrome/Chromium di mesin ini. Pasang salah satunya, atau isi CHROMIUM_PATH.\n");
  process.exit(1);
}

let failed = 0;
for (const spec of ["e2e/journey.spec.ts", "e2e/wallet.spec.ts", "e2e/market.spec.ts", "e2e/protect.spec.ts", "e2e/admin.spec.ts"]) {
  console.log(`\n\x1b[1m▶ ${spec}\x1b[0m`);
  const p = Bun.spawn(["bun", "run", spec], { stdout: "inherit", stderr: "inherit" });
  if ((await p.exited) !== 0) failed++;
}
process.exit(failed ? 1 : 0);
