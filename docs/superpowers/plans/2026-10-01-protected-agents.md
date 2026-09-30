# Agent terlindungi & Claude Code berbayar (bagian B): rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prompt tidak pernah keluar dari server; orang memakai agent (web atau Claude Code) dengan membayar per tugas; pemilik mendapat `.md` lengkap ber-watermark.
**Architecture:** Prompt privat di `private/skills` (hash publik di `module.json`); `Credits.sol` memotong saldo lewat `Market.rent`; server menambah API key, `/mcp` (JSON-RPC HTTP), `.md` remote, `.md` lengkap bertanda tangan + watermark zero-width.
**Tech Stack:** Solidity/Foundry, Bun, viem (`verifyMessage`, `signMessage`), React.
**Spec:** `docs/superpowers/specs/2026-10-01-protected-agents-design.md`

## Global Constraints

- Teks prompt tidak boleh masuk git; `private/` di `.gitignore`.
- `.md` remote tidak boleh memuat satu kalimat pun dari prompt modul.
- Operator hanya bisa memotong ≤ harga satu tugas per job, job tidak boleh dipakai dua kali.
- Pesan tanda tangan berlaku 10 menit.
- Commit tanpa atribusi AI.

## Review Focus

1. Tanda tangan lama dipakai ulang untuk membuat API key → ditolak setelah 10 menit & pesan harus menyebut alamat yang sama → unit test.
2. Watermark hilang bila header provenance dibuang → watermark zero-width tetap terbaca → unit test.
3. Saldo tidak cukup → `meiosis_run` menolak sebelum menjalankan model → e2e.
4. Prompt privat tidak ada di server → server menolak menjalankan agent dengan pesan jelas, bukan menjalankan tanpa kepribadian → unit test catalog.
5. Pembeli agent (pemilik baru) bisa mengunduh `.md` lengkap, pemilik lama tidak lagi → e2e.

### Task 1: Prompt privat + prompt v2
Files: `runtime/genome/catalog.ts` (+ test), `runtime/skills/*/module.json`, `private/skills/*/prompt.md` (tidak di-commit), `scripts/skills-hash.ts`, `.gitignore`, `runtime/genome/golden.json`.
- [ ] Test catalog: hash cocok → prompt dimuat; hash beda → galat; tanpa prompt → `hasPrompt=false`, `systemPrompt` melempar.
- [ ] Pindahkan & tulis ulang 12 prompt, `skills:hash`, `gen-golden`, semua tes hijau.

### Task 2: `Credits.sol`
Files: `contracts/src/Credits.sol`, `contracts/test/Credits.t.sol`, `server/deploy.ts`.
- [ ] Test: deposit/withdraw; spend hanya operator; batas harga; job ganda; saldo kurang; royalti & biaya mengalir.
- [ ] Implementasi, deploy, commit.

### Task 3: Server — kunci, watermark, `.md`, MCP
Files: `server/keys.ts` (+test), `server/watermark.ts` (+test), `runtime/export.ts` (+test), `server/mcp-http.ts`, `server/api.ts`.
- [ ] Unit test lalu implementasi; `curl` `/mcp` tools/list, balance, run (tiruan).

### Task 4: Web
Files: `web/src/hooks/use-actor.tsx` (`sign`), `web/src/pages/wallet.tsx`, `web/src/pages/agent.tsx`, `web/src/pages/guide.tsx`, `web/src/components/claude.tsx`.
- [ ] Dompet: saldo pakai + API key; agent: Pakai di Claude Code / Unduh .md lengkap; Panduan.

### Task 5: Skrip, e2e, dokumentasi
Files: `scripts/verify-agent.ts`, `scripts/trace-leak.ts`, `e2e/protect.spec.ts`, `scripts/e2e.ts`, `MCP.md`, `DEPLOY.md`, `README.md`.
- [ ] e2e: API key → deposit → `/mcp` run → saldo turun & royalti naik; `.md` remote tanpa prompt; `.md` lengkap pemilik → `trace-leak` menemukan pemegang.
- [ ] Semua tes hijau, commit.
