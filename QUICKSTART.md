# Mulai dari nol

Dari `git clone` sampai agent hasil perkawinan mengerjakan tugas nyata.

## Yang perlu ada dulu

| | Cara pasang |
|---|---|
| **Bun** | `curl -fsSL https://bun.sh/install \| bash` |
| **Foundry** | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| **Docker** | `curl -fsSL https://get.docker.com \| sudo sh` — Engine saja, bukan Desktop |

Docker dipakai untuk menjalankan kode buatan agent secara terisolasi. Itu bukan
kenyamanan: kode yang ditulis mesin dan belum ditinjau siapa pun tidak boleh
dieksekusi langsung di mesinmu. Tanpa Docker, semuanya tetap menyala — roster,
perkawinan, silsilah, royalti, ekspor — kecuali tab **Jalankan**.

## Kunci model

Agent butuh model untuk berpikir. Yang gratis dan tanpa kartu kredit:

1. Buka [console.groq.com/keys](https://console.groq.com/keys), buat kunci
2. Isi `.env`:

```bash
cp .env.example .env
echo 'PROVIDER=groq'        >> .env
echo 'GROQ_API_KEY=gsk_...' >> .env
echo 'MOCK_LLM=0'           >> .env
```

## Nyalakan

```bash
bun run start
```

Satu perintah ini memeriksa prasyarat, memasang dependensi, membangun image
sandbox, menyalakan chain lokal, men-deploy kontrak, mencetak empat agent
generasi nol ke tiga pemilik berbeda, lalu menyegel generasi nol. Yang sudah
jalan akan dilewati, jadi aman dijalankan berulang.

Buka **http://localhost:5173**.

Berhenti dengan `bun run stop`.

## Kawinkan agent pertamamu

Kamu mulai dengan empat agent, masing-masing sengaja dibuat timpang:

| | Kuat | Lemah |
|---|---|---|
| **#1 Solidity Smith** | keamanan, disiplin tes | stack Solidity, estetika polos |
| **#2 Pixel Sense** | React, estetika | keamanan rendah, tanpa tes |
| **#3 Doc Weaver** | dokumentasi, riset | membawa keamanan tersembunyi |
| **#4 Ops Hound** | ketekunan, perkakas build | estetika polos |

Kalau kamu butuh **form React yang aman**, tidak ada satu pun yang cocok. `#2`
membuatnya cantik tapi tidak memvalidasi masukan. `#1` menulis Solidity untuk
tugas React.

Jadi kawinkan keduanya:

1. Di beranda, klik **Kawinkan mereka berdua** (atau buka **Kawinkan** dan pilih dua kartu)
2. Lihat tabel peluang: mana sifat yang pasti turun, mana yang 50%. Klik **Kawinkan**
3. Tunggu pembuahan, sekitar 12 detik di chain lokal. Tidak perlu menekan apa pun:
   server menetaskannya otomatis begitu blok pengungkapnya lewat
4. Layar **Lahir** menunjukkan pita genome anak, diwarnai asal tiap gennya
   (teal dari induk pertama, pink dari induk kedua, emas bila bermutasi)

Perhatikan sifatnya: ia hampir pasti mewarisi keamanan tinggi dari `#1`, dan
sekitar separuh kemungkinan mewarisi estetika tinggi dari `#2`. Kalau tidak
dapat, klik **Kawinkan lagi**, karena tiap kelahiran memakai seed berbeda.
Halaman kehamilan (`/kawin/<nomor>`) aman di-refresh dan dibagikan.

Kamu tidak mengendalikan hasilnya. Yang kamu kendalikan adalah **memilih
induknya**.

## Buat, jual, dan sewakan

- **Studio** (`/studio`): rancang agent dari nol. Ceritakan agent-nya dengan kata-katamu (bisa dirancang AI), tulis instruksinya sendiri, dan atur semua sifatnya dengan bebas. Biayanya kecil dan masuk ke platform.
- **Pasar** (`/pasar`): semua agent beserta harganya. Tab *Dijual*, *Bisa disewa*, *Bisa dikawinkan*.
- Di halaman agent milikmu: **Jual** (pertama kali meminta izin untuk Pasar), **Harga sewa**, **Buka untuk kawin**.
- Penghasilan dari penjualan, sewa, dan bagian leluhur terkumpul di **Dompet**.

Panduan untuk orang awam ada di aplikasinya sendiri: `/panduan`.

## Pakai agentnya

Di layar Lahir klik **Beri tugas** (atau menu **Beri tugas**) → tulis tugas → **Jalankan**.

Dengan Docker terpasang, **Kerja penuh** aktif secara bawaan, artinya agent memakai tool sungguhan: ia
membaca berkas, menulis kode, menjalankan typecheck dan build, membaca galatnya,
lalu memperbaiki sendiri. Langkahnya terlihat satu per satu selagi berjalan.
Sekitar dua sampai tiga menit.

Di akhir muncul screenshot halaman yang ia bangun, berikut skor rubriknya.

## Bawa pulang agentnya

Layar Lahir dan halaman tiap agent punya tombol **Bawa pulang (.md)**. Hasilnya subagent Claude Code:

```bash
mkdir -p .claude/agents && mv ~/Downloads/meiosis-5-*.md .claude/agents/
bun run verify-agent .claude/agents/meiosis-5-*.md   # buktikan asli terhadap chain
```

Setelah itu agent bisa dipanggil di proyek mana pun, tanpa server Meiosis.

## Jadi pemilik

Klik **Masuk** di kanan atas. Dengan `PRIVY_APP_ID` terisi (lihat
[DEPLOY.md](./DEPLOY.md#login-privy)), orang bisa masuk dengan email, Google,
atau wallet yang sudah punya; yang belum punya wallet dibuatkan otomatis dan
diberi sedikit ETH untuk biaya jaringan. Tanpa `PRIVY_APP_ID`, tombol itu
memakai wallet browser (MetaMask) langsung.

Anak yang kamu kawinkan jadi milikmu. Di halaman agent-nya ada bagian **Milikmu**:

- **Beri nama**: tersimpan on-chain
- **Buka untuk kawin**: pasang tarif; siapa pun bisa mengawinkan agent-mu dengan membayarnya
- **Tarik royalti** di **Dompet**: bayaran untuk agent-mu *dan* untuk keturunannya

Setiap bayaran ke sebuah agent, 5% mengalir ke pemilik induknya, 2,5% ke
kakek-neneknya, sampai empat generasi. Memilih induk yang baik adalah investasi.

Tanpa wallet di chain lokal, semua tombol tetap jalan memakai akun demo.

## Pakai dari Claude Code

Jalankan Claude Code dari folder ini. `.mcp.json` sudah ada, jadi ia menemukan
servernya sendiri — periksa dengan `/mcp`.

Lalu ngobrol biasa:

> Lihat agent Meiosis yang ada, pilih yang paling cocok untuk bikin form React
> yang aman, suruh dia kerjakan.

Untuk repo-mu sendiri, sebutkan foldernya:

> Pakai agent Meiosis yang punya security-instinct-high untuk memperbaiki tes
> yang gagal di folder `demo-repo`. Perintah ceknya `bun test`.

> Pasang agent Meiosis #5 sebagai subagent di proyek ini.

Selengkapnya di [MCP.md](./MCP.md).

## Memastikan semuanya sehat

```bash
bun run verify     # genetika, kontrak, runtime, sandbox — tanpa kuota model
bun run e2e        # UI lewat browser sungguhan
```

## Batasnya sekarang

- **Sepolia belum ter-deploy.** Skripnya siap (`bun run deploy:sepolia`, lihat
  [DEPLOY.md](./DEPLOY.md)); yang ditunggu ETH faucet untuk gas deploy.
- **Belum di-host.** File systemd dan Caddy ada di `deploy/`; butuh VPS dan domain.
- **Tugas coding-nya terbatas pada proyek JavaScript/TypeScript**, karena
  pemeriksaan dijalankan di image sandbox yang berisi Bun dan Node.
