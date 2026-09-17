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

## 2. Dengan chain lokal — masih tanpa API key dan tanpa ETH

Dua terminal.

```bash
# terminal 1
bun run anvil

# terminal 2
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
| Web UI | Belum |

Dari tiga klaim proyek di `PLAN.md` §1: klaim 1 (pewarisan terverifikasi)
**sudah terbukti dan bisa diuji sekarang**. Klaim 2 (anak mengungguli kedua
parent) **belum terbukti** — lihat §22.2a. Klaim 3 (royalti mengalir ke leluhur)
**belum dibangun**.
