/**
 * Menulis ulang contentHash di runtime/skills/<nama>/module.json dari prompt
 * privat di private/skills/<nama>/prompt.md.
 *
 *   bun run skills:hash            hitung ulang semua hash
 *   bun run skills:hash --bump     sekaligus naikkan versi modul yang isinya berubah
 *
 * Setelah ini jalankan `bun run gen-golden`: manifestHash setiap agent ikut
 * berubah karena contentHash masuk ke manifest.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRIVATE_SKILLS, PUBLIC_SKILLS, contentHashOf } from "../runtime/genome/catalog";

const bump = process.argv.includes("--bump");
const bumpMinor = (v: string) => { const [a, b] = v.split("."); return `${a}.${Number(b) + 1}.0`; };

for (const name of readdirSync(PUBLIC_SKILLS).sort()) {
  const file = join(PUBLIC_SKILLS, name, "module.json");
  if (!existsSync(file)) continue;
  const meta = JSON.parse(readFileSync(file, "utf8"));
  const promptFile = join(PRIVATE_SKILLS, name, "prompt.md");
  const hasPrompt = existsSync(promptFile);
  if (meta.hasPrompt !== false && !hasPrompt && meta.hasPrompt === true) {
    console.error(`  ✗ ${name}: prompt privat tidak ada di ${promptFile}`);
    process.exit(1);
  }
  meta.hasPrompt = hasPrompt;
  const prompt = hasPrompt ? readFileSync(promptFile, "utf8") : "";
  const before = meta.contentHash;
  let hash = contentHashOf(meta, prompt);
  if (bump && before && before !== hash) {
    meta.version = bumpMinor(meta.version);
    hash = contentHashOf(meta, prompt);
  }
  meta.contentHash = hash;
  const sorted = Object.fromEntries(Object.keys(meta).sort().map((k) => [k, meta[k]]));
  writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`  ${before === hash ? "·" : "✓"} ${name.padEnd(24)} ${hash}  v${meta.version}${hasPrompt ? "" : "  (tanpa prompt)"}`);
}
