/**
 * Kontrak lingkungan build, dilampirkan ke tugas apa pun yang hasilnya akan
 * benar-benar dibangun di sandbox.
 *
 * Tanpa ini agent gagal karena hal yang tidak ada hubungannya dengan
 * kemampuannya: menulis `export function App` padahal template mengimpor
 * default, atau memanggil dependensi yang tidak terpasang. Itu menilai
 * tebakannya soal kerangka proyek, bukan mutu pekerjaannya.
 *
 * Isinya sengaja hanya berisi fakta lingkungan — tidak ada petunjuk gaya,
 * struktur, atau kualitas, karena hal-hal itulah yang justru harus datang dari
 * genome dan dibedakan oleh rubrik.
 */
export const BUILD_CONTRACT = `
LINGKUNGAN BUILD

Proyek sudah ada: Vite + React 18 + TypeScript, sudah terpasang.

- \`src/main.tsx\` mengimpor \`import App from "./App"\`, jadi \`src/App.tsx\`
  WAJIB memakai \`export default\`.
- Ubah hanya berkas di dalam \`src/\`, \`public/\`, atau \`index.html\`.
- \`package.json\` terkunci dan tidak ada akses jaringan, jadi dependensi baru
  tidak bisa dipasang. Yang tersedia hanya react dan react-dom.
- Kode akan diperiksa \`tsc --noEmit\`, jadi tipe harus benar. Hindari \`any\`.
- Styling boleh inline style atau berkas CSS yang kamu impor sendiri.

FORMAT JAWABAN

Untuk tiap berkas, tulis jalurnya sebagai heading lalu isinya dalam blok kode.
Tidak ada teks lain sebelum berkas pertama.

## src/App.tsx
\`\`\`tsx
export default function App() {
  return <main>…</main>;
}
\`\`\`
`.trim();
