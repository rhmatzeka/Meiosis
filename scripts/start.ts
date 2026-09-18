/**
 * Satu perintah dari repo bersih sampai agent siap dipakai.
 *
 * Sebelum ini, memakai Meiosis berarti menjalankan anvil, server, deploy, dan
 * mint satu per satu sambil tahu urutannya. Itu cukup untuk yang menulisnya,
 * tapi bukan jalan bagi orang lain.
 *
 * Skrip ini memeriksa prasyarat, menyalakan yang perlu, melewati yang sudah
 * jalan, lalu memberi tahu persis apa yang harus diklik berikutnya.
 */
import { existsSync, mkdirSync } from "node:fs";

const RPC = "http://127.0.0.1:8545";
const UI = "http://127.0.0.1:5173";

const c = {
  ok: (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`),
  work: (s: string) => console.log(`  \x1b[36m…\x1b[0m ${s}`),
  bad: (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`),
  head: (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`),
  dim: (s: string) => console.log(`    \x1b[2m${s}\x1b[0m`),
};

const sh = async (args: string[], timeoutMs = 120_000) => {
  const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const t = setTimeout(() => p.kill(), timeoutMs);
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(t);
  return { code, out: out.trim(), err: err.trim() };
};

/**
 * Melepas proses agar tetap hidup setelah skrip ini selesai.
 *
 * Anak dari Bun.spawn ikut mati bersama induknya, padahal anvil dan server
 * justru harus terus berjalan. Shell yang membackground lalu keluar memutus
 * ikatan itu, dan sekalian memberi tempat untuk log.
 */
const detach = (cmd: string, log: string) => {
  Bun.spawn(["sh", "-c", `nohup ${cmd} > ${log} 2>&1 &`], { stdout: "ignore", stderr: "ignore" });
};

const have = async (bin: string) => (await sh(["which", bin], 5000)).code === 0;
const reachable = async (url: string, ms = 2500) => {
  try {
    const ctl = AbortSignal.timeout(ms);
    if (url === RPC) {
      const r = await fetch(url, {
        method: "POST", signal: ctl,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      return r.ok;
    }
    return (await fetch(url, { signal: ctl })).ok;
  } catch { return false; }
};

const waitFor = async (fn: () => Promise<boolean>, seconds: number, label: string) => {
  for (let i = 0; i < seconds * 2; i++) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  c.bad(`${label} tidak siap setelah ${seconds} detik`);
  return false;
};

console.log("\n\x1b[1mMEIOSIS\x1b[0m  menyiapkan semuanya\n");

// ---------------------------------------------------------------- prasyarat
c.head("1. Prasyarat");
const missing: string[] = [];
for (const [bin, how] of [
  ["bun", "curl -fsSL https://bun.sh/install | bash"],
  ["forge", "curl -L https://foundry.paradigm.xyz | bash && foundryup"],
  ["docker", "curl -fsSL https://get.docker.com | sudo sh"],
] as const) {
  if (await have(bin)) c.ok(bin);
  else { c.bad(`${bin} tidak ada`); c.dim(how); missing.push(bin); }
}
if (missing.length) {
  console.log(`\n  Pasang dulu yang di atas, lalu jalankan lagi.\n`);
  process.exit(1);
}

if ((await sh(["docker", "info"], 15_000)).code !== 0) {
  c.bad("docker terpasang tapi daemon-nya mati");
  c.dim("sudo systemctl start docker");
  process.exit(1);
}
c.ok("daemon docker jalan");

// ---------------------------------------------------------------- dependensi
c.head("2. Dependensi");
if (!existsSync("node_modules")) {
  c.work("memasang paket…");
  await sh(["bun", "install"], 300_000);
}
c.ok("paket bun");

if (!existsSync("contracts/lib/forge-std")) {
  c.work("memasang forge-std…");
  await sh(["forge", "install", "foundry-rs/forge-std", "--no-git", "--root", "contracts"], 300_000);
}
c.ok("forge-std");

if (!existsSync("contracts/out/GeneLib.sol/GeneLib.json")) {
  c.work("mengompilasi kontrak…");
  const b = await sh(["forge", "build", "--root", "contracts"], 300_000);
  if (b.code !== 0) { c.bad("forge build gagal"); console.log(b.out || b.err); process.exit(1); }
}
c.ok("kontrak terkompilasi");

// ---------------------------------------------------------------- image sandbox
c.head("3. Sandbox");
const img = await sh(["docker", "image", "inspect", "meiosis-sandbox:1"], 20_000);
if (img.code !== 0) {
  c.work("membangun image sandbox (sekitar 2 menit, sekali saja)…");
  const b = await sh(["docker", "build", "-t", "meiosis-sandbox:1", "-f", "sandbox/Dockerfile", "sandbox/"], 900_000);
  if (b.code !== 0) { c.bad("build image gagal"); console.log(b.err.slice(-1500)); process.exit(1); }
}
c.ok("image sandbox siap");

// ---------------------------------------------------------------- chain
c.head("4. Chain lokal");
if (await reachable(RPC)) {
  c.ok("anvil sudah jalan");
} else {
  c.work("menyalakan anvil…");
  mkdirSync(".runs", { recursive: true });
  detach("anvil --block-time 2", ".runs/anvil.log");
  if (!(await waitFor(() => reachable(RPC), 20, "anvil"))) process.exit(1);
  c.ok("anvil jalan di :8545");
}

// ---------------------------------------------------------------- server
c.head("5. Server");
if (await reachable(`${UI}/api/status`)) {
  c.ok("server sudah jalan");
} else {
  c.work("menyalakan server…");
  detach("bun run server/api.ts", ".runs/server.log");
  if (!(await waitFor(() => reachable(`${UI}/api/status`), 25, "server"))) process.exit(1);
  c.ok("server jalan di :5173");
}

// ---------------------------------------------------------------- deploy
c.head("6. Kontrak & generasi nol");
const status = (await (await fetch(`${UI}/api/status`)).json()) as { deployed: boolean };
if (status.deployed) {
  c.ok("kontrak sudah ter-deploy");
} else {
  c.work("men-deploy dan mencetak empat founder…");
  const r = await fetch(`${UI}/api/deploy`, { method: "POST" });
  if (!r.ok) { c.bad("deploy gagal"); console.log(await r.text()); process.exit(1); }
  c.ok("empat founder ter-mint ke tiga pemilik berbeda, generasi nol disegel");
}

const agents = (await (await fetch(`${UI}/api/agents`)).json()) as { id: number; name: string }[];
c.ok(`${agents.length} agent siap`);

// ---------------------------------------------------------------- model
c.head("7. Kunci model");
const envOk = existsSync(".env") && (await Bun.file(".env").text()).match(/^(GROQ|GEMINI|OPENROUTER|ANTHROPIC)_API_KEY=\S+/m);
if (envOk) c.ok("kunci model ada di .env");
else {
  c.bad("belum ada kunci model di .env");
  c.dim("Agent butuh ini untuk bisa berpikir. Yang gratis dan tanpa kartu:");
  c.dim("  1. buka https://console.groq.com/keys, buat kunci");
  c.dim("  2. echo 'PROVIDER=groq' >> .env");
  c.dim("  3. echo 'GROQ_API_KEY=gsk_...' >> .env");
  c.dim("  4. jalankan skrip ini lagi");
}

// ---------------------------------------------------------------- selesai
console.log(`
\x1b[1m\x1b[32mSIAP\x1b[0m   buka  \x1b[1m${UI}\x1b[0m

  Yang bisa langsung dicoba:

  1. tab \x1b[1mRoster\x1b[0m     lihat empat agent bawaan dan trait warisannya
  2. tab \x1b[1mKawinkan\x1b[0m   pilih #1 dan #2 → Kawinkan → Majukan 6 blok → Tetaskan
                     anaknya mewarisi keamanan dari #1 dan estetika dari #2
  3. tab \x1b[1mJalankan\x1b[0m   pilih anaknya, tulis tugas, jalankan
${envOk ? "" : "\n  \x1b[33mLangkah 3 butuh kunci model. Lihat bagian 7 di atas.\x1b[0m\n"}
  Dari Claude Code:  jalankan dari folder ini, cek dengan /mcp
  Berhenti:          bun run stop
`);
