import { expect, test } from "bun:test";
import { splitBlocks } from "./blocks";

test("teks dan blok kode dipisah berurutan", () => {
  const t = "Ini filenya:\n```ts\n// src/a.ts\nexport const a = 1;\n```\nLalu jalankan.\n```bash\nbun test\n```";
  expect(splitBlocks(t)).toEqual([
    { kind: "text", text: "Ini filenya:" },
    { kind: "code", lang: "ts", code: "// src/a.ts\nexport const a = 1;" },
    { kind: "text", text: "Lalu jalankan." },
    { kind: "code", lang: "bash", code: "bun test" },
  ]);
});
test("blok tanpa penutup dianggap kode sampai akhir", () => {
  expect(splitBlocks("Mulai\n```py\nprint(1)")).toEqual([
    { kind: "text", text: "Mulai" },
    { kind: "code", lang: "py", code: "print(1)" },
  ]);
});
test("tanpa blok kode: satu bagian teks; kosong: tidak ada bagian", () => {
  expect(splitBlocks("halo")).toEqual([{ kind: "text", text: "halo" }]);
  expect(splitBlocks("  ")).toEqual([]);
});
