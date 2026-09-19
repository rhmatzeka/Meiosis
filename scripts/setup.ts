/**
 * Menyiapkan dependensi: paket bun dan pustaka Solidity.
 *
 * Dulu ini `forge install ... --root contracts`, tapi Foundry 1.x menolak
 * `--root` di luar akar repo git ("Library directory is not relative to the
 * repository root"). Mengkloning langsung ke contracts/lib juga lebih jujur:
 * versinya tertulis di sini, bukan tergantung apa yang kebetulan terbaru.
 */
import { existsSync, mkdirSync } from "node:fs";

const LIBS = [
  { dir: "contracts/lib/forge-std", url: "https://github.com/foundry-rs/forge-std", ref: "v1.16.2" },
  { dir: "contracts/lib/openzeppelin-contracts", url: "https://github.com/OpenZeppelin/openzeppelin-contracts", ref: "v5.1.0" },
];

const run = (cmd: string[]) => {
  const p = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (p.exitCode !== 0) { console.error(`gagal: ${cmd.join(" ")}`); process.exit(1); }
};

run(["bun", "install"]);
for (const l of LIBS) {
  if (existsSync(`${l.dir}/.git`) || existsSync(`${l.dir}/src`) || existsSync(`${l.dir}/contracts`)) continue;
  run(["git", "clone", "--depth", "1", "--branch", l.ref, l.url, l.dir]);
}
mkdirSync("deployments", { recursive: true });
run(["forge", "build", "--root", "contracts"]);
console.log("\n  siap — lanjut: bun run start\n");
