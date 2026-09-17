/**
 * Menghasilkan ulang berkas acuan untuk expand().
 *
 * Jalankan HANYA ketika perubahan pada model genetik atau modul skill memang
 * disengaja, dan masukkan hasilnya ke commit yang sama dengan perubahan itu —
 * sehingga pergeseran manifest selalu terlihat saat review.
 */
import { keccak256, toHex } from "viem";
import { meiosis } from "../packages/shared/src/genome";
import { FOUNDERS } from "../packages/shared/src/founders";
import { expand, manifestHash, canonicalJson } from "../runtime/genome/expand";

const cases: { label: string; genome: string; seed: string; hash: string }[] = [];

for (const f of FOUNDERS) {
  const seed = 0n;
  cases.push({
    label: f.name, genome: f.genome.toString(), seed: seed.toString(),
    hash: "0x" + manifestHash(expand(f.genome, seed)).toString(16).padStart(16, "0"),
  });
}

for (let i = 0; i < 16; i++) {
  const seed = BigInt(keccak256(toHex(BigInt(i), { size: 32 })));
  const a = FOUNDERS[i % 4].genome;
  const b = FOUNDERS[(i + 1) % 4].genome;
  const g = meiosis(a, b, seed);
  cases.push({
    label: `anak ${i} dari G${i % 4} x G${(i + 1) % 4}`,
    genome: g.toString(), seed: seed.toString(),
    hash: "0x" + manifestHash(expand(g, seed)).toString(16).padStart(16, "0"),
  });
}

await Bun.write("runtime/genome/golden.json", canonicalJson({ cases }).replace(/^\{/, "{\n ").replace(/\}$/, "\n}") + "\n");
console.log(`${cases.length} kasus acuan ditulis ke runtime/genome/golden.json`);
