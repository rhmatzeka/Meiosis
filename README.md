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
| P2 — runtime `expand()` + modul skill | belum |

## Jalankan

```bash
bun run setup            # bun install + forge-std
bun run gene-sim          # simulasi 10.000 perkawinan G0 x G1
bun run test:contracts    # 27 test, termasuk uji silang TS <-> Solidity

bun run anvil             # di terminal terpisah
bun run demo:local        # deploy -> mint -> breed -> hatch -> verifikasi
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
