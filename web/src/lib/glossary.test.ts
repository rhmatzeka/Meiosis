import { expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { GLOSSARY } from "./glossary";

test("setiap istilah punya penjelasan singkat tanpa jargon genetika", () => {
  for (const [k, v] of Object.entries(GLOSSARY)) {
    expect(v.term.length, k).toBeGreaterThan(0);
    expect(v.short.length, k).toBeGreaterThanOrEqual(20);
    expect(v.short.length, k).toBeLessThanOrEqual(200);
    expect(/lokus|alel|genome/i.test(v.short), k).toBe(false);
  }
});

test("setiap <Hint k=…> memakai kunci glosarium yang ada", () => {
  const used: string[] = [];
  for (const f of new Glob("web/src/**/*.tsx").scanSync(".")) {
    for (const m of readFileSync(f, "utf8").matchAll(/<Hint k="([^"]+)"/g)) used.push(`${f}:${m[1]}`);
  }
  expect(used.length).toBeGreaterThan(5);
  for (const u of used) expect(Object.keys(GLOSSARY), u).toContain(u.split(":").pop()!);
});
