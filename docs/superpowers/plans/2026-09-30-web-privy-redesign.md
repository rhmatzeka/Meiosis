# Web Meiosis (Privy + alur terpandu + tampilan baru): rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti `web/` vanilla dengan aplikasi React yang terpandu, berlogin Privy, dan bergaya bioluminesen, plus dukungan server (faucet, keeper penetasan, receipt, cooldown), sehingga orang baru bisa mengawinkan agent dengan satu tekan tombol.

**Architecture:** `Bun.serve` menyajikan `web/index.html` lewat HTML import (Bun membundel TSX/CSS), dengan SPA fallback. Logika genetika untuk UI ditulis murni di `web/src/lib/` dan diuji dengan `bun test`. Satu hook `useActor()` menyembunyikan perbedaan Privy / wallet injected / akun demo. Server menambah faucet ber-JWT Privy, keeper yang menetaskan otomatis, dan endpoint receipt.

**Tech Stack:** Bun 1.4, React 19, TypeScript, `@privy-io/react-auth` 3.46, viem 2, `jose`, `@fontsource/*`, playwright-core untuk e2e.

**Spec:** `docs/superpowers/specs/2026-09-30-web-privy-redesign-design.md`

## Global Constraints

- Bahasa UI: Indonesia santai-sopan, tanpa istilah teknis di jalur utama (hex, lokus, commit–reveal, blok).
- Tema: gelap saja, token warna persis seperti tabel §4 spec.
- Huruf: Space Grotesk (judul), Inter (teks), JetBrains Mono (angka/alamat), dibundel lewat `@fontsource`.
- `bun run start` wajib tetap jalan tanpa `PRIVY_APP_ID` (mode demo Anvil).
- Tidak ada perubahan kontrak Solidity.
- Faucet: `FAUCET_AMOUNT_ETH` bawaan `0.003`, `FAUCET_PER_IP_DAY` bawaan `3`, `FAUCET_DAILY_CAP_ETH` bawaan `0.05`; satu kali per user Privy dan per alamat.
- Konfigurasi Privy: `loginMethods: ["email","google","wallet"]`, `createOnLogin: "users-without-wallets"`, `showWalletUIs: false`.
- Layar 375 px harus bisa dipakai tanpa scroll horizontal; `prefers-reduced-motion` mematikan animasi.
- Commit tanpa atribusi AI (aturan pemilik repo).

## Review Focus

1. **Refresh di tengah kehamilan** (`/kawin/:pid`): halaman harus melanjutkan hitung mundur lalu berubah jadi layar Lahir, bukan kosong → diuji di e2e (reload sebelum menetas).
2. **Induk sedang cooldown**: harus terlihat "istirahat ±N menit" dan tombol Kawinkan nonaktif *sebelum* ditekan → unit test `cooldownLabel` + dicek di e2e.
3. **Faucet menolak** (batas IP/harian/sudah pernah): UI menampilkan alasan + alamat untuk diisi manual, tidak diam → unit test `faucetDecision` untuk tiap alasan.
4. **Chain mati / kontrak belum deploy**: banner jelas, halaman tidak crash → e2e membuka `/` dengan status `chainLive:false` (mock fetch).
5. **Induk sama dipilih dua kali / agent orang lain yang tertutup untuk kawin**: tidak bisa dipilih, ada keterangan → unit test `canPickParent`.

---

### Task 1: Logika genetika & kamus trait untuk UI

**Files:**
- Create: `web/src/lib/traits.ts`, `web/src/lib/genetics.ts`
- Test: `web/src/lib/genetics.test.ts`, `web/src/lib/traits.test.ts`
- Modify: `package.json` (`"test": "bun test runtime/ web/ server/"`)

**Interfaces:**
- Produces:
  - `LOCI: { index, key, label, icon, values: string[], matters: boolean, describe(v) }[]`
  - `traitLabel(locus: number, traitId: number): string`
  - `inheritanceOdds(a: bigint, b: bigint): { locus: number; odds: { trait: number; p: number }[] }[]`
  - `geneOrigin(child: bigint, a: bigint, b: bigint): { locus: number; trait: number; from: "a" | "b"; mutated: boolean }[]`
  - `canPickParent(agent, picked: number[], me?: string): { ok: boolean; reason?: string }`
  - `cooldownLabel(readyAtBlock: number, block: number, secPerBlock: number): string | null`

