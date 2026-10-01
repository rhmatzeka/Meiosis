import { expect, test } from "bun:test";
import { embedWatermark, readWatermark, stripWatermark } from "./watermark";

const PROMPT = "Bagian satu.\nBaris kedua.\n\n---\n\nBagian dua.\nBaris lagi.";

test("watermark terbaca kembali", () => {
  expect(readWatermark(embedWatermark(PROMPT, "LIC-1a2b3c4d"))).toBe("LIC-1a2b3c4d");
});

test("teks terlihat tidak berubah", () => {
  const w = embedWatermark(PROMPT, "LIC-1a2b3c4d");
  expect(w).not.toBe(PROMPT);
  expect(stripWatermark(w)).toBe(PROMPT);
});

test("tetap terbaca walau hanya satu bagian prompt yang disalin", () => {
  const w = embedWatermark(PROMPT, "LIC-ffff0000");
  const secondPartOnly = w.split("---")[1];
  expect(readWatermark(secondPartOnly)).toBe("LIC-ffff0000");
});

test("teks tanpa watermark menghasilkan null", () => {
  expect(readWatermark(PROMPT)).toBeNull();
});
