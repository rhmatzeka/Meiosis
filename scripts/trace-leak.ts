/**
 * Melacak pemegang lisensi dari berkas `.md` yang bocor.
 *
 *   bun run trace-leak berkas.md
 *
 * Membaca watermark tak terlihat di isi prompt (tetap ada walau header
 * provenance dibuang), lalu mencarinya di catatan lisensi server.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readWatermark } from "../runtime/watermark";

const file = process.argv[2];
if (!file) { console.log("pakai: bun run trace-leak <berkas.md>"); process.exit(1); }
const id = readWatermark(readFileSync(file, "utf8"));
if (!id) { console.log("\n  Tidak ada watermark Meiosis di berkas ini.\n"); process.exit(2); }

type Lic = { licenseId: string; licensee: string; agentId: number; issuedAt: string };
const records: Lic[] = existsSync(".runs")
  ? readdirSync(".runs").filter((f) => /^licenses-.+\.json$/.test(f)).flatMap((f) => JSON.parse(readFileSync(`.runs/${f}`, "utf8")) as Lic[])
  : [];
const hit = records.find((r) => r.licenseId === id);
console.log(`\n  watermark: ${id}`);
if (!hit) { console.log("  lisensi ini tidak ada di catatan server ini.\n"); process.exit(3); }
console.log(`  pemegang : ${hit.licensee}\n  agent    : #${hit.agentId}\n  terbit   : ${hit.issuedAt}\n`);