- [ ] Step 1: tulis test: peluang tiap lokus berjumlah 1; lokus homozigot dominan (#1 L6 security high) → `p=1`; lokus estetika #1×#2 → high 0.5; `geneOrigin(meiosis(a,b,seed),a,b)` cocok dengan alel yang diambil `meiosis` untuk 50 seed acak, `mutated` hanya true bila trait tidak ada di alel induk; semua lokus 0-15 dan semua trait punya label; `canPickParent` menolak duplikat dan agent tertutup milik orang lain.
- [ ] Step 2: `bun test web/` → gagal (modul belum ada).
- [ ] Step 3: implementasi.
- [ ] Step 4: `bun test web/` → lulus.
- [ ] Step 5: commit "Genetika untuk UI: peluang warisan dan asal gen".

### Task 2: Server: faucet, receipt, status, cooldown, kehamilan

**Files:**
- Create: `server/faucet.ts` (fungsi murni `faucetDecision` + penyimpanan `.runs/faucet.json` + verifikasi JWT `jose`)
- Test: `server/faucet.test.ts`
- Modify: `server/api.ts` (rute `/api/faucet`, `/api/receipt/:hash`, field status/agents/pregnancies), `server/chain.ts` (`operatorWallet()`), `.env.example`

**Interfaces:**
- Produces: `faucetDecision(state: FaucetState, req: { userId, address, ip, balanceWei, now }, cfg): { ok: true } | { ok: false; reason: "sudah" | "alamat" | "ip" | "harian" | "saldo-cukup" }`
- Produces (HTTP): `GET /api/status` + `{ privyAppId, faucet: { enabled, amountEth }, keeper, docker, secPerBlock }`; `GET /api/agents` item + `{ readyAtBlock, cooldownBlocks }`; `GET /api/pregnancies` item + `{ to, childId }`; `GET /api/receipt/:hash` → `{ status }`; `POST /api/faucet` → `{ ok, hash?, reason?, message? }`.

- [ ] Step 1: test `faucetDecision` untuk setiap alasan dan jalur sukses.
- [ ] Step 2: `bun test server/` → gagal.
- [ ] Step 3: implementasi `server/faucet.ts`, lalu rute di `api.ts`.
- [ ] Step 4: `bun test server/` lulus; `curl /api/status`, `curl /api/receipt/<hash>` di Anvil menjawab benar; `POST /api/faucet` lokal mengirim ETH ke alamat baru dan menolak permintaan kedua.
- [ ] Step 5: commit.

### Task 3: Keeper penetasan & cooldown saat deploy

**Files:**
- Create: `server/keeper.ts` (`startKeeper({ pub, signer, dep, onHatch })`)
- Modify: `server/api.ts` (jalankan keeper), `server/deploy.ts` / `scripts/deploy.ts` (`BASE_COOLDOWN_BLOCKS` → `setBaseCooldown`)

- [ ] Step 1: jalankan: kawinkan lewat `/api/local-act` → dalam ±15 dtk `/api/pregnancies` menunjukkan `hatched: true` dan `childId` tanpa memanggil `/api/hatch`.
- [ ] Step 2: keeper mencatat manifest anak bila pemiliknya akun demo (lokal) — sama dengan `/api/hatch` lama.
- [ ] Step 3: commit.

### Task 4: Kerangka frontend

**Files:**
- Create: `web/index.html`, `web/src/main.tsx`, `web/src/app.tsx`, `web/src/router.ts`, `web/src/api.ts`, `web/src/hooks/use-status.ts`, `web/src/hooks/use-agents.ts`, `web/src/styles/{tokens,base,components}.css`, `web/src/components/{toast,button,banner,network-badge}.tsx`, `tsconfig.json` (jsx)
- Modify: `server/api.ts` (HTML import + SPA fallback, hapus penyajian `web/*.js`), `package.json` (react, react-dom, @privy-io/react-auth, jose, @fontsource/*)
- Delete: `web/app.js`, `web/style.css` (isi lama dipindah ke komponen)

- [ ] Step 1: `bun add` dependensi.
- [ ] Step 2: shell aplikasi: header (logo, nav Kawinkan/Koleksi/Silsilah/Tugas/Arena, badge jaringan, tombol Masuk), banner status chain, router, toast.
- [ ] Step 3: `bun run ui` → `/`, `/koleksi`, `/agent/1` semua menyajikan aplikasi (SPA fallback), tidak ada galat konsol.
- [ ] Step 4: commit.

### Task 5: `useActor()` + Privy + faucet otomatis

**Files:**
- Create: `web/src/hooks/use-actor.tsx` (context provider), `web/src/components/account-menu.tsx`, `web/src/lib/errors.ts` (+ `errors.test.ts`)
- Modify: `web/src/main.tsx` (PrivyProvider bila `privyAppId`)

**Interfaces:**
- Produces: `useActor(): { mode: "privy"|"injected"|"demo"|"none"; address?: string; ready: boolean; login(): void; logout(): void; act(action: string, args?: object): Promise<{ hash: string } | null>; busy: string | null }`
- Produces: `humanError(e: unknown, ctx: { names: Record<number,string>; block: number; secPerBlock: number }): { message: string; quiet: boolean }`

- [ ] Step 1: test `humanError` untuk `OnCooldown`, `NotListedForStud`, `InsufficientFee`, kode 4001.
- [ ] Step 2: implementasi; setelah login Privy dan wallet siap, panggil `/api/faucet` sekali (token dari `getAccessToken()`), tampilkan toast hasilnya.
- [ ] Step 3: tanpa App ID di lokal → mode `demo`, tombol Masuk menampilkan "Akun demo (Alice)".
- [ ] Step 4: commit.

### Task 6: Komponen visual inti

**Files:**
- Create: `web/src/components/{cell,genome-strip,agent-card,trait-list,stepper,empty-state,modal}.tsx`, `web/src/lib/look.ts` (+ `look.test.ts`: warna sel deterministik dari genome)

- [ ] Step 1: test `cellLook(genome)` deterministik dan berbeda untuk 4 founder.
- [ ] Step 2: implementasi komponen; `GenomeStrip` mode `traits` dan `origin`; animasi dimatikan untuk `prefers-reduced-motion`.
- [ ] Step 3: commit.

### Task 7: Beranda

**Files:** Create `web/src/pages/home.tsx`
- Hero (dua kalimat), contoh masalah, persamaan sel, tombol "Coba kawinkan" → `/kawin?a=1&b=2`, bagian "Cara kerjanya" 3 langkah, strip agent unggulan.
- [ ] Screenshot 375 & 1440, commit.

### Task 8: Alur Kawinkan (pilih → menunggu → lahir)

**Files:** Create `web/src/pages/breed.tsx`, `web/src/pages/breed-pick.tsx`, `web/src/pages/breed-wait.tsx`, `web/src/pages/breed-born.tsx`
- Pilih: dua slot, daftar kandidat (cooldown & tertutup ditandai), tabel peluang dari `inheritanceOdds` (hanya lokus `matters`), tombol Kawinkan (butuh login di Sepolia → `login()` dulu). Setelah tx sukses, cari `pid` dari `/api/pregnancies` (milik `address`, terbaru) → `navigate('/kawin/'+pid)`.
- Menunggu: animasi pembuahan, progres `(block - startBlock)/5`, perkiraan detik dari `secPerBlock`; bila `keeper` mati dan sudah siap → tombol "Tetaskan".
- Lahir: sel anak, `GenomeStrip` mode origin + legenda, daftar sifat dengan asal, aksi: Bawa pulang (.md), Beri tugas, Beri nama, Kawinkan lagi.
- [ ] e2e manual lewat Playwright MCP: #1×#2 → lahir, refresh di tengah → tetap lanjut.
- [ ] commit.

### Task 9: Detail agent

**Files:** Create `web/src/pages/agent.tsx`, `web/src/components/owner-actions.tsx`
- Sel besar, nama, generasi, pemilik ("milikmu"), pita genome, sifat awam, induk & anak (tautan), status kawin (terbuka/tarif/cooldown), aksi: Ekspor .md, manifest.json, Beri tugas, Kawinkan dengan…, Bayar/sewa; untuk pemilik: Beri nama, Ubah tarif, Buka/tutup kawin, Catat manifest ke chain. Bagian lipat "Detail teknis": genome hex, manifestHash, tier/temp/token, perintah `verify-agent`.
- [ ] commit.

### Task 10: Koleksi, Silsilah, Dompet

**Files:** Create `web/src/pages/{collection,family,wallet}.tsx`
- Koleksi: saring semua/milikku/generasi, cari nama, grid `AgentCard`.
- Silsilah: SVG berlapis per generasi (port dari `renderTree`), klik → `/agent/:id`, bisa di-scroll horizontal di ponsel dalam wadahnya sendiri.
- Dompet: alamat + salin, saldo, royalti + Tarik, agent milikku, kehamilan berjalan (tautan `/kawin/:pid`); mode demo menampilkan tabel akun demo seperti dulu.
- [ ] commit.

### Task 11: Tugas & Arena

**Files:** Create `web/src/pages/{run,arena}.tsx`, `web/src/components/{run-result,loop-block,build-block}.tsx`
- Port perilaku `renderRun` lama: pilih agent (bisa banyak), contoh tugas, direktori kerja opsional, mode, jalankan `/api/run`, polling `/api/job/:id`, tampilkan langkah loop, hasil build, screenshot artefak. Bila `docker:false` → penjelasan + tombol Ekspor .md.
- Arena: tabel hasil + rincian skor (port `renderArena`), kosong → instruksi perintah.
- [ ] commit.

### Task 12: Uji e2e, dokumentasi, bersih-bersih

**Files:**
- Create: `e2e/journey.spec.ts`; Modify: `e2e/wallet.spec.ts`, `e2e/ui.spec.ts` (hapus atau ganti), `scripts/e2e.ts`, `README.md`, `QUICKSTART.md`, `DEPLOY.md`, `.env.example`
- [ ] Journey: `/` → Coba kawinkan → Kawinkan → (reload) → Lahir → unduh .md → `verify-agent` SAH.
- [ ] Dokumentasi: langkah Privy (dashboard, origin, App ID), faucet & operator, `BASE_COOLDOWN_BLOCKS`, daftar periksa manual Privy.
- [ ] Pemeriksaan visual semua halaman di 375 & 1440; perbaiki yang berantakan.
- [ ] `bun test`, `bun run test:contracts`, e2e → semua lulus. Commit.
