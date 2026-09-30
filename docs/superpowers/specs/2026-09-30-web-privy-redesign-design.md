# Web Meiosis: Privy, alur terpandu, dan tampilan baru

Tanggal: 2026-09-30 · Status: disetujui untuk dikerjakan

## 1. Tujuan

Web Meiosis sekarang adalah panel teknis: lima tab sejajar, kartu penuh hex
genome, "Majukan 6 blok", dan wallet yang hanya jalan kalau ada MetaMask.
Orang yang baru datang tidak tahu harus mulai dari mana.

Rombakan ini membuat web **siap dipakai sungguhan**, bukan sekadar demo:

- **Pengguna utama: juri hackathon.** Buka link, paham dalam satu kalimat,
  dan anak pertamanya lahir tanpa membaca dokumen.
- **Pengguna berikutnya: siapa pun** yang ingin mengawinkan, mengelola, dan
  membawa pulang agent. Semua fitur lama tetap ada dan dirapikan.

### Kriteria berhasil

1. Orang tanpa wallet: beranda → masuk dengan Google/email → anak lahir,
   **satu kali tekan "Kawinkan"**, tanpa jendela konfirmasi wallet dan tanpa
   mencari ETH sendiri. Di Sepolia selesai dalam ±3 menit.
2. Tidak ada istilah teknis di jalur utama (hex, lokus, commit–reveal, blok).
   Detail teknis tetap bisa dibuka, tidak disembunyikan.
3. Semua fitur lama tersedia: koleksi, beri nama, tarif kawin, buka/tutup
   kawin, bayar/sewa, tarik royalti, catat manifest, ekspor `.md`/manifest,
   jalankan agent, silsilah, arena.
4. Enak dipakai di layar 375 px sampai desktop lebar.
5. `bun run start` di laptop tetap jalan **tanpa** Privy App ID (akun demo Anvil).

## 2. Keputusan yang sudah diambil

| Topik | Keputusan |
|---|---|
| Arah visual | **B · Bioluminesen**: gelap, agent sebagai sel bercahaya, pita genome 16 garis |
| Login | Privy: email + Google + wallet eksternal; embedded wallet untuk yang belum punya |
| Gas pengguna baru | Server mengirim sedikit ETH dari wallet operator (faucet), dibatasi |
| Alur utama | 4 layar: Beranda → Pilih induk → Menunggu → Lahir (storyboard disetujui) |
| Privy App ID | Belum ada; dibaca dari `PRIVY_APP_ID` di `.env` |

## 3. Arsitektur

### 3.1 Frontend: React + TypeScript, dibundel Bun

Privy hanya punya SDK React (`@privy-io/react-auth`), jadi `web/` pindah dari
vanilla JS ke React 19 + TypeScript. Tidak ada Vite: `Bun.serve` memakai
**HTML import** (`import app from "../web/index.html"`), yang otomatis membundel
TSX dan CSS. Satu proses, satu port, sama seperti sekarang.

```
web/
  index.html
  src/
    main.tsx              PrivyProvider (bila ada App ID) + App
    app.tsx               tata letak, router, header
    router.ts             router kecil berbasis History API (tanpa dependensi)
    api.ts                fetch ke /api/*, tipe data
    hooks/
      use-status.ts       /api/status, polling blok
      use-agents.ts       /api/agents + /api/pregnancies, segar tiap blok baru
      use-actor.ts        SIAPA yang bertransaksi dan BAGAIMANA (lihat 3.3)
    lib/
      genetics.ts         peluang warisan & asal gen (murni, diuji)
      traits.ts           kamus trait → label, ikon, kalimat awam
      errors.ts           galat kontrak/wallet → kalimat manusia
      format.ts
    components/           Cell, GenomeStrip, AgentCard, TraitList, Button,
                          Modal, Toast, Stepper, EmptyState, NetworkBadge, …
    pages/
      home.tsx            Beranda
      breed.tsx           Kawinkan (pilih induk → menunggu → lahir)
      agent.tsx           Detail agent
      collection.tsx      Koleksi (semua / milikku, saring)
      family.tsx          Silsilah
      run.tsx             Beri tugas
      arena.tsx           Arena
      wallet.tsx          Dompetku: saldo, royalti, agent & kehamilan milikku
    styles/
      tokens.css          warna, huruf, jarak, radius, bayangan
      base.css, components.css
```

Font dibundel lewat `@fontsource` (Space Grotesk, Inter, JetBrains Mono) agar
tidak bergantung pada Google Fonts saat demo offline.

### 3.2 Rute

| URL | Isi |
|---|---|
| `/` | Beranda: satu kalimat, contoh masalah, "Coba kawinkan", cara kerja 3 langkah |
| `/kawin` `?a=&b=` | Pilih induk + peluang warisan + tombol Kawinkan |
| `/kawin/:pid` | Menunggu → otomatis berubah jadi layar Lahir. Aman di-refresh dan dibagikan |
| `/agent/:id` | Detail: sel, pita genome, sifat dalam bahasa awam, induk & anak, aksi |
| `/koleksi` | Grid agent, saring: milikku / generasi / sifat; cari nama |
| `/silsilah` | Pohon keluarga, klik simpul → detail agent |
| `/tugas` `?id=` | Beri tugas ke satu atau beberapa agent |
| `/arena` | Hasil arena |
| `/dompet` | Alamat, saldo, royalti siap ditarik, agent & kehamilan milikku |

