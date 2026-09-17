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
| P1 — kontrak inti, deploy Sepolia | belum |

## Jalankan

```bash
bun run setup            # bun install + forge-std
bun run gene-sim          # simulasi 10.000 perkawinan G0 x G1
bun run test:contracts    # 9 test, termasuk uji silang TS <-> Solidity
```

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
