# Agent terlindungi & Claude Code berbayar (bagian B)

Tanggal: 2026-10-01 · Status: disetujui (percakapan) · Prasyarat: bagian A (marketplace)

## 1. Masalah

Repo Meiosis publik, termasuk teks prompt 12 modul skill, dan genome setiap
agent publik di chain. Siapa pun bisa merakit `.md` agent mana pun tanpa
membayar. Mengunci tombol unduh tidak berguna, dan berkas teks yang sudah di
tangan orang tidak bisa dicegah untuk disalin.

## 2. Keputusan

1. **Teks prompt jadi rahasia server.** Yang publik hanya metadata modul dan
   `contentHash`-nya (yang memang sudah tercatat di `SkillRegistry` dan masuk
   ke `manifestHash`). Prompt ditulis ulang (v2) dan tidak pernah di-commit.
2. **Pakai = bayar per tugas**, di web (bagian A) dan di Claude Code (bagian ini).
3. **`.md` untuk umum = "remote"**: tidak memuat prompt, hanya instruksi agar
   Claude Code mengirim tugas ke Meiosis lewat MCP. Tanpa API key dan saldo
   milik sendiri, berkas itu tidak berguna.
4. **Pemilik NFT (termasuk pembeli) boleh mengunduh `.md` lengkap**, setelah
   membuktikan kepemilikan dengan tanda tangan wallet. Berkasnya diberi
   **watermark lisensi** (terlihat di header + tak terlihat di isi), sehingga
   kebocoran bisa dilacak ke pemegangnya. Watermark tidak mencegah penyalinan.

Batas yang diakui terus terang: pemakaian di Claude Code bergantung pada server
Meiosis yang menyala; bukti isi prompt berubah dari "baca sendiri" menjadi
"cocokkan hash".

## 3. Prompt privat

```
runtime/skills/<nama>/module.json   publik: locus, traitId, name, version, mcpTools, modelTier, contentHash
private/skills/<nama>/prompt.md     privat (di-.gitignore)
```

- `catalog.ts`: `contentHash` diambil dari `module.json`. Bila prompt privat
  tersedia, hash dihitung ulang dari `module.json` tanpa field `contentHash` +
  prompt, dan **harus sama**; beda = galat (prompt disunting tanpa hash baru).
  Tanpa prompt privat, `prompt = ""` dan `hasPrompt = false`.
- `systemPrompt()` melempar galat bila modul yang dibutuhkan tidak punya prompt
  (server tidak boleh diam-diam menjalankan agent tanpa kepribadiannya).
- `bun run skills:hash` menulis ulang `contentHash` dari prompt privat.
- Golden test manifest tetap jalan tanpa prompt privat; tes yang butuh teks
  prompt dilewati dengan pesan jelas bila prompt privat tidak ada.
- Prompt v2 ditulis ulang untuk ke-12 modul: lebih konkret, dengan contoh
  perilaku, daftar periksa sebelum selesai, dan anti-pola.

## 4. Saldo pakai: `Credits.sol`

```solidity
function deposit() external payable;
function withdraw(uint256 amount) external;                // pemilik saldo, kapan saja
function spend(address user, uint64 agentId, uint256 amount, bytes32 job) external; // hanya operator
mapping(address => uint256) public balanceOf;
mapping(bytes32 => bool) public usedJob;
uint256 public defaultPrice;   // harga bila pemilik agent tidak memasang harga sewa
address public operator;       // diatur pemilik kontrak
```

`spend`: `amount ≤ max(market.rentPrice(agentId), defaultPrice)` dan `> 0`,
`job` belum pernah dipakai, saldo cukup → saldo dikurangi →
`market.rent{value: amount}(agentId, job)` (biaya platform & royalti leluhur
sama persis dengan sewa di web) → emit `Spent(user, agentId, amount, job)`.
Operator tidak bisa menarik lebih dari harga satu tugas per job, dan setiap
potongan publik di chain.

## 5. API key

- Dibuat dari web: wallet menandatangani pesan
  `Meiosis: buat API key untuk <alamat> pada <waktu ISO>` (berlaku 10 menit).
  Server memverifikasi (`verifyMessage`), membuat `mk_<32 byte acak>`,
  menyimpan **hash SHA-256**-nya saja di `.runs/api-keys.json` bersama alamat,
  label, dan waktu. Kunci ditampilkan sekali.