Server mengembalikan `index.html` untuk semua rute non-`/api` (SPA fallback).

### 3.3 Siapa yang bertransaksi: `useActor()`

Satu hook, tiga mode. Halaman tidak peduli mode mana yang aktif; semuanya
memanggil `actor.act(action, args)`.

| Mode | Kapan | Cara menandatangani |
|---|---|---|
| `privy` | `PRIVY_APP_ID` terisi dan pengguna masuk | `/api/tx` menyusun calldata → `wallet.getEthereumProvider()` → `eth_sendTransaction` |
| `injected` | Tanpa App ID, ada `window.ethereum` | jalur lama, dipertahankan untuk uji wallet dan pengguna MetaMask |
| `demo` | Chain lokal, belum masuk | `/api/local-act`, ditandatangani akun demo Anvil (Alice) |

Menunggu receipt selalu lewat server (`GET /api/receipt/:hash`), bukan lewat
provider wallet, sehingga embedded wallet dan chain lokal berperilaku sama.

Konfigurasi Privy:

```ts
{
  loginMethods: ["email", "google", "wallet"],
  appearance: { theme: "#05090f", accentColor: "#5fe0cb", logo, landingHeader: "Masuk ke Meiosis" },
  embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
  defaultChain, supportedChains: [defaultChain],
}
```

`showWalletUIs: false` membuat embedded wallet menandatangani tanpa jendela
konfirmasi. Wallet eksternal (MetaMask dsb.) tetap meminta konfirmasi, dan UI
menulis "Konfirmasi di wallet-mu".

`defaultChain` = Sepolia (`viem/chains`) atau Anvil (`defineChain` dengan RPC
dari `/api/status`). Embedded wallet Privy dengan RPC `127.0.0.1` belum pasti
jalan; di chain lokal, mode `demo` selalu tersedia sebagai jalur cadangan.

### 3.4 Tambahan server

**`/api/status`** menambah: `privyAppId`, `faucet: { enabled, amountEth }`,
`keeper: boolean` (penetasan otomatis aktif), `docker: boolean`.

**`/api/agents`** menambah per agent: `readyAtBlock` (cooldown) dan
`cooldownBlocks`. **`/api/pregnancies`** menambah `to` (pemilik anak kelak)
dan `childId` setelah menetas.

**`GET /api/receipt/:hash`** → `{ status: "pending" | "success" | "reverted" }`.

**Faucet: `POST /api/faucet`**, header `Authorization: Bearer <token Privy>`,
body `{ address }`.
- Token diverifikasi dengan JWKS publik Privy
  (`https://auth.privy.io/api/v1/apps/<appId>/jwks.json`, ES256,
  `iss = privy.io`, `aud = appId`) memakai `jose`. **Tidak perlu app secret.**
- Kirim `FAUCET_AMOUNT_ETH` (bawaan `0.003`) hanya bila saldo alamat itu di
  bawah separuhnya.
- Batas: satu kali per user Privy, satu kali per alamat, `FAUCET_PER_IP_DAY`
  (bawaan 3) per IP per hari, dan `FAUCET_DAILY_CAP_ETH` (bawaan 0.05) total per hari.
- Catatan pemakaian disimpan di `.runs/faucet.json`, jadi tetap berlaku setelah server restart.
- Di chain lokal: tanpa token, dikirim dari akun deployer Anvil.
- Aturan batas ditulis sebagai fungsi murni `faucetDecision(state, request)` supaya bisa diuji.

**Keeper penetasan.** Tiap blok baru server memeriksa kehamilan yang belum
menetas. Yang `block > revealBlock` ditetaskan, yang blockhash-nya kedaluwarsa
di-`reroll`. `hatch()` dan `reroll()` terbuka untuk siapa saja dan anak selalu
jatuh ke `p.to`, jadi keeper tidak bisa mencuri apa pun. Penanda tangan:
`OPERATOR_PRIVATE_KEY` di Sepolia, akun deployer di Anvil. Tanpa operator,
keeper mati dan layar Menunggu menampilkan tombol "Tetaskan" untuk pengguna.

**Deploy.** `BASE_COOLDOWN_BLOCKS` (opsional) memanggil `setBaseCooldown`
setelah deploy. Nilai kecil (mis. 1) membuat founder bisa dikawinkan banyak
juri berturut-turut.

**Penyajian web.** Rute statis `web/` diganti HTML import, plus SPA fallback.
`/artifact/*` tetap.

### 3.5 Genetika di frontend: `lib/genetics.ts`

Memakai fungsi dari `packages/shared` (`alleleX`, `dom`, `trait`, …).

