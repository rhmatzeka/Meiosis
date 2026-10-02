# Cara menguji Meiosis

Tiga lapis, dari yang tidak butuh apa-apa sampai yang butuh kuota model.

## 0. Sekali saja

```bash
bun run setup                                   # dependensi + forge-std + openzeppelin, lalu compile
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
| 10.000 simulasi perkawinan | Genome founder (alat riset, tidak di-deploy) menghasilkan ≥40% anak yang mewarisi kedua trait unggulan |
| 38 test Foundry | Commit–reveal aman, `reroll` memulihkan, royalti terbagi ke empat generasi tanpa wei hilang, nama hanya bisa diganti pemilik, dan **Solidity identik dengan TypeScript** |
| 39 test runtime | `expand()` deterministik — 20 genome acuan menghasilkan `manifestHash` yang sama persis; ekspor `.md` bisa dibaca balik identik |
| Sandbox | Kode benar lolos tiga tahap; kode rusak lolos build tapi gagal typecheck dan gagal render |

Kalau docker tidak jalan, langkah sandbox dilewati dan sisanya tetap berjalan.

`test_BirthGasStaysUnderBudget` merah di Foundry 1.8: `hatch()` terukur 169k
gas, sementara anggarannya 130k. Sebagian besar dari biaya itu adalah `mint()`
sendiri (±105k — dua slot baru untuk struct Agent plus saldo dan pemilik
ERC-721). Kontraknya tidak berubah sejak test itu ditulis; penyebab selisihnya
belum dilacak — dugaan terkuat versi Foundry atau OpenZeppelin yang berbeda.
Anggarannya sengaja belum dilonggarkan: itu keputusan desain, bukan perbaikan test.

**Kalau test acuan merah**, artinya `expand()` bergeser. Itu disengaja galak.
Kalau pergeserannya memang dimaksud, jalankan `bun run gen-golden` dan masukkan
hasilnya ke commit yang sama.

### Uji alur wallet

```bash
bun run anvil && bun run ui          # terminal lain, lalu klik Deploy sekali
bun run scripts/test-wallet-flow.ts  # ~30 detik
```

Memakai dua akun Anvil yang tidak dipegang server. Setiap langkah meminta tx ke
`/api/tx` lalu menandatanganinya sendiri — persis yang dikerjakan MetaMask di
Sepolia: kawinkan agent orang lain, tetaskan, catat manifest, beri nama, pasang
tarif kawin, bayar agent (5% harus mendarat di pemilik induk), tarik royalti,
lalu ekspor `.md` dan buktikan keasliannya — termasuk memastikan berkas yang
promptnya diubah ditolak.

### Uji UI lewat browser sungguhan

```bash
bun run start --test   # chain lokal + server mode uji (akun Anvil + LLM tiruan, jatah longgar)
bun run e2e            # 7 spec, ±10 menit, tanpa kuota model; butuh Chrome/Chromium
```

`bun run e2e` menolak berjalan bila server tidak dalam mode uji. Spec-nya:

| Spec | Yang diperiksa |
|---|---|
| `empty.spec.ts` | pasar kosong (data agent dicegat jadi kosong): tiap halaman tanpa galat dan mengarah ke Studio |
| `journey.spec.ts` | tanpa jejak demo, masuk dengan wallet tiruan, peluang sifat bebas sebelum kawin, refresh di tengah pembuahan, lahir, catat manifest, unduh `.md` lalu `verify-agent` SAH, picker bisa dicari, hasil tugas bisa diunduh, chain mati, animasi, layar 375 px tanpa geser |
| `wallet.spec.ts` | jalur wallet EIP-1193 tiruan (Anvil #6): kawin, aksi pemilik, royalti, ekspor; wallet baru bersaldo 0 melihat langkah pertama, lembar konfirmasi menolak bayar (tanpa transaksi), lalu bayar sewa setelah diisi |
| `market.spec.ts` | Studio tanpa daftar pilihan: Rancang untukku, stack bebas, sifat buatan sendiri, Coba dulu (memakai jatah), buat agent, kartu Pasar dan pencarian sifat, Sunting otak (versi 2), Studio di ponsel, jual-beli dengan biaya platform |
| `protect.spec.ts` | saldo untuk Claude Code (dengan konfirmasi bayar), API key, MCP seperti Claude Code, `.md` remote vs lengkap, pelacakan kebocoran |
| `admin.spec.ts` | `/admin` hanya untuk admin (Anvil #9 di mode uji), masukan dari footer, laporan → sembunyikan → tampilkan lagi |
| `a11y.spec.ts` | axe-core tanpa pelanggaran serious/critical di 10 halaman × desktop dan ponsel; Studio bisa diisi hanya dengan keyboard |

Agent untuk uji dibuat sendiri oleh `seedAgents()` di `e2e/harness.ts` lewat
Studio (tidak ada founder), atas nama akun Anvil #1.

Browser dicari di `/usr/bin/chromium`, `/usr/bin/google-chrome`, dan
`/opt/google/chrome/chrome`, atau lewat `CHROMIUM_PATH`.

## 2. Lewat UI — cara paling enak melihat semuanya

```bash
bun run start          # mode biasa: tanpa akun demo, tanpa agent bawaan
```

1. Buka http://localhost:5173 dan klik **Masuk** (Privy bila `PRIVY_APP_ID`
   terisi, selain itu MetaMask).
2. **Studio**: ceritakan agent yang kamu butuhkan → **Rancang untukku** →
   sunting tugas, sifat (teks bebas, tambah sifat sendiri), dan instruksi →
   **Coba** satu tugas → **Buat agent**.
3. Buat agent kedua dengan sifat berbeda, buka untuk kawin, lalu **Kawinkan**:
   tabel peluang menunjukkan sifat mana yang pasti turun dan mana yang 50:50.
   Sekitar satu menit kemudian anaknya lahir; halaman anak menunjukkan dari induk
   mana setiap sifat berasal.
4. **Beri tugas**: cari agent di picker, tulis tugas, **Jalankan**. Blok kode
   bisa disalin per blok, dan seluruh jawaban bisa diunduh.
5. **Dompet**: langkah pertama, saldo, transaksi berjalan, saldo untuk Claude
   Code, dan API key.
6. **/admin** (alamat di `ADMIN_ADDRESSES`): pemakaian AI hari ini, saldo
   operator, minat 7 hari, laporan, masukan, dan pengaturan jatah.

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
| Deploy Sepolia | Skrip siap (`bun run deploy:sepolia`, lihat DEPLOY.md) — menunggu ETH faucet ke deployer |
| `Arena.sol` — skor on-chain | Belum ditulis; skoring masih off-chain |
| Orchestrator / watcher auto-hatch | Belum; `hatch()` ditekan manual, oleh siapa pun |
| Indexer | Belum; roster dibaca langsung dari chain lewat multicall, di-cache 8 detik |

Dari tiga klaim proyek di `PLAN.md` §1: klaim 1 (pewarisan terverifikasi)
**sudah terbukti dan bisa diuji sekarang**. Klaim 2 (anak mengungguli kedua
parent) **belum terbukti** — lihat §22.2a. Klaim 3 (royalti mengalir ke leluhur)
**sudah dibangun dan diuji** di `LineageRoyalty.sol`, tinggal dibuktikan di Sepolia.
