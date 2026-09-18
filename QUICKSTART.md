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
dieksekusi langsung di mesinmu.

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

1. Tab **Kawinkan** → klik kartu `#1` dan `#2`
2. Lihat kekerabatan dan perbandingan trait-nya, lalu klik **Kawinkan**
3. Muncul kartu kehamilan dengan hitung mundur blok — klik **Majukan 6 blok**
4. Klik **Tetaskan**

Anak lahir di tab **Roster**. Perhatikan traitnya: ia hampir pasti mewarisi
`security instinct high` dari `#1`, dan sekitar separuh kemungkinan mewarisi
`aesthetic high` dari `#2`. Kalau tidak dapat, kawinkan lagi — tiap kelahiran
memakai seed berbeda.

Kamu tidak mengendalikan hasilnya. Yang kamu kendalikan adalah **memilih
induknya**.

## Pakai agentnya

Tab **Jalankan** → pilih anaknya → tulis tugas → **Jalankan**.

Mode agent aktif secara bawaan, artinya agent memakai tool sungguhan: ia
membaca berkas, menulis kode, menjalankan typecheck dan build, membaca galatnya,
lalu memperbaiki sendiri. Langkahnya terlihat satu per satu selagi berjalan.
Sekitar dua sampai tiga menit.

Di akhir muncul screenshot halaman yang ia bangun, berikut skor rubriknya.

## Pakai dari Claude Code

Jalankan Claude Code dari folder ini. `.mcp.json` sudah ada, jadi ia menemukan
servernya sendiri — periksa dengan `/mcp`.

Lalu ngobrol biasa:

> Lihat agent Meiosis yang ada, pilih yang paling cocok untuk bikin form React
> yang aman, suruh dia kerjakan.

Untuk repo-mu sendiri, sebutkan foldernya:

> Pakai agent Meiosis yang punya security-instinct-high untuk memperbaiki tes
> yang gagal di folder `demo-repo`. Perintah ceknya `bun test`.

Selengkapnya di [MCP.md](./MCP.md).

## Memastikan semuanya sehat

```bash
bun run verify     # genetika, kontrak, runtime, sandbox — tanpa kuota model
bun run e2e        # UI lewat browser sungguhan
```

## Batasnya sekarang

- **Hanya jalan di komputermu sendiri.** Chain-nya Anvil lokal; belum ter-deploy
  ke Sepolia, jadi orang lain tidak bisa melihat atau memakai agentmu.
- **Belum ada royalti.** Di rencana, agent yang bekerja menghasilkan uang dan
  sebagiannya mengalir ke pemilik induk. `LineageRoyalty.sol` belum ditulis, jadi
  untuk sekarang anakmu bekerja tanpa menghasilkan apa-apa bagi leluhurnya.
- **Tugas coding-nya terbatas pada proyek JavaScript/TypeScript**, karena
  pemeriksaan dijalankan di image sandbox yang berisi Bun dan Node.
