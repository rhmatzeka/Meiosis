/**
 * Cadangan "otak" Meiosis: soul agent (profil + instruksi rahasia), jatah,
 * moderasi, metrik, konfigurasi admin, dan prompt modul privat. Tanpa berkas
 * soul, hash on-chain tidak bisa mengembalikan isi agent.
 *
 *   bun run scripts/backup.ts                 buat arsip terenkripsi
 *   bun run scripts/backup.ts --restore <f>   pulihkan arsip ke folder proyek
 *
 * Arsip: tar.gz dienkripsi openssl AES-256-CBC + PBKDF2. Kuncinya di
 * ~/.config/meiosis/backup.key (dibuat sekali, chmod 600, JANGAN masuk repo).
 * Tujuan: BACKUP_DIR, bawaan ~/backup-flashdisk/meiosis; menyimpan 48 arsip terakhir.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const KEY = join(homedir(), ".config/meiosis/backup.key");
const DEST = process.env.BACKUP_DIR ?? join(homedir(), "backup-flashdisk/meiosis");
const KEEP = 48;

if (!existsSync(KEY)) {
  mkdirSync(join(homedir(), ".config/meiosis"), { recursive: true });
  writeFileSync(KEY, randomBytes(32).toString("hex"));
  chmodSync(KEY, 0o600);
  console.log(`  kunci cadangan baru dibuat di ${KEY}; simpan salinannya di tempat aman (tanpa kunci, arsip tidak bisa dibuka)`);
}

const run = (cmd: string[]) => {
  const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`${cmd[0]} gagal: ${p.stderr.toString().trim()}`);
};

const restore = process.argv.indexOf("--restore");
if (restore > 0) {
  const file = process.argv[restore + 1];
  if (!file || !existsSync(file)) { console.error("  arsip tidak ditemukan"); process.exit(1); }
  const tmp = `${file}.tar.gz`;
  run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-in", file, "-out", tmp, "-pass", `file:${KEY}`]);
  run(["tar", "-xzf", tmp, "-C", process.env.RESTORE_TO ?? "."]);
  rmSync(tmp);
  console.log(`  dipulihkan dari ${file}`);
  process.exit(0);
}

const files = [
  ...readdirSync(".runs").filter((f) => /^(souls|usage|hidden|metrics|admin-config|feedback|reports|faucet|licenses|api-keys)-.+\.json$/.test(f)).map((f) => join(".runs", f)),
  ...(existsSync("private") ? ["private"] : []),
  ...(existsSync("deployments") ? ["deployments"] : []),
];
if (!files.length) { console.log("  tidak ada yang perlu dicadangkan"); process.exit(0); }

mkdirSync(DEST, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const tmp = join(DEST, `.meiosis-${stamp}.tar.gz`);
const out = join(DEST, `meiosis-${stamp}.tar.gz.enc`);
run(["tar", "-czf", tmp, ...files]);
run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt", "-in", tmp, "-out", out, "-pass", `file:${KEY}`]);
rmSync(tmp);
chmodSync(out, 0o600);

const old = readdirSync(DEST).filter((f) => /^meiosis-.+\.tar\.gz\.enc$/.test(f)).sort().slice(0, -KEEP);
for (const f of old) rmSync(join(DEST, f));
console.log(`  cadangan: ${out} (${(statSync(out).size / 1024).toFixed(1)} KB, ${files.length} berkas/folder)${old.length ? `, ${old.length} arsip lama dihapus` : ""}`);
