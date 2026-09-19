/**
 * Verifikasi kode kontrak di Etherscan.
 *
 * Bukan kosmetik: kode yang terverifikasi membuat siapa pun bisa membaca sendiri
 * fungsi meiosis dan pembagian royaltinya di Etherscan — itu bukti terkuat bahwa
 * genetikanya nyata. Lihat PLAN.md §19.1.
 *
 *   ETHERSCAN_API_KEY=... bun run verify:sepolia
 */
import { readFileSync, existsSync } from "node:fs";

const file = "deployments/sepolia.json";
if (!existsSync(file)) { console.log("belum ada deployments/sepolia.json — jalankan deploy:sepolia dulu"); process.exit(1); }
const key = process.env.ETHERSCAN_API_KEY;
if (!key) { console.log("ETHERSCAN_API_KEY belum diisi di .env (gratis di etherscan.io/myapikey)"); process.exit(1); }

const d = JSON.parse(readFileSync(file, "utf8"));
const enc = (types: string, ...vals: string[]) => {
  const p = Bun.spawnSync(["cast", "abi-encode", `constructor(${types})`, ...vals]);
  return p.stdout.toString().trim();
};

const jobs: [string, string, string | null][] = [
  ["AgentRegistry", d.registry, null],
  ["Genesis", d.genesis, enc("address", d.registry)],
  ["LineageRoyalty", d.royalty, enc("address", d.registry)],
  ["Hatchery", d.hatchery, enc("address,address", d.registry, d.royalty)],
  ["SkillRegistry", d.skills, null],
];

let failed = 0;
for (const [name, addr, args] of jobs) {
  const cmd = [
    "forge", "verify-contract", addr, `src/${name}.sol:${name}`,
    "--root", "contracts", "--chain", "sepolia", "--etherscan-api-key", key, "--watch",
    ...(args ? ["--constructor-args", args] : []),
  ];
  const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  const out = (p.stdout.toString() + p.stderr.toString());
  const done = p.exitCode === 0 || /already verified/i.test(out);
  console.log(`${done ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${name.padEnd(15)} ${addr}`);
  if (!done) { failed++; console.log(out.split("\n").slice(-6).map((l) => "    " + l).join("\n")); }
}
process.exit(failed ? 1 : 0);
