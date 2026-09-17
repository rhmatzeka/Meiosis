# Cara menguji Meiosis

Tiga lapis, dari yang tidak butuh apa-apa sampai yang butuh kuota model.

## 0. Sekali saja

```bash
bun run setup                                   # dependensi + forge-std
docker build -t meiosis-sandbox:1 -f sandbox/Dockerfile sandbox/
```

Image sandbox ~2 menit. Perlu dibangun ulang hanya kalau `sandbox/` berubah.

---

## 1. Tanpa jaringan, tanpa API key, tanpa ETH

```bash
bun run verify
```

Sekitar 66 detik. Menjalankan empat hal:

| Yang diperiksa | Artinya kalau hijau |
|---|---|
| 10.000 simulasi perkawinan | Genome founder menghasilkan ≥40% anak yang mewarisi kedua trait unggulan |
| 27 test Foundry | Commit–reveal aman, `reroll` memulihkan, gas kelahiran di bawah anggaran, dan **Solidity identik dengan TypeScript** |
| 36 test runtime | `expand()` deterministik — 20 genome acuan menghasilkan `manifestHash` yang sama persis |
| Sandbox | Kode benar lolos tiga tahap; kode rusak lolos build tapi gagal typecheck dan gagal render |

Kalau docker tidak jalan, langkah sandbox dilewati dan sisanya tetap berjalan.

**Kalau test acuan merah**, artinya `expand()` bergeser. Itu disengaja galak.
Kalau pergeserannya memang dimaksud, jalankan `bun run gen-golden` dan masukkan
hasilnya ke commit yang sama.

Perintah satuan, kalau mau memisah:

```bash
bun run gene-sim          # simulasi genetik + laporan sebaran
bun run test:contracts    # forge test
bun run test              # test runtime
bun run test:sandbox      # sandbox saja
```

---

## 2. Lewat UI — cara paling enak melihat semuanya

Dua terminal, lalu buka browser.

```bash
# terminal 1
bun run anvil

# terminal 2
bun run ui          # http://localhost:5173
```

Di halaman itu:

1. **Klik "Deploy & mint generasi nol"** — sekali klik: empat kontrak ter-deploy,
   empat founder ter-mint ke tiga pemilik berbeda, generasi nol disegel.
2. **Tab Roster** — kartu tiap agent beserta trait yang terekspresi dan modul
   skill yang aktif. Klik **"catat ke chain"** pada baris manifest; setelah itu
   berubah jadi **✓ cocok**, artinya agent yang akan dijalankan runtime terbukti
   agent yang tercatat di chain.
3. **Tab Kawinkan** — pilih dua induk, lihat kekerabatan dan perbandingan
   trait-nya, lalu klik Kawinkan. Muncul kartu kehamilan dengan hitung mundur
   blok. Klik **"Majukan 6 blok"** untuk mempercepat, lalu **Tetaskan**.
4. **Tab Jalankan** — inilah cara memakai agent-nya. Pilih satu atau beberapa
   agent, tulis tugas (atau pakai contoh yang tersedia), klik Jalankan. Genome
   dibaca dari chain, dirakit jadi agent, lalu dijalankan sungguhan. Kalau
   memilih beberapa agent sekaligus, semuanya menerima tugas yang persis sama —
   sehingga satu-satunya yang berbeda di antara keluaran mereka adalah genome.

   Contoh yang paling jelas memperlihatkan pengaruh genome: pilih `#1 Solidity
   Smith` dan `#2 Pixel Sense`, lalu pakai tugas contoh **Audit singkat**.
   #1 menjawab 171 token dan langsung menunjuk XSS; #2 menjawab 562 token
   dengan tabel lima masalah dan menaruh XSS di urutan kedua.

   Centang **mode tiruan** kalau hanya ingin menguji alurnya tanpa memakai kuota.

5. **Tab Silsilah** — pohon keluarga; anak muncul di generasi berikutnya.
6. **Tab Arena** — hasil ronde terakhir, lengkap dengan rincian tiap baris rubrik.

UI ini memakai kunci bawaan Anvil yang memang publik, jadi tidak perlu MetaMask.
Untuk Sepolia nanti, `breed()` harus dipanggil dari wallet pengguna sendiri.

### Tanpa UI

```bash
bun run demo:local
```

Menjalankan seluruh siklus hidup dan berhenti di dua pembuktian:

```
7. Verifikasi independen
   genome on-chain  0x0000824141824041…
   dihitung ulang   0x0000824141824041…
   ✓ COCOK — anak ini terbukti sah tanpa mempercayai siapa pun

10. Mencatat manifestHash ke chain
   dihitung runtime  0x623c7583876fd225
   tersimpan di chain 0x623c7583876fd225
   ✓ COCOK — agent yang dijalankan terbukti agent yang tercatat di chain
```

Baris 7 adalah klaim inti proyek: anak dihitung ulang dari nol dengan
implementasi TypeScript, dan hasilnya sama dengan yang dilahirkan kontrak.
Tiap kali dijalankan, seed-nya berbeda sehingga anaknya juga berbeda.

---

## 3. Dengan model sungguhan — butuh `GROQ_API_KEY` di `.env`

```bash
bun run demo:runtime                 # tiga agent, satu tugas kecil, ~1 menit
MOCK_LLM=0 RUNS=1 bun run arena      # ronde arena penuh, ~6 menit
MOCK_LLM=0 RUNS=3 bun run arena      # median tiga run, ~20 menit
```

`MOCK_LLM=1` di `.env` membuat seluruh pipa berjalan tanpa menyentuh jaringan —
berguna untuk menguji alurnya tanpa membakar kuota. Setel `MOCK_LLM=0` untuk
panggilan sungguhan.

Arena mencetak rincian per baris rubrik, jadi bisa dilihat dari mana tiap poin
datang, bukan hanya totalnya.

---

## Yang BELUM bisa diuji

| Bagian | Status |
|---|---|
| Deploy Sepolia | Belum — menunggu ETH faucet ke `0xF89A0296C03589A6E28a6687D45953FA8B09B41d` |
| `Arena.sol` — skor on-chain | Belum ditulis; skoring masih off-chain |
| `LineageRoyalty.sol` — royalti ke leluhur | Belum ditulis |
| Orchestrator / watcher auto-hatch | Belum; `hatch()` masih manual |
| Indexer & pohon keluarga | Belum |
| Web UI | Ada untuk chain lokal; belum terhubung Sepolia |

Dari tiga klaim proyek di `PLAN.md` §1: klaim 1 (pewarisan terverifikasi)
**sudah terbukti dan bisa diuji sekarang**. Klaim 2 (anak mengungguli kedua
parent) **belum terbukti** — lihat §22.2a. Klaim 3 (royalti mengalir ke leluhur)
**belum dibangun**.