- `inheritanceOdds(a, b)` → per lokus, peluang tiap trait terekspresi pada anak.
  Setiap induk menyumbang X atau Y (masing-masing ½), jadi ada 4 kombinasi.
  Dominansi tertinggi menang. Bila seri, alel dari induk pertama yang menang,
  sama dengan `express(genome, 0n)` yang dipakai runtime. Mutasi (±0,8% per
  lokus) diabaikan dan disebut di catatan kecil.
- `geneOrigin(child, a, b)` → per lokus: alel mana yang terekspresi, dari
  induk mana (alel X dari induk pertama, Y dari induk kedua; lihat
  `meiosis()`), dan apakah hasil mutasi (trait tidak ada di alel induk tsb).

### 3.6 Kamus trait: `lib/traits.ts`

Setiap lokus diberi label Indonesia, ikon, dan label nilai: mis. lokus 6 →
"Naluri keamanan" 🛡 (rendah/sedang/tinggi), lokus 3 → "Stack" (—/React/
Solidity/Python). Lokus yang memengaruhi prompt (punya modul skill) ditandai
`matters`. Layar Pilih induk dan Lahir hanya menampilkan yang `matters`;
detail agent menampilkan semuanya di bagian "Detail teknis".

## 4. Tampilan

Token warna (gelap saja: aplikasi ini untuk layar demo dan dunia sel bercahaya):

| Token | Nilai | Pakai |
|---|---|---|
| `--bg` | `#05090f` | latar |
| `--panel` | `#0b141d` | kartu |
| `--line` | `#172634` | garis |
| `--text` / `--muted` / `--dim` | `#e6f1f7` / `#8aa1ae` / `#56707e` | teks |
| `--teal` | `#5fe0cb` | aksi utama, induk pertama |
| `--pink` | `#f08ad8` | induk kedua |
| `--gold` | `#ffcf5c` | mutasi |
| `--danger` | `#ff6b6b` | galat |

Huruf: Space Grotesk (judul), Inter (teks), JetBrains Mono (angka/alamat).

**Sel** (`<Cell>`): warna gradien diturunkan deterministik dari genome
(hue dari trait disiplin utama, saturasi dari estetika, kilau dari tier),
sehingga setiap agent punya "wajah" yang konsisten di semua halaman.

**Pita genome** (`<GenomeStrip>`): 16 garis. Mode `traits` diwarnai per
nilai; mode `origin` diwarnai per asal (teal/pink/emas).

**Gerak**: pembuahan (dua sel menyatu), denyut halus saat menunggu, sel anak
muncul membesar saat lahir, garis pita terisi satu per satu. Semua dimatikan
bila `prefers-reduced-motion`.

## 5. Penanganan galat

`lib/errors.ts` menerjemahkan galat kontrak dan wallet ke kalimat manusia:

| Galat | Pesan |
|---|---|
| `OnCooldown(id, ready)` | "<nama> sedang istirahat, siap lagi ±N menit" (juga ditampilkan **sebelum** menekan tombol) |
| `NotListedForStud` | "Pemilik <nama> belum membukanya untuk kawin" |
| `InsufficientFee` | "Tarif kawin <x> ETH, saldomu kurang" + tautan faucet |
| penolakan wallet (4001) | "Dibatalkan" (tanpa nada galat) |
| saldo 0 & faucet habis | "Isi Sepolia ETH dari faucet" + alamat + tombol salin |
| chain mati / belum deploy | banner di atas halaman, dengan perintah yang harus dijalankan |
| Docker tidak ada | halaman Tugas menjelaskan dan menawarkan Ekspor `.md` sebagai gantinya |

Semua aksi punya status loading, dan tombol dinonaktifkan selama transaksi berjalan.

## 6. Pengujian

- `bun test`: `genetics.test.ts` (peluang berjumlah 1; asal gen cocok dengan
  `meiosis()` untuk seed yang diketahui; mutasi terdeteksi), `faucet.test.ts`
  (semua batas), `traits.test.ts` (semua lokus & trait punya label).
- Uji e2e browser (`e2e/journey.spec.ts`, playwright-core di host): Beranda →
  Kawinkan #1×#2 dengan akun demo → keeper menetaskan → layar Lahir → unduh
  `.md` → `verify-agent` SAH. Plus `wallet.spec.ts` diperbarui untuk mode `injected`.
- Pemeriksaan visual lewat screenshot di 375 px dan 1440 px untuk setiap halaman.
- Privy tidak bisa diuji otomatis tanpa App ID. Setelah App ID diisi,
  ada daftar periksa manual di `DEPLOY.md`.

## 7. Di luar cakupan

Perubahan kontrak, gas sponsorship/paymaster, mainnet, indexer, tema terang.

## 8. Yang harus dilakukan pemilik proyek

1. Buat app di dashboard.privy.io → aktifkan Email, Google, External wallets →
   tambahkan origin (`http://localhost:5173` dan domain produksi) → isi
   `PRIVY_APP_ID` di `.env`.
2. Isi wallet operator (`OPERATOR_PRIVATE_KEY`) dengan Sepolia ETH untuk faucet dan keeper.
3. `bun run deploy:sepolia` (dengan `BASE_COOLDOWN_BLOCKS=1` untuk hari penjurian).
