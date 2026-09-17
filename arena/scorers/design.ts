/**
 * Menilai kualitas visual dari fakta terukur, bukan dari selera.
 *
 * Ini ditambahkan setelah uji diskriminasi pertama: G0 dan G1 mendapat skor
 * deterministik yang identik baris per baris, karena setiap cek yang ada hanya
 * menanyakan "apakah ada yang salah". Agent yang genome-nya berfokus pada
 * estetika tidak punya satu pun jalan untuk membuktikan keunggulannya secara
 * objektif — semuanya bergantung pada judge.
 *
 * Ketiga ukuran di bawah adalah prinsip desain yang memang bisa dihitung.
 */
export interface VisualFacts {
  distinctFontSizes: number[];
  distinctTextColors: number;
  distinctBackgrounds: number;
  distinctSpacings: number[];
  fontFamilies: string[];
  counts: Record<string, number>;
}

export interface DesignBreakdown {
  typeScale: number;
  palette: number;
  rhythm: number;
  total: number;
  max: number;
  detail: string;
}

/**
 * Skala tipografi: hierarki butuh tingkatan yang jumlahnya cukup DAN jaraknya
 * tegas. Ukuran yang hampir seragam berarti semuanya terasa sama penting.
 */
function typeScaleScore(sizes: number[], max: number): [number, string] {
  if (sizes.length < 2) return [0, "hanya satu ukuran font"];
  const ratio = sizes[sizes.length - 1] / sizes[0];
  const levels = Math.min(sizes.length, 5);
  const levelScore = (levels - 1) / 4;             // 2 ukuran -> 0,25 ; 5+ -> 1
  const ratioScore = Math.min(ratio / 3, 1);        // rasio 3x atau lebih -> penuh
  const s = Math.round((levelScore * 0.5 + ratioScore * 0.5) * max * 10) / 10;
  return [s, `${sizes.length} tingkat, rasio ${ratio.toFixed(1)}x`];
}

/**
 * Disiplin palet: sedikit warna yang dipakai konsisten mengalahkan banyak warna
 * yang dipakai sembarangan. Tapi satu warna saja juga berarti tanpa aksen.
 */
function paletteScore(colors: number, backgrounds: number, families: number, max: number): [number, string] {
  const total = colors + backgrounds;
  let s: number;
  if (total <= 2) s = 0.5;                          // terlalu polos
  else if (total <= 6) s = 1;                       // ideal
  else if (total <= 10) s = 0.6;
  else s = 0.25;                                    // serampangan
  if (families > 2) s *= 0.75;                      // lebih dari dua jenis huruf
  return [Math.round(s * max * 10) / 10, `${total} warna, ${families} jenis huruf`];
}

/**
 * Ritme spasi: nilai yang merupakan kelipatan satu satuan dasar terasa
 * disengaja. Angka acak terasa asal tempel.
 */
function rhythmScore(spacings: number[], max: number): [number, string] {
  if (spacings.length === 0) return [0, "tanpa spasi"];
  const bases = [8, 4, 6];
  let best = 0, bestBase = 8;
  for (const b of bases) {
    const hit = spacings.filter((s) => s % b === 0).length / spacings.length;
    if (hit > best) { best = hit; bestBase = b; }
  }
  return [Math.round(best * max * 10) / 10, `${Math.round(best * 100)}% kelipatan ${bestBase}px`];
}

export function scoreDesign(v: VisualFacts | undefined, points: number): DesignBreakdown {
  const max = points;
  if (!v) return { typeScale: 0, palette: 0, rhythm: 0, total: 0, max, detail: "tanpa data visual" };

  const share = max / 3;
  const [ts, tsD] = typeScaleScore(v.distinctFontSizes, share);
  const [pl, plD] = paletteScore(v.distinctTextColors, v.distinctBackgrounds, v.fontFamilies.length, share);
  const [rh, rhD] = rhythmScore(v.distinctSpacings, share);

  return {
    typeScale: ts, palette: pl, rhythm: rh,
    total: Math.round((ts + pl + rh) * 10) / 10, max,
    detail: `${tsD}; ${plD}; ${rhD}`,
  };
}
