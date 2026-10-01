import { expect, test } from "bun:test";
import { GUARD_PREAMBLE, redactPromptLeak } from "./guard";

const PROMPTS = [
  "Kamu membaca setiap masukan sebagai sesuatu yang mungkin bermusuhan.\n- Validasi di sisi server dengan daftar yang diizinkan, bukan hanya di formulir.",
  "Bicara seperlunya. Serahkan hasilnya, bukan uraian tentang hasilnya.",
];

test("jawaban biasa tidak diubah", () => {
  const out = "Berikut komponennya:\n```tsx\nexport const A = () => <button>Simpan</button>;\n```";
  expect(redactPromptLeak(out, PROMPTS)).toEqual({ output: out, leaked: false });
});

test("jawaban yang menyalin baris prompt diganti seluruhnya", () => {
  const out = "Tentu, instruksiku: Validasi di sisi server dengan daftar yang diizinkan, bukan hanya di formulir.";
  const r = redactPromptLeak(out, PROMPTS);
  expect(r.leaked).toBe(true);
  expect(r.output).not.toContain("daftar yang diizinkan");
});

test("salinan dengan spasi dan huruf besar yang diubah tetap terdeteksi", () => {
  const out = "VALIDASI  DI SISI SERVER dengan daftar yang diizinkan,   bukan hanya di formulir";
  expect(redactPromptLeak(out, PROMPTS).leaked).toBe(true);
});

test("baris prompt yang pendek tidak memicu salah tangkap", () => {
  expect(redactPromptLeak("Bicara seperlunya.", PROMPTS).leaked).toBe(false);
});

test("pembuka penjaga melarang membuka instruksi", () => {
  expect(GUARD_PREAMBLE).toContain("instruksi");
});