- `GET /api/keys?address=` → daftar awalan kunci (tidak rahasia).
- `POST /api/keys/revoke` dengan tanda tangan yang sama bentuknya.
- Di chain lokal, akun demo dilayani tanpa tanda tangan (server memegang kuncinya).

## 6. MCP online: `POST /mcp`

JSON-RPC MCP (Streamable HTTP, balasan JSON biasa), header
`Authorization: Bearer mk_...`. Tool:

| Tool | Biaya | Isi |
|---|---|---|
| `meiosis_list_agents` | gratis | agent, sifat menonjol, harga per tugas |
| `meiosis_balance` | gratis | saldo pakai & harga |
| `meiosis_run {agent_id, task, context?}` | harga sewa agent | server menjalankan agent (mode jawaban; mode kerja penuh bila Docker ada), lalu memotong saldo lewat `Credits.spend`. Saldo diperiksa sebelum jalan; dipotong hanya bila berhasil |

Batas: 20 tugas per kunci per jam, konteks paling besar 60 KB.

Pemasangan di Claude Code:

```bash
claude mcp add --transport http meiosis https://<domain>/mcp --header "Authorization: Bearer mk_..."
```

## 7. Berkas `.md`

**Remote (umum)** — `GET /api/agents/:id/agent.md`:
frontmatter `name: meiosis-<id>-<slug>`, deskripsi sifat, `tools: mcp__meiosis__meiosis_run, Read, Write, Edit, Glob, Grep`,
`model: haiku`. Isinya: aturan perantara (kumpulkan konteks → panggil
`meiosis_run` dengan `agent_id` → tulis berkas hasil → laporkan; jangan
mengerjakan sendiri), dan petunjuk pemasangan MCP di komentar.

**Lengkap (pemilik)** — `POST /api/agents/:id/agent.md` dengan
`{address, message, signature}` (pesan `Meiosis: unduh agent #<id> untuk <alamat> pada <waktu>`),
hanya bila `ownerOf(id) == address`. Header provenance ditambah
`licenseId`, `licensee`, `issuedAt`, `licenseSig` (tanda tangan operator atas
`agentId|licensee|licenseId|manifestHash`). `licenseId` juga disisipkan tak
terlihat (karakter zero-width) di setiap bagian prompt. Lisensi dicatat di
`.runs/licenses.json`. `bun run trace-leak <berkas>` membaca watermark dan
menyebut pemegang lisensinya.

`verify-agent`: genome, manifestHash, dan tanda tangan lisensi diperiksa;
isi prompt dicocokkan hanya bila prompt privat tersedia.

## 8. Tampilan

- **Halaman agent**: tombol "Pakai di Claude Code" (unduh `.md` remote + langkah
  singkat); pemilik: "Unduh .md lengkap" (tanda tangan wallet).
- **Dompet**: kartu "Saldo pakai" (isi, tarik), kartu "API key" (buat, salin
  perintah `claude mcp add`, cabut).
- **Panduan**: bagian Claude Code ditulis ulang untuk alur ini.

## 9. Pengujian

- Foundry `Credits`: deposit/withdraw, spend hanya operator, batas harga,
  job ganda ditolak, saldo kurang ditolak, royalti & biaya platform mengalir.
- `bun test`: katalog (hash cocok/beda/tanpa prompt), watermark (sisip & baca,
  tahan dipotong header), API key (buat/verifikasi/cabut, tanda tangan basi
  ditolak), `.md` remote tidak memuat teks prompt apa pun.
- e2e: buat API key di Dompet → isi saldo → panggil `/mcp` `meiosis_run`
  (mode tiruan) → saldo berkurang sebesar harga → royalti pemilik naik;
  unduh `.md` remote (tanpa prompt) dan `.md` lengkap sebagai pemilik
  (ber-watermark, `trace-leak` menemukan pemegangnya).

## 10. Di luar cakupan

DRM sungguhan (tidak mungkin untuk teks), enkripsi di sisi Claude Code,
langganan bulanan.
