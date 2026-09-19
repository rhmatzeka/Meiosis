# Memakai agent Meiosis dari Claude Code

Agent yang hidup di chain bisa dipanggil dari luar lewat MCP, termasuk sebagai
subagent di Claude Code. Tanpa ini agent hasil perkawinan hanya bisa dipakai
lewat satu kotak prompt di satu halaman web — dan itu bukan agent-to-agent.

## Menyalakan

Dua terminal, lalu Claude Code.

```bash
bun run anvil     # terminal 1
bun run ui        # terminal 2 — MCP server bicara ke sini
```

`.mcp.json` sudah ada di repo, jadi Claude Code yang dijalankan dari folder ini
akan menemukannya sendiri. Periksa dengan `/mcp` — harusnya muncul server
`meiosis` dengan lima tool.

## Lima tool

| Tool | Gunanya |
|---|---|
| `meiosis_list_agents` | Daftar agent di chain berikut trait warisan dan silsilahnya |
| `meiosis_ask` | Tanya satu agent, dapat jawaban teks. Sekali jalan, tanpa tool |
| `meiosis_run` | Suruh agent mengerjakan tugas coding sungguhan: menulis, build, perbaiki sendiri |
| `meiosis_breed` | Kawinkan dua agent dan tetaskan anaknya (chain lokal) |
| `meiosis_export` | Pasang agent sebagai subagent Claude Code di `.claude/agents/` sebuah proyek |

## Contoh percakapan

> Lihat agent Meiosis yang ada, lalu pilih yang paling cocok untuk bikin form
> React yang aman. Suruh dia kerjakan.

Claude akan memanggil `meiosis_list_agents`, membaca trait tiap agent, memilih
yang membawa `security-instinct-high` dan `stack-react`, lalu memanggil
`meiosis_run`. Yang kembali bukan teks saja, melainkan hasil yang sudah
di-typecheck, di-build, dirender, dan diberi skor.

> Tidak ada agent yang punya keamanan sekaligus estetika. Kawinkan #1 dan #2,
> lalu suruh anaknya yang kerjakan.

Claude memanggil `meiosis_breed`, menunggu kehamilan lima blok, menetaskan, lalu
memakai id anaknya untuk `meiosis_run`.

## Memakai agent di repo-mu sendiri

`meiosis_run` menerima `workdir` dan `check_command`. Dengan keduanya, agent
bekerja di direktori nyata milikmu, bukan di kerangka bawaan.

> Pakai agent Meiosis yang punya security-instinct-high untuk memperbaiki tes
> yang gagal di folder demo-repo. Perintah ceknya `bun test`.

Yang terjadi: agent membaca berkas di sana, menulis perbaikan langsung ke
direktori itu, menjalankan `bun test` **di dalam sandbox**, membaca hasilnya,
lalu memperbaiki lagi kalau masih gagal.

Contoh nyata yang sudah diuji — sebuah `applyFee` tanpa validasi dengan dua tes
gagal. Agent #1 membacanya, menulis ulang dengan dua kelas galat dan pemeriksaan
batas, lalu tesnya menjadi 3 lolos 0 gagal, terverifikasi ulang di luar sandbox.

### Yang dijaga

| | |
|---|---|
| Pengurungan jalur | Semua jalur diresolusi dan wajib tetap di dalam `workdir` |
| Berkas terlarang | `.env`, `.git/`, `node_modules/`, `.ssh/`, `*.pem`, `*.key` — tak terbaca, tak tertulis, tak terdaftar |
| Eksekusi | `check_command` berjalan di dalam container tanpa jaringan, bukan di host |

Kode buatan mesin tidak pernah dijalankan langsung di mesinmu. Yang berubah di
direktorimu hanyalah berkas yang ditulis agent.

## Agent memanggil agent

Selain dipanggil dari luar, agent Meiosis bisa saling memanggil. Tool
`consult_agent` tersedia di dalam loop, dan **aksesnya ditentukan genome**:
hanya agent dengan `MCP_SET_B` bukan `none` yang membawanya.

Artinya "bisa berkonsultasi" adalah sifat yang diwariskan, bukan setelan. Agent
yang tidak membawanya bekerja sendirian, dan itu konsekuensi genomenya — persis
seperti trait lain.

Yang ditanya dirakit dari genome-nya sendiri di chain, menjawab sekali, dan
tidak pernah menyentuh tempat kerja si penanya. Kedalaman delegasi dibatasi satu
tingkat supaya tidak ada agent yang saling memanggil tanpa henti.

## Kalau tool-nya tidak muncul

MCP server hanya jembatan tipis ke HTTP API di `:5173`. Kalau `bun run ui` mati,
semua tool akan gagal. Periksa dengan:

```bash
curl -s localhost:5173/api/status
```

Ganti alamatnya lewat `MEIOSIS_API` di `.mcp.json` kalau server UI berjalan di
tempat lain.
