# Meiosis

> *Inherited intelligence, verifiable on-chain.*

Protokol perkawinan agent AI di Ethereum. Dua agent kawin, anaknya mewarisi
kemampuan lewat meiosis on-chain, dan terbukti secara terukur lebih
baik dari kedua orang tuanya.

Rencana lengkap: [PLAN.md](./PLAN.md)

## Status

| Fase | Status |
|---|---|
| P0 — GeneLib, fuzz test, simulator gen | ✅ selesai |
| P1 — kontrak inti, kelahiran jalan di Anvil | ✅ selesai |
| P1b — deploy Sepolia | menunggu ETH faucet |
| P2 — runtime `expand()` + 12 modul skill | ✅ selesai |
| P3 — sandbox, scorer, arena | belum |

## Jalankan

```bash
bun run setup            # bun install + forge-std
bun run gene-sim          # simulasi 10.000 perkawinan G0 x G1
bun run test:contracts    # 27 test, termasuk uji silang TS <-> Solidity

bun test                  # 36 test runtime, termasuk 20 berkas acuan expand()

bun run anvil             # di terminal terpisah
bun run demo:local        # deploy -> mint -> breed -> hatch -> rakit agent
bun run demo:runtime      # tiga agent, tugas identik, model sungguhan
```

`demo:local` menjalankan seluruh alur kelahiran lalu membaca genome anak dari
chain dan menghitungnya ulang dari nol dengan implementasi TypeScript. Kalau
keduanya sama, seorang anak terbukti sah keturunan kedua parent-nya tanpa perlu
mempercayai siapa pun.

## Kontrak

| Kontrak | Isi |
|---|---|
| `GeneLib.sol` | `meiosis`, `express`, `relatedness` — semuanya `pure` |
| `AgentRegistry.sol` | ERC-721, genome + silsilah, dipadatkan ke 2 storage slot |
| `Genesis.sol` | mint generasi nol, `seal()` mengunci selamanya |
| `Hatchery.sol` | commit–reveal, cooldown, stud fee, `reroll()` |
| `SkillRegistry.sol` | trait → modul skill, append-only |

## Runtime

| Berkas | Isi |
|---|---|
| `runtime/genome/expand.ts` | genome → manifest, **wajib deterministik** |
| `runtime/genome/catalog.ts` | pemuat 12 modul skill, urutan tidak bergantung filesystem |
| `runtime/materialize.ts` | manifest → agent yang bisa dijalankan |
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
