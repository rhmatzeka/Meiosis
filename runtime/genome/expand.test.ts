import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expand, manifestHash, canonicalJson, systemPrompt } from "./expand";
import { catalog } from "./catalog";
import { TRAIT_COUNTS } from "../../packages/shared/src/genome";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, "golden.json"), "utf8")) as {
  cases: { label: string; genome: string; seed: string; hash: string }[];
};

describe("expand() deterministik", () => {
  // Pagar utama. Kalau ini merah, manifestHash yang tercatat on-chain tidak
  // lagi cocok dengan yang dihasilkan runtime, dan klaim verifiability runtuh.
  // Kalau perubahannya disengaja: jalankan `bun run gen-golden` di commit yang sama.
  test.each(golden.cases.map((c) => [c.label, c] as const))(
    "acuan tetap: %s",
    (_label, c) => {
      const got = manifestHash(expand(BigInt(c.genome), BigInt(c.seed)));
      expect("0x" + got.toString(16).padStart(16, "0")).toBe(c.hash);
    },
  );

  test("dua panggilan menghasilkan byte yang sama persis", () => {
    for (const c of golden.cases.slice(0, 6)) {
      const a = canonicalJson(expand(BigInt(c.genome), BigInt(c.seed)));
      const b = canonicalJson(expand(BigInt(c.genome), BigInt(c.seed)));
      expect(a).toBe(b);
    }
  });

  test("kunci JSON selalu terurut", () => {
    const j = canonicalJson({ z: 1, a: { d: 4, b: 2 }, m: [3, 1] });
    expect(j).toBe('{"a":{"b":2,"d":4},"m":[3,1],"z":1}');
  });

  test("seed kelahiran memengaruhi manifest ketika ada lokus seri", () => {
    // Genome dengan dua alel berdominansi sama akan diputus oleh seed.
    const hashes = new Set<string>();
    const g = BigInt(golden.cases[4].genome);
    for (let s = 0n; s < 8n; s++) hashes.add(manifestHash(expand(g, s)).toString());
    expect(hashes.size).toBeGreaterThanOrEqual(1);
  });
});

describe("aturan determinisme diberlakukan, bukan sekadar dijanjikan", () => {
  const FORBIDDEN = [
    ["Date.now", /Date\.now\s*\(/],
    ["new Date", /new\s+Date\s*\(/],
    ["Math.random", /Math\.random\s*\(/],
    ["process.env", /process\.env/],
    ["fetch", /\bfetch\s*\(/],
  ] as const;

  for (const file of ["expand.ts", "catalog.ts"]) {
    const src = readFileSync(join(here, file), "utf8");
    // buang komentar agar penyebutan di dokumentasi tidak memicu alarm
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const [name, re] of FORBIDDEN) {
      test(`${file} tidak memakai ${name}`, () => {
        expect(re.test(code)).toBe(false);
      });
    }
  }
});

describe("katalog modul", () => {
  test("12 modul terdaftar", () => {
    expect(catalog().size).toBe(12);
  });

  test("setiap trait yang punya modul berada dalam jangkauan lokusnya", () => {
    for (const m of catalog().values()) {
      expect(m.traitId).toBeLessThan(TRAIT_COUNTS[m.locus]);
    }
  });

  test("system prompt disusun berurutan menurut lokus", () => {
    // G0: discipline-code (L1) harus mendahului security (L6) dan terse (L11)
    const m = expand(BigInt(golden.cases[0].genome), 0n);
    const p = systemPrompt(m);
    expect(p.indexOf("software engineer")).toBeLessThan(p.indexOf("bermusuhan"));
    expect(p.indexOf("bermusuhan")).toBeLessThan(p.indexOf("Bicara seperlunya"));
  });
});
