# Marketplace agent (bagian A): rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Studio (buat agent), jual-beli, dan sewa berbayar, lengkap dengan halaman Pasar, Studio, dan Panduan.
**Architecture:** Dua kontrak baru (`Studio`, `Market`) di atas registry & royalti yang sudah ada; server menyusun calldata dan memverifikasi pembayaran sewa; web menambah tiga halaman dan aksi di halaman agent.
**Tech Stack:** Solidity 0.8.24 + Foundry + OpenZeppelin, Bun, viem, React.
**Spec:** `docs/superpowers/specs/2026-10-01-marketplace-design.md`

## Global Constraints

- Tidak mengubah kontrak lama (`AgentRegistry`, `Hatchery`, `LineageRoyalty`, `Genesis`, `SkillRegistry`).
- Biaya platform pasar & sewa 250 bps; `STUDIO_FEE_ETH` bawaan 0.002.
- Gen Studio: homozigot, dominansi 1, otak ≤ seimbang, ≤2 bakat dari {4,5,6,14}.
- Bahasa UI Indonesia sehari-hari; token warna & komponen yang sudah ada.
- Commit tanpa atribusi AI.

## Review Focus

1. Listing basi setelah agent berpindah tangan lewat jalur lain (transfer, dijual di tempat lain): `buy` harus menolak → Foundry `test_BuyRejectsStaleListing`.
2. Pembayaran sewa dipakai ulang untuk dua tugas → server menolak job/tx yang sama → unit test `checkRent` dengan tx yang sama dua kali.
3. Genome TS dan Solidity berbeda diam-diam → vektor bersama di kedua test suite.
4. Penjual lupa memberi izin ke Pasar → UI menjalankan langkah izin dulu, kontrak menolak `NotApproved` → Foundry + e2e.
5. Pembeli membayar lebih → kelebihan dikembalikan → Foundry.

### Task 1: `studioGenome` di TypeScript
Files: `packages/shared/src/studio.ts`, `packages/shared/src/studio.test.ts` (dijalankan oleh `bun run test`), ekspor di `index.ts`.
- [ ] Test: desain sah → genome deterministik; lokus per tabel spec; validasi menolak tier 2, bakat kembar, bakat di luar {4,5,6,14,255}; vektor tiga desain dicetak untuk dipakai Solidity.
- [ ] Implementasi, lulus, commit.

### Task 2: `Studio.sol`
Files: `contracts/src/Studio.sol`, `contracts/test/Studio.t.sol`.
- [ ] Test Foundry (vektor dari Task 1, validasi, biaya, refund, nama, manifest, pemilik, `designed`).
- [ ] Implementasi, lulus, commit.

### Task 3: `Market.sol`
Files: `contracts/src/Market.sol`, `contracts/test/Market.t.sol`.
- [ ] Test Foundry (list/approve, buy split & transfer & refund, stale, own, cancel, rentPrice, rent split, fees withdraw).
- [ ] Implementasi, lulus, commit.

### Task 4: Deploy & server
Files: `server/deploy.ts`, `server/chain.ts` (Deployment), `server/api.ts`, `server/rent.ts` (+ test), `.env.example`.
- [ ] `checkRent` murni diuji (tx dipakai ulang, jumlah kurang, agent salah).
- [ ] Deploy Studio/Market; field agent baru; aksi tx baru; preview; run membayar lewat `Rented`.
- [ ] Deploy ulang Anvil, `curl` semua endpoint baru, commit.

### Task 5: Web
Files: `web/src/pages/{market,studio,guide}.tsx`, `web/src/components/{agent,dialogs}.tsx`, `web/src/pages/{agent,run,wallet,home}.tsx`, `web/src/app.tsx`, `web/src/lib/errors.ts` (+ test), CSS.
- [ ] `humanError` untuk galat baru (test dulu).
- [ ] Pasar, Studio, Panduan, aksi jual/beli/sewa, navigasi baru, beranda tiga pintu.
- [ ] Pemeriksaan visual 1440 & 375, commit.

### Task 6: e2e & dokumentasi
Files: `e2e/market.spec.ts`, `scripts/e2e.ts`, `README.md`, `QUICKSTART.md`, `DEPLOY.md`.
- [ ] e2e: Studio → jual → beli oleh akun lain → royalti; sewa berbayar di Beri tugas.
- [ ] Semua tes (forge, bun, e2e) hijau, commit.
