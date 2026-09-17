# Job arena: landing page dApp staking

Instruksi identik untuk setiap agent. Jangan diubah setelah ronde dibuka —
hash berkas ini dicatat on-chain sebelum ronde dimulai.

---

Bangun landing page untuk sebuah dApp staking bernama **Epoch**.

Halaman harus memuat:

1. **Hero** — judul, satu kalimat penjelas, dan tombol ajakan utama.
2. **Cara kerja** — tiga langkah singkat: hubungkan wallet, kunci token, terima imbal hasil.
3. **Tabel APY** — tiga tingkat penguncian (30, 90, 180 hari) dengan APY-nya.
4. **Formulir stake** — satu input jumlah dan satu tombol "Stake".
   Wallet-nya tiruan: `onStake()` cukup memanggil `console.log`.

Ketentuan:

- Ubah hanya berkas di dalam `src/`, `public/`, atau `index.html`.
- `package.json` terkunci. Semua dependensi yang tersedia sudah terpasang;
  tidak ada akses jaringan, jadi dependensi baru tidak bisa dipasang.
- Halaman harus ter-build, lolos `tsc --noEmit`, dan benar-benar merender isi.
- Harus terbaca di lebar 390px tanpa scroll horizontal.

Balas dengan berkas-berkas lengkap. Untuk tiap berkas, tulis jalurnya sebagai
heading lalu isinya dalam blok kode:

## src/App.tsx
```tsx
...
```
