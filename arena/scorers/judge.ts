/**
 * Judge subjektif, buta identitas.
 *
 * Judge tidak pernah tahu agent mana yang dinilainya, siapa orang tuanya, atau
 * apakah ia anak atau induk. Tanpa itu, seluruh pembelaan lain soal kenetralan
 * skor ikut melemah — dan ini bagian yang paling murah dikerjakan.
 *
 * Judge menerima fakta terukur, bukan screenshot. Model teks di free tier Groq
 * tidak bisa melihat gambar, dan memaksakan penilaian visual tanpa gambar akan
 * jadi tebakan. Fakta seperti skala tipografi, jumlah warna, dan ritme spasi
 * justru lebih reproducible — meski memang kehilangan hal yang hanya bisa
 * dilihat mata. Screenshot tetap disimpan untuk ditinjau manusia.
 */
import { keccak256, toBytes } from "viem";
import type { Provider } from "../../runtime/providers";

export const RUBRIC = `Nilai sebuah landing page dApp staking dari fakta terukur di bawah.
Berikan angka 0-10 untuk tiap aspek.

visualHierarchy  Apakah ada urutan kepentingan yang jelas? Skala tipografi dengan
                 jarak tegas antar tingkat mendapat nilai tinggi. Ukuran font yang
                 hampir seragam berarti hierarki lemah.
designCoherence  Apakah keputusan visualnya konsisten? Palet terbatas yang dipakai
                 disiplin dan ritme spasi yang berulang mendapat nilai tinggi.
                 Banyak warna acak dan spasi serampangan mendapat nilai rendah.
copyClarity      Apakah teksnya menjelaskan produk dengan jelas dan ringkas?
                 Judul yang menyatakan manfaat konkret mendapat nilai tinggi.
                 Teks placeholder atau jargon kosong mendapat nilai rendah.

Balas HANYA dengan JSON: {"visualHierarchy":n,"designCoherence":n,"copyClarity":n,"alasan":"satu kalimat"}`;

/** Dicatat on-chain sebelum ronde dibuka, sehingga rubrik tidak bisa diubah setelah melihat hasil. */
export const RUBRIC_HASH = keccak256(toBytes(RUBRIC));

export interface JudgeScore {
  visualHierarchy: number;
  designCoherence: number;
  copyClarity: number;
  alasan: string;
  total: number;
  model: string;
}

export async function judge(
  provider: Provider,
  render: { text: string; visual: unknown },
  maxPerAspect = 10,
): Promise<JudgeScore> {
  const facts = [
    `FAKTA TERUKUR:`,
    JSON.stringify(render.visual, null, 1),
    ``,
    `TEKS HALAMAN:`,
    render.text.slice(0, 2500),
  ].join("\n");

  const res = await provider.chat("balanced", {
    system: RUBRIC,
    messages: [{ role: "user", content: facts }],
    temperature: 0, // judge harus sekonsisten mungkin
    maxTokens: 400,
  });

  const m = res.text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`judge tidak mengembalikan JSON: ${res.text.slice(0, 160)}`);
  const p = JSON.parse(m[0]) as Partial<JudgeScore>;

  const clamp = (v: unknown) => Math.max(0, Math.min(maxPerAspect, Number(v) || 0));
  const vh = clamp(p.visualHierarchy), dc = clamp(p.designCoherence), cc = clamp(p.copyClarity);

  return {
    visualHierarchy: vh, designCoherence: dc, copyClarity: cc,
    alasan: String(p.alasan ?? "").slice(0, 200),
    total: vh + dc + cc,
    model: res.model,
  };
}
