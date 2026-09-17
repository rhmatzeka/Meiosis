/** Uji cepat sandbox dengan dua "agent" tiruan: satu benar, satu sengaja rusak. */
import { runInSandbox } from "../sandbox/run";

const GOOD = {
  "src/App.tsx": `export default function App() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 720 }}>
      <h1 style={{ fontSize: 40, lineHeight: 1.1 }}>Stake dan dapatkan hasil</h1>
      <p>Kunci token kamu, terima imbal hasil tiap epoch.</p>
      <button type="button" style={{ padding: "10px 18px" }}>Hubungkan wallet</button>
    </main>
  );
}`,
};

const BROKEN = {
  "src/App.tsx": `export default function App() { return <div>{tidakAdaVariabelIni}</div>; }`,
};

for (const [label, files] of [["kode benar", GOOD], ["kode rusak", BROKEN]] as const) {
  const r = await runInSandbox(files, { timeoutMs: 180_000 });
  console.log(`\n\x1b[1m${label}\x1b[0m  (${(r.durationMs / 1000).toFixed(1)}s)`);
  console.log(`  typecheckOk   : ${r.typecheckOk}`);
  console.log(`  buildOk       : ${r.buildOk}`);
  console.log(`  rendersOk     : ${r.rendersOk}   <- gerbang sesungguhnya`);
  if (r.render?.ok) {
    console.log(`  pelanggaran axe: ${r.render.axeViolations.length}`);
    console.log(`  galat konsol   : ${r.render.consoleErrors.length}`);
    console.log(`  overflow ponsel: ${r.render.horizontalOverflowOnMobile}`);
    console.log(`  teks           : ${JSON.stringify(r.render.text.slice(0, 60))}`);
  } else {
    console.log(`  render         : tidak ada — ${r.buildLog.trim().split("\n").slice(-2)[0]?.slice(0, 90)}`);
  }
}
