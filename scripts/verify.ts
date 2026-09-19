/**
 * Satu perintah untuk memeriksa seluruh bagian yang sudah jadi.
 *
 * Semua di sini berjalan TANPA jaringan, TANPA API key, dan TANPA ETH.
 * Yang butuh model atau chain punya perintahnya sendiri — lihat TESTING.md.
 */
const steps: { name: string; cmd: string[]; needs?: string }[] = [
  { name: "Model genetik — 10.000 simulasi perkawinan", cmd: ["bun", "run", "scripts/gene-sim.ts"] },
  { name: "Kontrak — 38 test Foundry", cmd: ["forge", "test", "--root", "contracts"] },
  { name: "Runtime — 39 test, termasuk 20 berkas acuan", cmd: ["bun", "test", "runtime/"] },
  { name: "Sandbox — kode benar vs kode rusak", cmd: ["bun", "run", "scripts/test-sandbox.ts"], needs: "docker" },
];

let failed = 0;
const t0 = performance.now();

for (const s of steps) {
  if (s.needs === "docker") {
    const probe = Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" });
    if (probe.exitCode !== 0) {
      console.log(`\x1b[33m⊘\x1b[0m ${s.name}\n    docker tidak jalan — dilewati`);
      continue;
    }
  }
  const started = performance.now();
  const p = Bun.spawnSync(s.cmd, { stdout: "pipe", stderr: "pipe" });
  const secs = ((performance.now() - started) / 1000).toFixed(1);

  if (p.exitCode === 0) {
    console.log(`\x1b[32m✓\x1b[0m ${s.name}  \x1b[2m${secs}s\x1b[0m`);
  } else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${s.name}  \x1b[2m${secs}s\x1b[0m`);
    const out = (p.stdout.toString() + p.stderr.toString()).trim().split("\n").slice(-12);
    for (const l of out) console.log(`    \x1b[2m${l.slice(0, 110)}\x1b[0m`);
  }
}

const total = ((performance.now() - t0) / 1000).toFixed(1);
console.log(
  failed === 0
    ? `\n\x1b[32m\x1b[1mSEMUA LULUS\x1b[0m  ${total}s\n`
    : `\n\x1b[31m\x1b[1m${failed} GAGAL\x1b[0m  ${total}s\n`,
);
process.exit(failed === 0 ? 0 : 1);
