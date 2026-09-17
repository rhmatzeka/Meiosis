/**
 * Mengubah balasan agent menjadi berkas.
 *
 * Model tidak selalu patuh pada format yang diminta, dan itu wajar. Parser ini
 * menerima beberapa bentuk yang umum muncul, tapi TIDAK menebak-nebak: kalau
 * tidak ada berkas yang bisa dikenali, ia mengembalikan kosong dan agent itu
 * gagal di gerbang. Menambal keluaran yang berantakan sama saja menilai parser,
 * bukan menilai agent.
 */
export function parseAgentFiles(output: string): Record<string, string> {
  const files: Record<string, string> = {};

  // Bentuk 1: "## src/App.tsx" diikuti blok kode
  const headed = /^#{1,4}\s*`?([\w./-]+\.(?:tsx?|jsx?|css|html))`?\s*$\n+```[\w]*\n([\s\S]*?)```/gm;
  for (const m of output.matchAll(headed)) files[m[1]] = m[2].trimEnd() + "\n";

  // Bentuk 2: jalur ditulis sebagai komentar di baris pertama blok kode
  if (Object.keys(files).length === 0) {
    const commented = /```[\w]*\n(?:\/\/|<!--)\s*([\w./-]+\.(?:tsx?|jsx?|css|html))[^\n]*\n([\s\S]*?)```/g;
    for (const m of output.matchAll(commented)) files[m[1]] = m[2].trimEnd() + "\n";
  }

  // Bentuk 3: satu blok tsx tanpa label sama sekali — anggap App.tsx
  if (Object.keys(files).length === 0) {
    const single = output.match(/```(?:tsx|jsx|typescript)\n([\s\S]*?)```/);
    if (single && /export\s+default/.test(single[1])) {
      files["src/App.tsx"] = single[1].trimEnd() + "\n";
    }
  }

  return files;
}
