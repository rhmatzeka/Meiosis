/**
 * Watermark tak terlihat untuk `.md` lengkap milik pemilik agent.
 *
 * Nomor lisensi dikodekan sebagai karakter zero-width (U+200B = 0, U+200C = 1),
 * diapit penanda U+2060, dan disisipkan di akhir baris pertama setiap bagian
 * prompt. Kalau berkasnya bocor — bahkan bila header provenance dibuang atau
 * hanya satu bagian yang disalin — pemegang lisensinya masih bisa dilacak.
 *
 * Ini bukan perlindungan dari penyalinan (tidak ada yang bisa melindungi teks),
 * melainkan jejak supaya kebocoran punya nama.
 */
const ZERO = "​", ONE = "‌", MARK = "⁠";
const SEP = "\n\n---\n\n";

const encode = (s: string) =>
  MARK + [...new TextEncoder().encode(s)].map((b) => b.toString(2).padStart(8, "0")).join("").replace(/0/g, ZERO).replace(/1/g, ONE) + MARK;

export function embedWatermark(prompt: string, licenseId: string): string {
  const tag = encode(licenseId);
  return prompt.split(SEP).map((part) => {
    const nl = part.indexOf("\n");
    return nl < 0 ? part + tag : part.slice(0, nl) + tag + part.slice(nl);
  }).join(SEP);
}

export function readWatermark(text: string): string | null {
  const m = text.match(new RegExp(`${MARK}([${ZERO}${ONE}]+)${MARK}`));
  if (!m) return null;
  const bits = m[1].replace(new RegExp(ZERO, "g"), "0").replace(new RegExp(ONE, "g"), "1");
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return new TextDecoder().decode(bytes);
}

export const stripWatermark = (text: string) => text.replace(new RegExp(`[${ZERO}${ONE}${MARK}]`, "g"), "");
