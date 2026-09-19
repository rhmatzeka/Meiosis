# Deploy ke Sepolia dan membuka Meiosis untuk umum

Di chain lokal, server memegang akun demo dan menandatangani semuanya sendiri.
Di Sepolia tidak begitu: **server tidak memegang kunci siapa pun.** Setiap
pengunjung menghubungkan wallet-nya sendiri, mengawinkan agent dengan wallet
itu, dan anaknya jadi miliknya.

```
browser ──(1) minta tx──▶ server /api/tx ──▶ calldata + stud fee + manifestHash
   │
   └──(2) tanda tangan di MetaMask ──▶ Sepolia ◀── server hanya membaca
```

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

Buka halamannya, klik **Hubungkan wallet**. MetaMask akan diminta pindah ke
jaringan Sepolia.

### Di VPS, supaya orang lain bisa membuka

Yang dibutuhkan: VPS Linux 2 vCPU / 4 GB, domain, dan Docker (untuk sandbox
tempat agent bekerja).

```bash
# di VPS, sebagai user non-root bernama meiosis, anggota grup docker
git clone https://github.com/rhmatzeka/Meiosis /opt/meiosis && cd /opt/meiosis
bun run setup
docker build -t meiosis-sandbox:1 -f sandbox/Dockerfile sandbox/
cp .env.example .env && chmod 600 .env    # isi GROQ_API_KEY; JANGAN taruh DEPLOYER_PRIVATE_KEY di sini

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
| `RUN_PRICE_ETH` > 0 → setiap agent dibayar dulu | tx pembayaran ke `LineageRoyalty` diperiksa di chain: penerima, agent, dan jumlahnya; satu tx hanya untuk satu run |
| `RUN_PRICE_ETH` = 0 → jatah `RUN_LIMIT_PER_HOUR` per IP | tanpa bayaran, kuotanya dijatah. Set `TRUST_PROXY=1` di belakang Caddy |
| tanpa kunci model → run ditolak sebelum bayar | pengunjung tidak boleh membayar untuk run yang pasti gagal |

Bayaran run masuk ke pemilik agent — dan 5% ke pemilik induknya, 2,5% ke
kakek-neneknya, sampai empat generasi. Penyelenggara server tidak mengambil
bagian; yang ia jaga hanya kuota modelnya.

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
