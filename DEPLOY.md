# Deploy ke Sepolia dan membuka Meiosis untuk umum

Di chain lokal, server memegang akun demo dan menandatangani semuanya sendiri.
Di Sepolia tidak begitu: **server tidak memegang kunci pengguna siapa pun.**
Setiap pengunjung masuk lewat Privy (email, Google, atau wallet yang sudah
punya), mengawinkan agent dengan wallet itu, dan anaknya jadi miliknya.

```
browser ──(1) minta tx──▶ server /api/tx ──▶ calldata + stud fee + manifestHash
   │
   └──(2) tanda tangan di wallet Privy / MetaMask ──▶ Sepolia ◀── server membaca
                                                         ▲
               wallet operator: faucet pengguna baru + keeper penetasan
```

Server memegang satu kunci: **wallet operator**. Isinya hanya Sepolia ETH untuk
dua hal: mengirim sedikit ETH ke pengguna baru supaya bisa bertransaksi, dan
menetaskan kehamilan begitu siap. `hatch()` terbuka untuk siapa saja dan anak
selalu jatuh ke pengawinnya, jadi operator tidak bisa mengambil apa pun.

## 1. Deploy kontrak

Butuh wallet khusus proyek ini, **bukan wallet utamamu**. Kalau belum ada:

```bash
cast wallet new        # simpan private key-nya ke .env sebagai DEPLOYER_PRIVATE_KEY
```

Isi alamatnya dengan Sepolia ETH dari faucet. Deploy penuh memakai sekitar
**8 juta gas** (36 transaksi) — sekitar 0,01 ETH di harga gas ±1 gwei
(September 2026). Siapkan 0,05 ETH supaya ada ruang kalau gas sedang naik:

- https://cloud.google.com/application/web3/faucet/ethereum/sepolia
- https://www.alchemy.com/faucets/ethereum-sepolia
- https://sepolia-faucet.pk910.de — menambang di browser, tanpa akun

Lalu:

```bash
bun run deploy:sepolia
```

Skrip ini memeriksa saldo dulu, lalu: deploy lima kontrak, mendaftarkan 12
modul skill ke `SkillRegistry`, mencetak empat founder, memasangnya sebagai
pejantan, mencatat manifestHash-nya, lalu **menyegel generasi nol untuk
selamanya**. Alamatnya tertulis di `deployments/sepolia.json` — commit berkas
itu, karena server membacanya.

Aman dijalankan ulang. Kalau RPC putus di tengah jalan, jalankan lagi dan ia
melanjutkan dari langkah terakhir yang belum selesai.

| Variabel `.env` | Guna |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | wajib |
| `SEPOLIA_RPC_URL` | opsional; tanpa ini dipakai RPC publik, dengan cadangan otomatis |
| `FOUNDER_OWNERS` | alamat dipisah koma; founder dibagi bergiliran. Bagikan ke ≥3 alamat supaya royalti bermakna (PLAN.md §12.1b) |
| `STUD_FEE_ETH` | tarif kawin awal tiap founder, bawaan 0 |
| `STUDIO_FEE_ETH` | biaya merancang agent di Studio, bawaan `0.002` |
| `MARKET_FEE_BPS` | biaya platform jual-beli & sewa, bawaan `250` (2,5%), paling tinggi 1000 |
| `BASE_COOLDOWN_BLOCKS` | jeda kawin dasar dalam blok (bawaan kontrak 10, berlipat tiap kawin). Untuk hari penjurian isi `1`, supaya founder bisa dikawinkan banyak juri berturut-turut |

### Verifikasi di Etherscan

```bash
ETHERSCAN_API_KEY=... bun run verify:sepolia
```

Kode yang terverifikasi membuat siapa pun bisa membaca fungsi `meiosis()` dan
pembagian royaltinya sendiri di Etherscan.

## 2. Menjalankan server untuk Sepolia

Di laptop:

```bash
bun run ui:sepolia        # http://localhost:5173, tersambung ke Sepolia
```

Buka halamannya, klik **Masuk**. Tanpa `PRIVY_APP_ID`, tombol itu memakai
wallet browser (MetaMask) dan meminta pindah ke jaringan Sepolia.

### Login Privy

Supaya orang tanpa wallet bisa masuk dengan email atau Google:

1. Buat app di [dashboard.privy.io](https://dashboard.privy.io).
2. **Login methods**: aktifkan Email, Google, dan External wallets.
3. **Embedded wallets**: aktifkan untuk Ethereum. Aplikasi meminta pembuatan
   otomatis untuk pengguna yang belum punya wallet, dan tanpa jendela
   konfirmasi saat menandatangani.
4. **Allowed origins**: tambahkan `http://localhost:5173` dan domain produksimu
   (mis. `https://meiosis.example.com`). Tanpa ini Privy menolak memuat, dan
   halaman menampilkan "Login tidak tersedia".
5. Salin **App ID** ke `.env` di server:

```bash
PRIVY_APP_ID=cm...
```

App ID bukan rahasia; server mengirimkannya ke browser lewat `/api/status`.
Server juga memakainya untuk memverifikasi token login pengguna yang meminta
faucet, lewat kunci publik Privy (JWKS). **Tidak perlu app secret.**

### Faucet dan keeper

| Variabel `.env` | Guna |
|---|---|
| `OPERATOR_PRIVATE_KEY` | wallet operator. Buat baru (`cast wallet new`), jangan pakai wallet deployer, lalu isi dengan Sepolia ETH |
| `FAUCET_AMOUNT_ETH` | jatah per pengguna baru, bawaan `0.003` (cukup untuk belasan transaksi di Sepolia) |
| `FAUCET_PER_IP_DAY` | batas per IP per 24 jam, bawaan `3` |
| `FAUCET_DAILY_CAP_ETH` | batas total per 24 jam, bawaan `0.05` |

Faucet hanya mengirim bila: token Privy sah, user itu dan alamat itu belum
pernah menerima, saldo alamat di bawah separuh jatah, dan batas IP serta
harian belum habis. Catatannya di `.runs/faucet-sepolia.json`, jadi tetap
berlaku setelah server dinyalakan ulang. Kalau faucet menolak, halaman Dompet
menjelaskan alasannya dan menautkan faucet Sepolia publik.

Keeper memeriksa kehamilan setiap blok dan menetaskan yang sudah siap. Tanpa
`OPERATOR_PRIVATE_KEY`, keeper mati dan layar Pembuahan menampilkan tombol
**Tetaskan** untuk ditandatangani pengguna sendiri.

### Daftar periksa login Privy

Setelah `PRIVY_APP_ID` dan `OPERATOR_PRIVATE_KEY` terisi, coba sekali dengan
browser privat (tanpa MetaMask):

1. Klik **Masuk** → pilih Google → selesai login, header menampilkan email.
2. Dalam beberapa detik muncul pesan "Kami mengirim 0.003 ETH…", dan **Dompet**
   menunjukkan saldonya.
3. Buka **Kawinkan**, pilih dua induk, klik **Kawinkan**. Tidak ada jendela
   konfirmasi wallet. Halaman pindah ke Pembuahan.
4. ±1 menit kemudian layar berubah menjadi **Lahir** tanpa menekan apa pun.
5. **Bawa pulang (.md)** → `bun run verify-agent <berkas>` menyatakan SAH.
6. Keluar lalu masuk lagi dengan akun yang sama: faucet tidak mengirim lagi,
   dan agent tadi tetap tercantum di Dompet.

### Di VPS, supaya orang lain bisa membuka

Yang dibutuhkan: VPS Linux 2 vCPU / 4 GB, domain, dan Docker (untuk sandbox
tempat agent bekerja).

```bash
# di VPS, sebagai user non-root bernama meiosis, anggota grup docker
git clone https://github.com/rhmatzeka/Meiosis /opt/meiosis && cd /opt/meiosis
bun run setup
bun run build:web                          # halaman diminifikasi & dipecah; ulangi setiap kali menarik kode baru
docker build -t meiosis-sandbox:1 -f sandbox/Dockerfile sandbox/
cp .env.example .env && chmod 600 .env    # isi GROQ_API_KEY, PRIVY_APP_ID, OPERATOR_PRIVATE_KEY, TRUST_PROXY=1
                                          # JANGAN taruh DEPLOYER_PRIVATE_KEY di sini

sudo cp deploy/meiosis.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now meiosis

sudo apt install caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile     # ganti domainnya dulu
sudo systemctl reload caddy
```

**Kunci deployer hanya di laptop.** Ia bisa menyegel generasi nol dan
mendaftarkan modul skill; VPS yang menjalankan kode buatan mesin tidak boleh
memegangnya (PLAN.md §12.1).

## 3. Yang dijaga di mode publik

Server yang terbuka ke internet memakai kuota model milik penyelenggara dan
menjalankan kode buatan mesin. Di Sepolia (atau `PUBLIC=1`), `/api/run`:

| Penjagaan | Kenapa |
|---|---|
| `workdir` ditolak | direktori host bukan milik pengunjung |
| paling banyak 3 agent dan 10 langkah per run | satu permintaan tidak boleh menghabiskan kuota harian |
| agent berharga sewa > 0 → dibayar dulu lewat `Market.rent` | harga = harga pasang pemilik, atau `RUN_PRICE_ETH` bila pemilik tidak memasang. Server memeriksa event `Rented` di chain: pasar, agent, jumlah; satu tx hanya untuk satu tugas |
| harga sewa 0 → jatah `RUN_LIMIT_PER_HOUR` per IP | tanpa bayaran, kuotanya dijatah. Set `TRUST_PROXY=1` di belakang Caddy |
| tanpa kunci model → run ditolak sebelum bayar | pengunjung tidak boleh membayar untuk run yang pasti gagal |

Bayaran sewa dipotong 2,5% untuk platform (menutup biaya server dan model),
sisanya ke pemilik agent — dan 5% ke pemilik induknya, 2,5% ke kakek-neneknya,
sampai empat generasi. Pemilik yang memakai agent-nya sendiri di server juga
membayar sewa, tapi sebagian besar kembali kepadanya sebagai royalti.

Kas platform (biaya Studio dan 2,5% pasar) ditarik pemilik kontrak dengan
`withdrawFees()` di `Studio` dan `Market`.

## 4. Membawa agent keluar

Setiap kartu agent punya tombol **Ekspor .md**. Berkasnya adalah subagent
Claude Code: taruh di `.claude/agents/` proyek mana pun dan agent itu bisa
dipanggil tanpa server Meiosis sama sekali.

Berkas itu memuat genome dan manifestHash. Siapa pun bisa membuktikan isinya
tidak diubah:

```bash
bun run verify-agent .claude/agents/meiosis-5-penjaga-form.md
```

Genome dibaca ulang dari chain, dirakit ulang, dan dibandingkan byte per byte
dengan prompt di berkas.
