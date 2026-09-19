# Meiosis

> *Inherited intelligence, verifiable on-chain.*

Protokol perkawinan agent AI di Ethereum. Dua agent kawin, anaknya mewarisi
kemampuan lewat meiosis on-chain, dan terbukti secara terukur lebih
baik dari kedua orang tuanya.

**Mulai di sini: [QUICKSTART.md](./QUICKSTART.md)** — dari clone sampai agent bekerja.

Rencana lengkap: [PLAN.md](./PLAN.md) · Cara menguji: [TESTING.md](./TESTING.md) · Menambah agent: [ADDING-AGENTS.md](./ADDING-AGENTS.md) · Dari Claude Code: [MCP.md](./MCP.md) · Sepolia & hosting: [DEPLOY.md](./DEPLOY.md)

## Hasil perkawinan itu berbentuk apa?

Seekor agent adalah **NFT berisi genome 256-bit**. Genome itu dirakit —
deterministik, byte per byte — menjadi manifest (tier model, tool, parameter)
dan system prompt yang disusun dari modul skill warisannya.

Agent bisa dipakai dengan tiga cara:

1. **Di halaman Meiosis** — tab Jalankan: agent menulis kode, membangunnya di
   sandbox, memperbaiki sendiri, lalu diberi skor.
2. **Dari Claude Code lewat MCP** — lihat [MCP.md](./MCP.md).
3. **Dibawa pulang sebagai berkas `.md`** — tombol Ekspor mengunduh subagent
   Claude Code siap pakai. Taruh di `.claude/agents/` proyek mana pun. Berkasnya
   membawa genome dan manifestHash, jadi `bun run verify-agent <berkas>`
   membuktikan isinya tidak diubah dari yang tercatat di chain.

## Status

| Fase | Status |
|---|---|
| P0 — GeneLib, fuzz test, simulator gen | ✅ selesai |
| P1 — kontrak inti, kelahiran jalan di Anvil | ✅ selesai |
| P1b — deploy Sepolia | skrip siap (`bun run deploy:sepolia`), menunggu ETH faucet |
| P2 — runtime `expand()` + 12 modul skill | ✅ selesai |
| P3 — sandbox, scorer, judge, arena | sebagian: pipa jalan, hybrid vigor belum terbukti |
| P4 — web UI | ✅ roster, kawinkan, silsilah, arena, **connect wallet**, aksi pemilik, royalti, ekspor |
| Royalti leluhur | ✅ `LineageRoyalty.sol` — sewa dan tarif kawin mengalir sampai 4 generasi |
| P4 — orchestrator & indexer | belum |

## Jalankan

```bash
bun run start            # satu perintah: siapkan semuanya, lalu buka localhost:5173
bun run stop             # hentikan

bun run setup            # (manual) bun install + forge-std + openzeppelin + compile
bun run gene-sim          # simulasi 10.000 perkawinan G0 x G1
bun run test:contracts    # 38 test, termasuk uji silang TS <-> Solidity dan royalti

bun test                  # 39 test runtime, termasuk 20 berkas acuan expand()

bun run anvil             # di terminal terpisah
bun run ui                # http://localhost:5173 — deploy, kawinkan, jalankan, silsilah, arena
bun run demo:local        # deploy -> mint -> breed -> hatch -> rakit agent
bun run demo:runtime      # tiga agent, tugas identik, model sungguhan

bun run deploy:sepolia    # deploy ke Sepolia — lihat DEPLOY.md
bun run ui:sepolia        # UI tersambung ke Sepolia; pengunjung pakai wallet sendiri
bun run verify-agent f.md # buktikan berkas ekspor asli terhadap chain
```

Tanpa wallet di chain lokal, transaksi ditandatangani server dengan akun demo
Anvil. Dengan wallet — dan selalu di Sepolia — pengguna menandatangani sendiri;
server hanya menyusun calldata di `/api/tx` dan tidak pernah memegang kunci.

`demo:local` menjalankan seluruh alur kelahiran lalu membaca genome anak dari
chain dan menghitungnya ulang dari nol dengan implementasi TypeScript. Kalau
keduanya sama, seorang anak terbukti sah keturunan kedua parent-nya tanpa perlu
mempercayai siapa pun.

## Kontrak

| Kontrak | Isi |
|---|---|
| `GeneLib.sol` | `meiosis`, `express`, `relatedness` — semuanya `pure` |
| `AgentRegistry.sol` | ERC-721, genome + silsilah dalam 2 storage slot, nama pilihan pemilik |
| `Genesis.sol` | mint generasi nol, `seal()` mengunci selamanya |
| `Hatchery.sol` | commit–reveal, cooldown, stud fee lewat royalti, `reroll()` |
| `LineageRoyalty.sol` | bayar agent; 5% → induk, 2,5% → kakek-nenek, … sampai 4 generasi; pola tarik |
| `SkillRegistry.sol` | trait → modul skill, append-only; diisi otomatis saat deploy |

## Runtime

| Berkas | Isi |
|---|---|
| `runtime/genome/expand.ts` | genome → manifest, **wajib deterministik** |
| `runtime/genome/catalog.ts` | pemuat 12 modul skill, urutan tidak bergantung filesystem |
| `runtime/materialize.ts` | manifest → agent yang bisa dijalankan |
| `runtime/agent-loop.ts` | loop tool: tulis → periksa → perbaiki → ulangi |
| `runtime/tools/` | tool agent, aksesnya ditentukan genome |
| `mcp/server.ts` | MCP server: agent Meiosis dipakai dari Claude Code |
| `runtime/export.ts` | agent → subagent Claude Code `.md`, dan pembacanya untuk verifikasi |
| `runtime/providers/` | Groq & OpenRouter, token bucket RPM+TPM, retry 429 |

Manifest menyimpan **tier**, bukan nama model. Resolusi tier → model konkret
terjadi di `materialize()`, di luar bagian yang di-hash — sehingga berpindah
penyedia tidak pernah membatalkan `manifestHash` yang sudah tercatat on-chain.

Mengubah isi sebuah prompt akan membuat golden test merah. Itu disengaja:
`expand()` yang bergeser diam-diam adalah kegagalan paling mahal di proyek ini.

`gene-sim` juga menulis ulang `contracts/test/Vectors.sol`. Jalankan ia lebih
dulu setiap kali model genetik berubah, lalu jalankan test kontrak — kalau
keduanya menyimpang, test akan merah.

## Tata letak genome

```
genome : uint256 = 16 lokus x 16 bit
lokus  : [ alelX 8 bit | alelY 8 bit ]
alel   : [ dominance 2 bit | traitId 6 bit ]
```

Sumber kebenaran ada di dua tempat yang wajib identik:
`packages/shared/src/genome.ts` dan `contracts/src/GeneLib.sol`.
