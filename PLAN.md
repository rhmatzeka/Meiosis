# Meiosis — Rencana Implementasi

*Inherited intelligence, verifiable on-chain.*

> Protokol perkawinan agent AI di Ethereum. Dua agent kawin, anaknya mewarisi
> kemampuan lewat meiosis on-chain, dan terbukti secara terukur lebih
> baik dari kedua orang tuanya.

**Chain:** Ethereum Sepolia · **Mekanisme:** meiosis on-chain · **Demo:** hybrid vigor terukur
**Stack:** Foundry · Bun · Astro · **Eksekusi:** VPS 4 GB · **Model:** free tier dulu · **Tenggat:** Desember 2026 · **Dev:** 1 orang

**Status dokumen:** rencana penuh dari nol sampai MVP yang berjalan, bukan hanya infra.

---

## Daftar Isi

| # | Bagian | # | Bagian |
|---|---|---|---|
| 1 | Ringkasan konsep | 14 | Web UI |
| 2 | Definisi MVP | 15 | Struktur repo |
| 3 | Model genetik | 16 | Konfigurasi & environment |
| 4 | Genesis: agent generasi nol | 17 | Mode pengembangan lokal |
| 5 | Kehamilan: commit–reveal | 18 | Strategi pengujian |
| 6 | Kontrak | 19 | Deployment & runbook |
| 7 | Skill module | 20 | Milestone & jadwal |
| 8 | Runtime | 21 | Dial cakupan & tanggal periksa |
| 9 | Orkestrator & alur end-to-end | 22 | Anggaran |
| 10 | Sandbox & infrastruktur VPS | 23 | Skrip demo |
| 11 | Arena & pembuktian | 24 | Risiko |
| 12 | Wallet, gas & kunci | 25 | Yang masih terbuka |
| 13 | Indexer | | |

---

## 1. Ringkasan Konsep

Setiap agent adalah NFT (ERC-721) yang menyimpan `uint256 genome`. Genome itu
resep — ia menentukan model dasar, modul skill, tool yang boleh diakses, dan
kepribadian agent. Runtime off-chain membaca genome dan merakit agent yang bisa
benar-benar bekerja.

Perkawinan adalah **fungsi murni**: `childGenome = meiosis(genomeA, genomeB, seed)`.
Karena deterministik, ia dieksekusi di dalam Solidity dan siapa pun bisa
memverifikasi bahwa seorang anak sah keturunan kedua parent-nya. Tidak ada
oracle, tidak ada pihak yang perlu dipercaya.

Yang membuat ini bukan sekadar CryptoKitties: **anaknya bekerja dan menghasilkan uang**.
Pendapatan mengalir kembali ke leluhur lewat royalti lineage, dan fitness yang
tercatat on-chain menentukan agent mana yang layak diperanakkan.

### Tiga klaim yang harus dibuktikan

1. Anak mewarisi trait dari kedua parent secara verifiable → siapa pun bisa hitung ulang.
2. Anak **mengungguli kedua parent** pada job yang sama, diukur objektif.
3. Pendapatan anak mengalir otomatis ke pemilik parent.

---

## 2. Definisi MVP

MVP adalah hal paling tipis yang membuktikan ketiga klaim di atas. Segala yang
tidak melayani itu, tunda.

### Masuk MVP — wajib berjalan

- 4 agent genesis ter-mint di Sepolia dengan genome yang dirancang tangan.
- `breed()` → tunggu → `hatch()` menghasilkan anak dengan genome yang bisa
  diverifikasi ulang siapa pun dari genome kedua parent + seed.
- Runtime merakit ketiga agent (2 parent + 1 anak) langsung dari genome on-chain.
- Ketiganya mengerjakan job identik, 3 kali, di dalam sandbox.
- Scorer deterministik + LLM judge → median → skor tercatat on-chain.
- Web menampilkan pohon keluarga dan perbandingan skor ketiganya.

### Di luar MVP — didemokan seadanya atau ditunda

| Fitur | Perlakuan di MVP |
|---|---|
| Royalti lineage | Kontrak ada & teruji, didemokan lewat satu transaksi manual |
| Stud marketplace | Fungsi kontrak ada, tanpa UI |
| Evolusi multi-generasi | Tidak ada; cukup 1 generasi |
| Smart account per agent (ERC-4337/7702) | Tidak ada; pakai operator key |
| x402 pembayaran antar agent | Tidak ada; sebut di roadmap |
| Token sendiri | **Jangan.** Pakai ETH testnet |

### Kriteria "MVP jalan"

Satu perintah, dari repo bersih, menghasilkan hasil arena yang lengkap:

```
pnpm demo:full
# → deploy (atau pakai alamat tersimpan)
# → mint genesis
# → breed + hatch
# → jalankan arena untuk 3 agent × 3 run
# → submit skor on-chain
# → cetak URL hasil
```

Jika perintah ini gagal di mesin bersih, MVP belum jalan.

---

## 3. Model Genetik

### 3.1 Struktur genome

`uint256 genome` = 16 lokus × 16 bit. Tiap lokus menyimpan **dua alel** (satu dari
tiap parent), persis seperti organisme diploid.

```
genome  : [ L15 | L14 | ... | L1 | L0 ]        16 lokus × 16 bit
lokus   : [ alelX 8 bit | alelY 8 bit ]
alel    : [ dominance 2 bit | traitId 6 bit ]   → 64 varian trait, 4 tingkat dominansi
```

### 3.2 Ekspresi (dominan / resesif)

```
expressed(lokus) = alel dengan dominance tertinggi
                   jika seri → dipilih oleh bit dari seed kelahiran (dikunci saat lahir)
```

Alel dengan `dominance == 0` bersifat resesif murni: hanya terekspresi jika
kedua alel di lokus itu sama-sama resesif. Konsekuensinya trait bisa **melompat
generasi** — kakek jago security, bapak tidak tampak bisa, cucu muncul lagi.

Efek samping yang didapat gratis: pasangan berkerabat dekat cenderung membawa
alel serupa, sehingga variasi anaknya rendah. *Inbreeding depression* muncul
sendiri dari mekanik, tidak perlu di-hardcode.

### 3.3 Meiosis

Untuk tiap lokus `i`:

```
alelDariA = pilih acak(parentA.lokus[i].X, parentA.lokus[i].Y)
alelDariB = pilih acak(parentB.lokus[i].X, parentB.lokus[i].Y)
child.lokus[i] = [alelDariA | alelDariB]
```

Sumber keacakan: bit ke-`i` dan ke-`i+16` dari `seed`.

### 3.4 Mutasi

Peluang ~2% per lokus (parameter governance). Saat terjadi, satu bit acak pada
`traitId` dibalik. Ini jalur masuknya trait yang belum pernah ada di populasi —
tanpa mutasi, gene pool akan mengunci diri dan evolusi berhenti.

### 3.5 Peta lokus

| Lokus | Nama | Fungsi |
|---|---|---|
| L0 | `MODEL_TIER` | fast / balanced / strong — **tier, bukan model konkret** (§8.1) |
| L1 | `DISCIPLINE_PRIMARY` | code / design / research / security / data |
| L2 | `DISCIPLINE_SECONDARY` | disiplin pendukung |
| L3 | `STACK_AFFINITY` | solidity / react / python / ... |
| L4 | `AESTHETIC` | selera visual, sistem warna, tipografi |
| L5 | `TEST_RIGOR` | seberapa keras ia menulis & menjalankan tes |
| L6 | `SECURITY_INSTINCT` | kecenderungan mengaudit & memvalidasi input |
| L7 | `DOC_HABIT` | kebiasaan mendokumentasikan |
| L8 | `TOOL_TIER` | tingkat akses tool |
| L9 | `MCP_SET_A` | bundel MCP server (build, filesystem) |
| L10 | `MCP_SET_B` | bundel MCP server (web, data) |
| L11 | `VERBOSITY` | panjang & gaya keluaran |
| L12 | `RISK_APPETITE` | berani ambil keputusan sendiri vs banyak bertanya |
| L13 | `CREATIVITY` | temperature & keragaman solusi |
| L14 | `PERSISTENCE` | max steps, kebijakan retry |
| L15 | `RESERVED` | slot masa depan / trait event |

`traitId` di tiap lokus adalah indeks ke `SkillRegistry`, yang memetakannya ke
modul prompt nyata (CID di IPFS) dan daftar tool yang diizinkan.

---

## 4. Genesis: Agent Generasi Nol

**Ini lubang paling mendasar yang harus ditutup sebelum apa pun bisa jalan:**
perkawinan butuh orang tua, tapi di awal belum ada siapa-siapa. Generasi nol
harus di-mint langsung dengan genome yang dirancang tangan.

### 4.1 Empat founder

| # | Nama | Trait dominan | Trait resesif yang dibawa |
|---|---|---|---|
| G0 | **Solidity Smith** | `SECURITY_INSTINCT` (dom 3), `TEST_RIGOR` (dom 3), `VERBOSITY`=terse | `AESTHETIC`=lemah |
| G1 | **Pixel Sense** | `AESTHETIC` (dom 3), `STACK_AFFINITY`=react (dom 2) | `TEST_RIGOR`=lemah |
| G2 | **Doc Weaver** | `DOC_HABIT` (dom 2), `DISCIPLINE`=research | `SECURITY_INSTINCT` (dom 0) — pembawa tersembunyi |
| G3 | **Ops Hound** | `PERSISTENCE` (dom 3), `MCP_SET_A`=build tools | `AESTHETIC` (dom 0) |

Pasangan demo utama: **G0 × G1**. Keduanya kuat di sisi yang berbeda dan lemah di
sisi yang dikuasai pasangannya — inilah yang membuat hybrid vigor mungkin.

G2 dan G3 memberi keluasan pohon keluarga, dan G2 khususnya menyimpan
`SECURITY_INSTINCT` resesif yang bisa muncul lagi di generasi berikutnya jika
sempat didemokan.

### 4.2 Soal kejujuran: hybrid vigor ini dirancang, bukan kebetulan

Perlu dinyatakan terang-terangan, di dokumen maupun di presentasi.

Trait unggulan tiap founder sengaja diberi `dominance` tinggi supaya lolos ke
anak. Itu **bukan kecurangan** — `dominance` adalah properti genome yang
tersimpan on-chain dan bisa dibaca siapa pun sebelum perkawinan terjadi. Sama
seperti peternak memilih indukan: hasilnya bisa diprediksi justru karena
genetikanya transparan.

Yang tetap tidak bisa dikendalikan: alel mana yang terbawa, dan mutasi. Jadi anak
unggul tidak dijamin.

### 4.3 Tunjukkan seluruh anakan

Jangan kawinkan sekali lalu berharap. Sebelum demo, jalankan **5–8 perkawinan
G0 × G1**, skor semuanya, lalu tampilkan seluruh anakan apa adanya — termasuk yang
lebih buruk dari orang tuanya.

Ini berlawanan dengan insting presentasi, tapi jauh lebih kuat. Distribusi hasil
membuktikan sistemnya benar-benar genetik dan tidak dikarang. Satu anak sempurna
yang berdiri sendiri justru terlihat seperti hasil kurasi.

Grafik yang diinginkan: sebaran skor anakan, dengan garis skor kedua parent, dan
sebagian anakan melewati keduanya.

### 4.5 Hasil simulasi — dijalankan 17 Sep 2026

10.000 perkawinan G0 × G1, `bun run gene-sim`:

| Metrik | Hasil |
|---|---|
| Anak mewarisi `SECURITY_INSTINCT` high | 99,7% |
| Anak mewarisi `AESTHETIC` high | 50,3% |
| **Keduanya sekaligus** | **50,1%** (ambang 40%) ✅ |
| Lebih buruk dari kedua parent di dua lokus itu | 0,2% |
| Anak membawa ≥1 mutasi | 9,9% |
| Lokus beku | hanya L15 `RESERVED`, memang disengaja |
| `relatedness(G0,G1)` | 63 dari 255 — cukup jauh, tidak ada masalah inbreeding |

Asimetrinya disengaja: G0 homozigot dominan untuk security sehingga hampir
selalu mewariskannya, sedangkan G1 heterozigot untuk estetika sehingga hanya
sekitar separuh anak mendapat yang tinggi. Variasi anakan untuk demo §4.3
datang dari L4 dan dari lokus-lokus lain yang berbeda antar founder.

**Catatan penting:** angka "lebih buruk dari kedua parent" hanya 0,2% karena
diukur di tingkat *trait*, bukan skor. Sebaran skor yang sesungguhnya baru
muncul di P3, dan datang dari lokus lain — stack, test rigor, verbosity,
creativity, persistence — yang semuanya bervariasi bebas.

#### Bug yang ditemukan simulator, sebelum sempat di-deploy

Rancangan awal memutasi gen dengan membalik satu bit acak pada `traitId`.
Karena `traitId` lebarnya 6 bit (0–63) sedangkan tiap lokus hanya punya 3–6
trait yang sah, **sekitar 90% mutasi menghasilkan trait tak bermakna** —
simulasi pertama memunculkan `trait17`, `trait33`, `trait34` di setiap lokus.

Perbaikannya: mutasi menggeser trait di dalam katalog lokusnya
(`(trait + 1 + shift) % traitCount`), sehingga selalu sah dan selalu berbeda
dari aslinya. `GeneLib.TRAIT_COUNTS` menyimpan jumlah trait per lokus dalam
satu konstanta terpak.

Ambang mutasi juga diturunkan dari 5/256 ke 2/256. Dengan 16 lokus, 5/256
berarti 26% anak bermutasi — terlalu bising untuk demo 8 anakan. Sekarang 9,9%.

Inilah alasan §4.4 ada. Kalau bug ini baru ketahuan setelah `seal()`, generasi
nol tidak bisa diperbaiki lagi.

### 4.4 Simulasikan dulu sebelum apa pun di-deploy

Genome founder di §4.1 masih berupa deskripsi, bukan angka. Sebelum satu baris
kontrak pun di-deploy, tulis `scripts/gene-sim.ts`: implementasi `meiosis` versi
TypeScript, jalankan **10.000 perkawinan G0 × G1**, lalu laporkan distribusinya.

Yang harus dijawab simulator:

- Berapa persen anak mengekspresikan `SECURITY_INSTINCT` **dan** `AESTHETIC` sekaligus?
  Target minimal **40%** — di bawah itu, kamu akan kehabisan percobaan saat menyiapkan demo.
- Berapa persen anak justru lebih buruk dari kedua parent di dua lokus itu?
  Angka ini yang akan kamu tampilkan sebagai sebaran di §4.3.
- Apakah ada lokus yang tidak pernah bervariasi? Kalau ada, genome founder terlalu seragam.

Kalau angkanya jelek, **perbaiki genome founder, bukan kodenya** — tinggal ubah
konstanta. Kalau ini baru ketahuan setelah kontrak ter-deploy dan `seal()`
terpanggil, generasi nol tidak bisa diperbaiki lagi.

Simulator ini juga jadi oracle untuk fuzz test Solidity di §18.1: implementasi TS
dan Solidity harus menghasilkan output identik untuk seed yang sama.

---

## 5. Kehamilan: commit–reveal

**Masalah:** jika `breed()` langsung mengembalikan anak di transaksi yang sama,
penyerang bisa memanggilnya dari kontrak, memeriksa genome hasilnya, lalu
`revert` bila jelek — diulang sampai dapat gen sempurna. Ini *gene grinding*, dan
semua randomness on-chain rentan terhadapnya.

**Solusi:** pisahkan komitmen dari pengungkapan.

```
blok N      breed(parentA, parentB)
            → simpan Pregnancy { parentA, parentB, revealBlock = N + 5 }
            → seed belum ada, hasil tidak bisa disimulasi

blok N+5    hatch(pregnancyId)
            → seed = keccak256(blockhash(revealBlock), pregnancyId)
            → genome dihitung, NFT anak di-mint
```

**Jebakan yang wajib ditangani:** `blockhash` hanya menyimpan 256 blok terakhir
(~50 menit di Sepolia). Kehamilan yang lewat tenggat harus bisa di-`reroll()`
dengan `revealBlock` baru — jangan sampai ada agent tersangkut selamanya.

Bonus: mekanik ini punya narasi yang enak dipresentasikan. Agent-nya *hamil*.

---

## 6. Kontrak

### 6.1 Layout penyimpanan

Satu agent dipadatkan ke **2 storage slot**:

```solidity
struct Agent {
    uint256 genome;        // slot 1
    // slot 2 — dipak rapat:
    uint64  parentA;
    uint64  parentB;
    uint32  birthBlock;
    uint16  generation;
    uint16  breedCount;
    uint64  manifestHash;  // 8 byte pertama hash manifest runtime
}
```

Target biaya kelahiran: **< 120k gas**.

Catatan jujur: di Sepolia gas praktis gratis, jadi efisiensi ini bukan soal biaya
demo. Alasannya dua — angka gas yang rapi adalah bukti kesiapan mainnet di mata
juri, dan struct yang meluber ke banyak slot akan menyakitkan kalau proyek ini
diteruskan. Optimasi seperlunya saja, jangan sampai menunda P1.

### 6.2 Daftar kontrak

| Kontrak | Tanggung jawab |
|---|---|
| `GeneLib.sol` | `meiosis`, `mutate`, `express`, `relatedness` — semuanya `pure` |
| `AgentRegistry.sol` | ERC-721, penyimpanan genome, lineage, `manifestHash` |
| `Genesis.sol` | mint generasi nol, dikunci setelah 4 founder |
| `Hatchery.sol` | commit–reveal, cooldown, stud fee, `reroll` |
| `SkillRegistry.sol` | `traitId` → `{nama, CID, tool yang diizinkan}`, append-only |
| `Arena.sol` | ronde kompetisi, commit rubrik, submit skor, fitness |
| `LineageRoyalty.sol` | split pendapatan ke leluhur, kedalaman dibatasi |
| `adapters/ERC8004.sol` | jembatan ke Identity / Reputation / Validation Registry |

### 6.3 Antarmuka inti

```solidity
// GeneLib — pure, bisa diverifikasi ulang siapa pun
function meiosis(uint256 a, uint256 b, uint256 seed) pure returns (uint256);
function express(uint256 genome, uint256 seed) pure returns (uint8[16] memory);
function relatedness(uint256 a, uint256 b) pure returns (uint8); // 0-255

// Genesis
function mintFounder(uint256 genome, string calldata name) returns (uint64);
function seal();                                // tutup selamanya setelah 4 founder

// Hatchery
function breed(uint64 parentA, uint64 parentB) payable returns (uint64 pregnancyId);
function hatch(uint64 pregnancyId) returns (uint64 childId);
function reroll(uint64 pregnancyId);            // saat blockhash kedaluwarsa
function listForStud(uint64 agentId, uint256 fee);

// Arena
function openRound(bytes32 rubricHash, bytes32 jobSpecHash);
function submitResult(uint256 roundId, uint64 agentId, bytes32 outputCID, uint16 score);
function closeRound(uint256 roundId);           // fitness → ReputationRegistry

// LineageRoyalty
function distribute(uint64 agentId) payable;    // 5% → 2.5% → 1.25%, maks depth 4
```

### 6.4 Event yang di-index

```solidity
event FounderMinted(uint64 indexed agentId, uint256 genome, string name);
event Pregnancy(uint64 indexed id, uint64 indexed parentA, uint64 indexed parentB, uint32 revealBlock);
event Hatched(uint64 indexed childId, uint64 indexed parentA, uint64 indexed parentB, uint256 genome, uint256 seed);
event RoundOpened(uint256 indexed roundId, bytes32 rubricHash, bytes32 jobSpecHash);
event ResultSubmitted(uint256 indexed roundId, uint64 indexed agentId, bytes32 outputCID, uint16 score);
event RoyaltyPaid(uint64 indexed from, address indexed to, uint8 depth, uint256 amount);
```

### 6.5 Aturan ekonomi

- **Stud fee** — pemilik agent memasang harga kawin. Dibayar ke pemilik parent.
- **Royalti lineage** — 5% parent, 2.5% kakek, 1.25% buyut, berhenti di kedalaman 4.
- **Cooldown** — jeda breeding meningkat seiring `breedCount`, mencegah spam.
- **Fitness** — `pendapatan + success rate tervalidasi`, disimpan di reputation registry.

---

## 7. Skill Module

Trait di genome hanyalah angka. Yang membuatnya berarti adalah modul skill yang
dipetakan dari angka itu.

### 7.1 Format

```
runtime/skills/security-instinct-high/
├── module.json
└── prompt.md
```

```json
{
  "traitId": 12,
  "locus": 6,
  "name": "security-instinct-high",
  "version": "1.0.0",
  "mcpTools": ["filesystem", "bash:slither"],
  "params": { "maxSteps": 40 }
}
```

`prompt.md` berisi potongan instruksi yang akan disusun jadi system prompt.

### 7.2 Katalog minimum untuk MVP

Cukup **12 modul**, bukan 64. Sisa `traitId` dibiarkan kosong dan di-fallback ke
modul netral.

| Lokus | Modul |
|---|---|
| L0 | `tier-strong`, `tier-fast` |
| L1/L2 | `discipline-code`, `discipline-design` |
| L3 | `stack-react`, `stack-solidity` |
| L4 | `aesthetic-high`, `aesthetic-plain` |
| L5 | `test-rigor-high` |
| L6 | `security-instinct-high` |
| L11 | `verbosity-terse` |
| L14 | `persistence-high` |

### 7.3 Aturan penyusunan

Modul disusun **berurutan menurut lokus (L0 → L15)**, dipisah header tetap.
Urutan tidak boleh bergantung pada apa pun selain nomor lokus — ini bagian dari
jaminan determinisme di §8.

---

## 8. Runtime

Genome adalah resep; runtime adalah dapur.

```
genome (uint256)
  → expand()      : deterministik, uint256 → manifest JSON
  → manifest      : { model, promptModules[], mcpServers[], params }
  → materialize() : manifest → agent siap jalan (Claude Agent SDK)
```

**Aturan paling penting di seluruh proyek:** `expand()` harus benar-benar
deterministik. Genome yang sama wajib menghasilkan manifest yang identik, byte
per byte. Jika tidak, seluruh klaim verifiability runtuh. Karena itu
`manifestHash` disimpan on-chain saat kelahiran — selalu ada yang bisa dicocokkan.

Aturan turunan, diberlakukan lewat lint + tes:

- Dilarang `Date.now()`, `Math.random()`, `process.env`, atau iterasi objek tanpa urutan di dalam `expand()`.
- Serialisasi JSON dengan kunci terurut (`json-stable-stringify`).
- `SkillRegistry` append-only; CID tidak pernah berubah setelah terdaftar.
- Versi modul ikut masuk hash. Mengubah `prompt.md` = naikkan versi = genome lama tetap mereproduksi manifest lama.

Butir terakhir itu halus tapi penting: tanpanya, mengedit satu prompt akan
membuat seluruh `manifestHash` historis tidak cocok lagi.

### 8.1 Manifest menyimpan tier, bukan nama model

Ini konsekuensi langsung dari keputusan memakai model gratis dulu lalu berpindah
ke model berbayar nanti.

Kalau manifest memuat `"model": "gemini-3.5-flash"`, maka berpindah penyedia akan
**mengubah `manifestHash` setiap agent yang pernah lahir**, dan seluruh hash yang
sudah tercatat on-chain jadi tidak cocok. Klaim verifiability rusak hanya karena
ganti penyedia.

Maka manifest hanya menyimpan tier:

```json
{ "modelTier": "strong", "promptModules": [...], "params": {...} }
```

Resolusi `tier → model konkret` terjadi saat `materialize()`, di luar bagian yang
di-hash. Model yang benar-benar dipakai dicatat di **kuitansi run** yang
menyertai hasil arena, bukan di genome.

Ini juga lebih tepat secara konseptual: genome mendefinisikan kemampuan dan
perilaku agent, sedangkan penyedia model adalah infrastruktur. Dua agent dengan
genome identik memang seharusnya tetap identik meski dijalankan di penyedia
berbeda.

---

## 9. Orkestrator & Alur End-to-End

Bagian yang menyambungkan chain dengan runtime. Tanpa ini, kontrak dan agent
hidup di dua dunia terpisah.

### 9.1 Alur lengkap

```
[Web]  user pilih dua parent, klik "Breed"
   │   wagmi/viem kirim tx langsung ke Hatchery
   ▼
[Chain] breed() → event Pregnancy(revealBlock = N+5)
   │
   ▼
[Orchestrator] watcher lihat Pregnancy
   │   tunggu sampai block.number > revealBlock
   │   kirim hatch() pakai operator key
   ▼
[Chain] hatch() → event Hatched(childId, genome, seed)
   │
   ▼
[Orchestrator] expand(genome) → manifest
   │   cek manifestHash cocok dengan yang on-chain
   │   simpan manifest + push ke IPFS
   ▼
[Web]  anak muncul di pohon keluarga
```

Lalu jalur arena, dipicu manual atau lewat tombol:

```
[Orchestrator] openRound(rubricHash, jobSpecHash)
   │
   ├─ untuk tiap agent ∈ {parentA, parentB, child}
   │    └─ untuk run ∈ {1,2,3}
   │         materialize(manifest) → jalankan job di Sandbox → artefak
   │
   ├─ scorer deterministik + judge → skor per run
   ├─ ambil median per agent
   ├─ upload artefak + transkrip ke IPFS → CID
   └─ submitResult(roundId, agentId, cid, medianScore)  ×3
        ▼
[Chain] closeRound() → fitness tercatat
        ▼
[Web]  tabel perbandingan + grafik sebaran anakan
```

### 9.2 Komponen orkestrator

```
orchestrator/
├── watcher.ts      # langganan event chain, auto-hatch
├── queue.ts        # antrean job, konkurensi dibatasi 2
├── runner.ts       # materialize → sandbox → kumpulkan artefak
├── submitter.ts    # kirim tx skor, retry + bump gas
└── api.ts          # REST tipis untuk web
```

### 9.3 API untuk web

```
GET  /agents                  daftar agent + genome + trait terekspresi
GET  /agents/:id              detail, lineage, riwayat fitness
GET  /agents/:id/manifest     manifest hasil expand + status verifikasi hash
POST /rounds                  buka ronde arena baru
GET  /rounds/:id              status live tiap run (queued/running/scored)
GET  /rounds/:id/results      skor + CID + tautan artefak
```

`GET /rounds/:id` harus mengalirkan status per run. Saat demo, penonton perlu
melihat sesuatu bergerak — arena yang diam 4 menit terasa seperti hang.

### 9.4 Idempotensi

Watcher wajib tahan restart. Simpan `lastProcessedBlock` dan status tiap
`pregnancyId` di SQLite lokal. Memanggil `hatch()` dua kali harus gagal di
kontrak, bukan menghasilkan dua anak.

---

## 10. Sandbox & Infrastruktur VPS

**Agent menghasilkan kode, dan kode itu harus dibangun serta diuji untuk bisa
diskor. Artinya kita mengeksekusi kode yang ditulis mesin, tanpa ditinjau
manusia.** Ini tidak boleh berjalan di laptop kerja.

**Pembaruan 17 Sep:** Docker Engine kini terpasang langsung di WSL2 di laptop,
dan sandbox terbukti berjalan di sana — Chromium 3,4 detik dan vite build 1,9
detik dalam batas 2 GB. Jadi P3 dapat dikerjakan sepenuhnya di laptop, dan sewa
VPS ditunda.

VPS tetap dibutuhkan nanti, tapi alasannya bukan lagi sandbox melainkan watcher
auto-`hatch` yang harus hidup 24/7. Itu baru mendesak setelah deploy Sepolia.

Alasan aslinya, yang tetap berlaku untuk tahap berikutnya:

- Docker Engine berjalan native di Linux, tanpa beban Docker Desktop sama sekali.
- Watcher auto-`hatch` harus hidup 24/7. Laptop yang tidur akan melewatkan jendela
  256 blok dan memaksa `reroll()` terus-menerus.
- Ronde arena makan puluhan menit. Biarkan VPS yang menanggungnya.
- Web + API bisa diakses publik lewat URL — juri bisa membuka sendiri saat penilaian.
- Kode buatan mesin dieksekusi jauh dari berkas pribadimu.

### 10.1 Spesifikasi VPS

Karena Lighthouse dibuang (§11.2), kebutuhannya turun drastis.

| Item | Cukup | Catatan |
|---|---|---|
| vCPU | 2 | |
| RAM | **4 GB** | Chromium hanya untuk screenshot, bukan Lighthouse |
| Swap | **4 GB** | Wajib. Ini yang membuat 4 GB aman, dan biayanya nol |
| Disk | 40 GB NVMe | Image, cache bun, artefak |
| OS | Ubuntu 24.04 LTS | |
| Lokasi | **yang termurah** | Lihat di bawah |

Sekitar **Rp 70–120 ribu per bulan** di kelas ini.

**Lokasi tidak perlu Singapura.** Ini server batch, bukan layanan interaktif —
tidak ada pengguna yang menunggu respons. Latensi hanya terasa saat mengetik di
SSH, dan itu tertutupi VS Code Remote-SSH. Ambil region termurah yang ditawarkan
penyedia; selisihnya bisa separuh harga.

`SANDBOX_CONCURRENCY=1` di 4 GB. Ronde jadi lebih lama, tapi kamu punya waktu
sampai Desember — dan lagipula rate limit model gratis (§22.1) jauh lebih
membatasi daripada CPU.

**2 GB masih mungkin** dengan swap 4 GB dan konkurensi 1, tapi Chromium akan
sesekali tersendat. Selisihnya cuma puluhan ribu rupiah sebulan; ambil 4 GB.

**Sewa baru mulai P3, akhir Oktober** — bukan sekarang. Enam minggu, bukan tiga
bulan. Itu memotong biayanya lebih dari separuh.

### 10.2 Penyiapan VPS

```bash
# Docker Engine — bukan Desktop
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER

# swap 4 GB — lakukan sebelum apa pun, ini yang menyelamatkan VPS kecil
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Bun
curl -fsSL https://bun.sh/install | bash

# Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Firewall
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
```

### 10.3 Aturan isolasi sandbox

| Aspek | Ketentuan |
|---|---|
| Isolasi | Container Docker, satu per run, dibuang setelah selesai |
| User | Non-root, `no-new-privileges` |
| Masuk-keluar | `docker cp`, **tanpa bind mount sama sekali** — tidak ada direktori host yang terlihat |
| Filesystem | `/work` read-write dan fana. `--read-only` sempat dipakai lalu dilepas: vite perlu menulis konfigurasi sementara di sebelah `vite.config.ts` |
| Proses | `--pids-limit 256` |
| Jaringan | `--network none` saat build & eksekusi; dependensi sudah ada di image |
| Waktu | Batas keras 5 menit per run, lalu container dibunuh |
| Memori | `--memory 2g --cpus 2` |
| Keluaran | Hanya lewat `/work/out`, disalin keluar setelah container mati |
| Rahasia | Tidak ada API key apa pun masuk ke dalam container |

Butir terakhir penting: **agent memanggil model dari luar sandbox**. Yang masuk
sandbox hanyalah kode yang sudah dihasilkan, untuk dibangun dan diskor.

Butir jaringan juga sengaja keras. Kode buatan mesin tanpa akses jaringan tidak
bisa mengeksfiltrasi apa pun maupun menarik dependensi tak terduga — dan sebagai
efek samping, skoring jadi jauh lebih reproducible.

### 10.4 Image dasar

```dockerfile
FROM oven/bun:1-debian
RUN apt-get update && apt-get install -y --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m runner
USER runner
WORKDIR /work
# dependensi template di-install saat build image, bukan saat run
COPY --chown=runner template/package.json template/bun.lockb ./
RUN bun install --frozen-lockfile
```

Dependensi template dipasang **saat build image**, sehingga `--network none` bisa
diberlakukan saat run. Bangun ulang image hanya ketika template berubah.

### 10.5 Alur kerja pengembangan

Laptop tetap dipakai, tapi sebagai klien tipis:

```
Laptop  ──ssh──▶  VPS
  │                │
  │  edit kode     │  docker, orchestrator, arena, web
  │  (VS Code      │  operator key
  │   Remote-SSH)  │
  ▼                ▼
  git push  ────▶  git pull && bun run deploy
```

**P0–P2 masih bisa sepenuhnya di laptop** — tidak ada Docker sama sekali di
fase-fase itu, hanya Foundry, Bun, dan Anvil yang semuanya sudah terpasang.
VPS baru benar-benar dibutuhkan saat masuk P3.

Jadi jangan tunda P0 menunggu VPS siap. Mulai sekarang, siapkan VPS-nya sambil jalan.

---

## 11. Arena & Pembuktian

### 11.1 Spesifikasi job

Job dikunci sebelum ronde dibuka, di-hash, dan hash-nya masuk on-chain.

```
arena/jobs/staking-landing/
├── spec.md          # instruksi untuk agent, identik bagi ketiganya
├── template/        # kerangka proyek kosong (vite + ts)
└── checks.json      # ambang tiap scorer deterministik
```

Isi `spec.md` singkatnya: bangun landing page untuk dApp staking, dengan hero,
penjelasan mekanisme, tabel APY, dan formulir koneksi wallet (mock). Harus
ter-build, aksesibel, dan responsif.

**Job harus diskriminatif.** Ini syarat yang mudah terlewat: jika tugasnya terlalu
mudah, ketiga agent mendapat skor mirip dan tidak ada yang terbukti. Jika terlalu
sulit, ketiganya gagal build dan semua dapat nol.

Kalibrasi sebelum P3 selesai: jalankan G0 dan G1 pada job kandidat dan pastikan
**keduanya gagal di sisi yang berbeda** — G0 lolos security tapi jeblok di
aesthetic, G1 sebaliknya. Kalau keduanya sama-sama bagus atau sama-sama jelek,
ganti jobnya.

### 11.2 Rubrik — 100 poin

**Deterministik, 70 poin** (reproducible oleh siapa pun):

| Cek | Poin | Jenis |
|---|---|---|
| Halaman merender isi tanpa galat konsol | 10 | **Gerbang** — gagal di sini, total 0 |
| `tsc --noEmit` lolos | 5 | lantai |
| Temuan `eslint-plugin-security` + pola berbahaya | 10 | lantai |
| **Ketahanan input** — validasi angka, batas nilai, state galat, tombol nonaktif, preventDefault | 10 | **positif, bertingkat** |
| Pelanggaran `axe-core` | 10 | lantai |
| **Aksesibilitas disengaja** — label terkait, tipe tombol, landmark, fokus terlihat | 5 | **positif, bertingkat** |
| **Kualitas desain** — skala tipografi, disiplin palet, ritme spasi | 15 | **positif, bertingkat** |
| Ukuran bundle | 5 | lantai |

**Kenapa ada cek positif: rubrik v1 gagal total dalam membedakan.** Versi pertama
hanya berisi cek lantai — build, nol pelanggaran, nol temuan. Pada uji
diskriminasi pertama, G0 dan G1 mendapat **67,2/70 yang identik baris per baris**,
padahal genome-nya berlawanan. Model yang layak melewati semua cek lantai apa pun
genome-nya, sehingga agent berfokus estetika tidak punya satu pun jalan objektif
untuk membuktikan keunggulannya.

v2 menambahkan tiga ukuran yang menanyakan "seberapa tinggi", bukan "apakah ada
yang salah". Kualitas desain dihitung dari fakta yang memang bisa diukur —
rasio skala tipografi, jumlah warna, persentase spasi yang merupakan kelipatan
satu satuan dasar — sehingga estetika punya jalur poin yang tidak bergantung
pada judge.

**Gerbangnya bukan "build berhasil", dan ini temuan nyata dari P3.** `vite build`
tidak memeriksa tipe: kode yang merujuk variabel tak ada tetap lolos build, lalu
merender halaman kosong dengan empat galat konsol. Gerbang lama akan memberi
poin penuh kepada halaman yang sepenuhnya rusak.

**`axe-core` dijalankan di dalam container lewat Chromium**, bukan jsdom di host.
Halaman React baru punya DOM setelah JavaScript-nya dieksekusi, dan itu hanya
boleh terjadi di dalam sandbox. Chromium yang sudah ada untuk screenshot
sekaligus dipakai, jadi tanpa biaya tambahan.

**Judge menilai dari fakta terukur, bukan screenshot.** Model teks di free tier
tidak bisa melihat gambar. Memaksakan penilaian visual tanpa gambar akan jadi
tebakan, jadi judge menerima skala tipografi, jumlah warna, ritme spasi, dan
teks halaman sebagai angka. Lebih reproducible, meski kehilangan hal yang hanya
bisa dilihat mata. Screenshot tetap disimpan untuk ditinjau manusia, dan ini
layak ditinjau ulang kalau nanti ada model vision.

**Judge LLM, 30 poin** (subjektif):

| Aspek | Poin |
|---|---|
| Hierarki visual & tata letak | 10 |
| Koherensi sistem desain (warna, tipografi, spasi) | 10 |
| Kejelasan copy | 10 |

Judge menerima **hanya screenshot dan teks**, tidak diberi tahu agent mana yang
dinilai maupun siapa orang tuanya. Buta terhadap identitas.

### 11.3 Median dari 3 run

Setiap agent menjalankan job 3 kali, diambil median. Kemenangan dari satu run
bisa kebetulan, dan itu akan ketahuan saat juri minta diulang live.

### 11.3b Kalau hybrid vigor tidak muncul

Ini kemungkinan nyata dan harus punya jawaban sebelum hari-H, bukan diimprovisasi
di panggung. Jika median anak terbaik tidak melewati kedua parent:

- **Jangan sembunyikan.** Ganti klaim kedua dari "anak lebih unggul" menjadi
  "pewarisan terverifikasi menghasilkan variasi terukur", dan tunjukkan sebarannya.
- Tunjukkan **skor per lokus**, bukan hanya total. Anak mungkin kalah di total tapi
  jelas mewarisi kekuatan spesifik tiap parent — itu tetap membuktikan genetikanya bekerja.
- Sebutkan hipotesis kenapa gagal dan apa yang akan diubah. Tim yang menunjukkan
  hasil negatif berikut analisisnya dinilai jauh lebih serius daripada tim yang
  memaksakan narasi kemenangan.

Klaim pertama dan ketiga tidak terpengaruh, jadi proyeknya tetap berdiri.

### 11.4 Menutup serangan juri

Pertanyaan yang **pasti** muncul: *"Skornya dari LLM judge — berarti kamu yang menentukan anaknya menang."*

1. **70% bobot ada di cek deterministik** yang bisa dijalankan ulang siapa pun.
2. **Rubrik dikunci lebih dulu** — hash-nya on-chain sebelum ronde dibuka.
3. **Semua output mentah dipublikasikan** ke IPFS, CID-nya on-chain.
4. **Judge buta identitas** — tidak tahu mana anak, mana orang tua.
5. **Jujur soal batas kepercayaan** — skoring bersifat *attested*, bukan trustless.
   Persis itu fungsi Validation Registry ERC-8004.

Poin 4 sering dilupakan dan paling murah dikerjakan. Tanpanya, seluruh
pembelaan lain ikut melemah.

---

## 12. Wallet, Gas & Kunci

### 12.1 Kunci yang dipakai

| Peran | Dipakai untuk | Disimpan di |
|---|---|---|
| `DEPLOYER` | Deploy kontrak, mint genesis, `seal()` | **Laptop saja.** Jangan pernah ke VPS |
| `OPERATOR` | `hatch()` otomatis, `submitResult()` | VPS, `.env` dengan `chmod 600` |
| `DEMO_USER` | Memanggil `breed()` dari UI saat demo | Wallet browser |

Pemisahan ini bukan formalitas. VPS terekspos ke internet dan menjalankan kode
buatan mesin; ia hanya boleh memegang kunci yang kalau bocor, kerugiannya
sebatas beberapa transaksi testnet. Kunci yang bisa memanggil `seal()` dan
mengubah `SkillRegistry` tidak termasuk.

Semua kunci di-generate `cast wallet new`, khusus proyek ini, tidak pernah
menyentuh aset nyata.

### 12.1b Founder harus dimiliki alamat yang berbeda

Bagikan 4 founder ke **minimal 3 alamat berbeda**. Kalau semuanya dimiliki satu
alamat, demo royalti jadi tidak berarti — uangnya pindah dari kamu ke kamu
sendiri, dan juri akan langsung melihat itu di Etherscan.

Karena timmu bertiga, cara paling alami: satu alamat per orang.

Agent **tidak** punya wallet sendiri di MVP. Smart account per agent adalah
pekerjaan ERC-4337/7702 dan masuk roadmap.

### 12.2 Sepolia ETH — tugas paling cocok untuk rekan setim

Faucet Sepolia dibatasi rate per akun dan sering kering. Kebutuhan realistis:
**sekitar 0,5 ETH tersebar di 3 alamat**.

Di sinilah tim bertiga menguntungkan: **batas faucet berlaku per akun, jadi tiga
orang bisa memanen tiga kali lebih cepat**. Ini pekerjaan yang tidak butuh
kemampuan ngoding sama sekali, dan sangat cocok didelegasikan.

Dengan tenggat Desember, ini tidak mendesak — tapi mulai mencicil dari sekarang
jauh lebih tenang daripada memburu 0,5 ETH di minggu terakhir.

### 12.3 Ketahanan transaksi

`submitter.ts` harus menangani nonce bentrok dan tx tersangkut: antre dari satu
alamat saja, lacak nonce sendiri, dan naikkan gas price kalau belum ter-mine
dalam 2 menit.

---

## 13. Indexer

Untuk MVP tidak perlu subgraph. Cukup proses Node yang membaca event ke SQLite.

```
indexer/
├── schema.sql    # agents, pregnancies, rounds, results, royalties
└── index.ts      # poll event dari lastProcessedBlock, upsert
```

Query yang harus cepat:

- Pohon keluarga dari `agentId` mana pun (rekursif ke atas dan ke bawah).
- Papan peringkat fitness.
- Seluruh anakan dari satu pasangan, berikut skornya — ini yang menggerakkan
  grafik sebaran di §4.3.

Reorg di Sepolia mungkin terjadi. Tangani secara sederhana: index hanya blok
yang sudah tertinggal 5 blok di belakang kepala rantai.

---

## 14. Web UI

Empat layar. Tidak lebih — setiap layar tambahan adalah waktu yang dicuri dari
arena.

| Layar | Isi | Keadaan yang harus ditangani |
|---|---|---|
| **Roster** | Kartu tiap agent: nama, generasi, trait terekspresi, fitness | kosong, memuat |
| **Breed** | Pilih dua parent, tampilkan `relatedness` + prediksi trait, tombol Breed | tx pending, hamil (hitung mundur blok), siap di-hatch, gagal |
| **Family Tree** | Graf silsilah, node berwarna menurut fitness | satu node, banyak generasi |
| **Arena** | Tabel 3 agent × 3 run, status live, grafik sebaran anakan | queued, running, scored, error |

Layar Breed adalah yang paling padat: ia harus menampilkan status kehamilan
dengan hitung mundur blok, karena itulah momen naratif terkuat saat demo.

Untuk grafik sebaran anakan, gunakan skala dan warna yang konsisten dengan
tabel arena — angka yang sama tidak boleh tampil beda di dua tempat.

---

## 15. Tech Stack & Struktur Repo

### 15.1 Stack

Prinsipnya: **satu tool yang mengerjakan banyak hal, lebih baik daripada lima tool
yang dirangkai.** Setiap dependensi yang dihapus adalah satu hal yang tidak bisa
rusak di bulan Desember.

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Kontrak | **Foundry** | Sudah terpasang; `forge test` tercepat, fuzz bawaan |
| Runtime | **Bun** | TS native tanpa build step, install cepat |
| Test runner | **`bun test`** | Bawaan. Tidak perlu vitest/jest |
| DB indexer | **`bun:sqlite`** | Bawaan. Tanpa proses DB terpisah, tanpa ORM |
| Server API | **`Bun.serve()`** | Bawaan. Tanpa Express/Fastify |
| Monorepo | **Bun workspaces** | Bawaan. Tanpa Turborepo/Nx |
| Web | **Astro + React islands** | Lihat §15.2 |
| Styling | **Tailwind v4** | Tanpa konfigurasi PostCSS |
| Chain | **viem + wagmi** | |
| Lint & format | **Biome** | Satu biner menggantikan ESLint + Prettier |
| Graf silsilah | **d3-hierarchy** + SVG manual | Hanya butuh perhitungan tata letak |

Empat baris "bawaan" itu poin utamanya: Bun menghapus test runner, database,
framework server, dan tool monorepo sekaligus dari daftar dependensi.

**Satu hal yang harus diverifikasi di awal P2:** Claude Agent SDK berjalan di Bun
atau tidak. Umumnya kompatibel, tapi SDK yang menyentuh binding native atau
`child_process` kadang bermasalah. Cadangannya sederhana dan tidak mahal —
jalankan khusus proses `runner` di bawah Node, sisanya tetap Bun. Uji ini di jam
pertama P2, jangan setelah banyak kode tertulis di atasnya.

**Catatan agar tidak rancu:** kita memakai Biome untuk repo sendiri, tapi scorer
di §11.2 memakai `eslint-plugin-security` **untuk menilai kode buatan agent**.
Keduanya beda urusan dan tidak saling menggantikan.

### 15.4 Lapisan penyedia model

Karena akan berpindah dari model gratis ke berbayar di tengah jalan, jangan
pernah memanggil SDK penyedia langsung dari `runner.ts`.

```
runtime/providers/
├── types.ts        # antarmuka bersama: chat(), toolLoop()
├── gemini.ts
├── groq.ts
├── openrouter.ts
├── anthropic.ts
└── index.ts        # resolve tier + PROVIDER env → klien
```

`runner.ts` hanya tahu `modelTier`. Berpindah penyedia untuk ronde final cukup
satu variabel environment, tanpa menyentuh satu baris pun logika agent.

Ini juga menjaga §8.1 tetap benar: nama model konkret tidak pernah bocor ke dalam
manifest yang di-hash.

Satu hal yang harus ditangani lapisan ini sejak awal: **rate limit**. Bungkus
setiap penyedia dengan token bucket dan retry pada HTTP 429 dengan exponential
backoff. Di free tier ini bukan penyempurnaan, melainkan syarat agar pipeline
bisa berjalan sampai selesai.

### 15.2 Kenapa Astro

Astro bersinar untuk halaman statis, sementara empat layar kita interaktif — jadi
sekilas ia bukan pilihan alami. Yang membuatnya tetap layak adalah satu hal yang
sangat berharga saat demo:

**Astro bisa mem-build halaman hasil arena menjadi HTML statis dengan data yang
sudah tertanam di dalamnya.** Artinya kamu punya halaman demo yang tetap tampil
sempurna meski API mati, VPS bermasalah, atau wifi acara mengecewakan — tanpa
perlu menulis versi cadangan terpisah.

Layar Roster, Breed, dan Arena tetap butuh island React karena harus live.
Layar Family Tree dan halaman hasil final di-render statis.

Kalau di tengah jalan Astro terasa menghambat, Vite + React SPA adalah pengganti
yang setara cepatnya. Yang tidak boleh hilang adalah halaman hasil statisnya.

### 15.3 Struktur repo

```
meiosis/                     # Bun workspaces
├── contracts/                     # Foundry
│   ├── src/
│   │   ├── GeneLib.sol
│   │   ├── AgentRegistry.sol
│   │   ├── Genesis.sol
│   │   ├── Hatchery.sol
│   │   ├── SkillRegistry.sol
│   │   ├── Arena.sol
│   │   ├── LineageRoyalty.sol
│   │   └── adapters/ERC8004.sol
│   ├── test/                      # unit + fuzz + invariant
│   └── script/Deploy.s.sol  MintGenesis.s.sol
├── packages/shared/               # konstanta lokus, ABI, tipe — satu sumber kebenaran
├── runtime/
│   ├── genome/expand.ts           # HARUS deterministik
│   ├── genome/golden/             # 20 genome + manifestHash acuan
│   ├── materialize.ts
│   └── skills/                    # 12 modul
├── orchestrator/
│   ├── watcher.ts  queue.ts  runner.ts  submitter.ts  api.ts
├── sandbox/
│   ├── Dockerfile
│   ├── template/                  # kerangka proyek + lockfile
│   └── run.ts
├── arena/
│   ├── jobs/staking-landing/
│   ├── scorers/deterministic/     # build, security, axe, lighthouse, bundle
│   ├── scorers/judge/             # rubrik ter-hash, buta identitas
│   ├── fixtures/                  # keluaran beku untuk MOCK_LLM=1
│   └── report.ts
├── indexer/                       # bun:sqlite
├── web/                           # Astro + React islands
└── scripts/
    ├── gene-sim.ts                # 10k simulasi perkawinan — P0
    ├── demo-full.ts               # jalur MVP satu perintah
    └── seed-local.ts
```

**Jalur kritis:** `GeneLib.sol` → `runtime/genome/expand.ts` → `arena/scorers/`.

`packages/shared` wajib ada sejak awal: konstanta lokus dan `traitId` dipakai
kontrak, runtime, dan web sekaligus. Kalau ketiganya punya salinan sendiri,
ketiganya akan lepas sinkron dan bug-nya sangat sulit dilacak.

---

## 16. Konfigurasi & Environment

```bash
# chain
SEPOLIA_RPC_URL=              # penyedia utama
SEPOLIA_RPC_URL_FALLBACK=     # penyedia kedua, wajib
DEPLOYER_PRIVATE_KEY=         # LAPTOP SAJA
OPERATOR_PRIVATE_KEY=         # VPS saja
ETHERSCAN_API_KEY=

# model — satu variabel untuk berpindah penyedia
PROVIDER=gemini               # gemini | groq | openrouter | anthropic
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
ANTHROPIC_API_KEY=            # hanya untuk ronde final

# pemetaan tier → model, diselesaikan di providers/index.ts
TIER_STRONG=
TIER_BALANCED=
TIER_FAST=
JUDGE_TIER=balanced

# rate limit free tier
MAX_RPM=20
MAX_TPM=8000

# penyimpanan
WEB3_STORAGE_TOKEN=           # opsional; fallback simpan artefak di repo

# mode
MOCK_LLM=0                    # 1 = pakai fixture, tanpa panggilan API
CHAIN=sepolia                 # atau anvil
SANDBOX_TIMEOUT_MS=300000
SANDBOX_CONCURRENCY=2         # turunkan ke 1 jika VPS 4 GB
ARENA_RUNS_PER_AGENT=3
```

Alamat kontrak hasil deploy ditulis ke `deployments/<chain>.json` dan dibaca
semua komponen. Jangan pernah menempel alamat langsung di kode — saat demo kamu
akan redeploy, dan alamat yang tercecer di lima berkas adalah cara termudah
kehilangan 20 menit.

`.env` di VPS: `chmod 600`, dan pastikan `.env*` ada di `.gitignore` sejak commit
pertama, bukan setelah terlanjur ter-push.

---

## 17. Mode Pengembangan Lokal

Tanpa bagian ini, setiap iterasi membakar kredit API dan ETH faucet.

### 17.1 Anvil

```bash
anvil --block-time 2
bun run deploy:local && bun run seed:local
```

`--block-time 2` penting: commit–reveal butuh blok yang terus maju. Dengan
instant-mine, kehamilan tidak akan pernah matang tanpa `evm_mine` manual.

### 17.2 `MOCK_LLM=1`

Kembalikan artefak tersimpan dari `arena/fixtures/` alih-alih memanggil model.
Ini membuat seluruh alur — watcher, hatch, expand, sandbox, scorer, submit —
bisa diuji dalam hitungan detik.

Kumpulkan fixture dari run asli pertama yang berhasil, lalu bekukan. Tiga varian
per agent sudah cukup.

### 17.3 Kunci determinisme

Saat `MOCK_LLM=1`, seluruh pipeline harus deterministik ujung ke ujung. Jika
`bun run demo:full` dua kali di Anvil menghasilkan skor berbeda, ada kebocoran
non-determinisme yang wajib diburu sebelum lanjut.

### 17.4 Pembagian laptop vs VPS

| Fase | Jalan di mana | Alasan |
|---|---|---|
| P0–P2 | **Laptop** | Hanya Foundry + Bun + Anvil; semua sudah terpasang, Docker tidak dipakai |
| P3 ke atas | **VPS** | Butuh Docker untuk sandbox |
| Selamanya | Edit kode di laptop lewat VS Code Remote-SSH | Laptop cukup jadi klien tipis |

Sandbox bisa saja dijalankan di laptop lewat Docker di WSL2 tanpa Docker Desktop,
tapi jangan. Ronde arena akan membuat laptopmu tidak bisa dipakai apa-apa selama
setengah jam, dan itu setiap kali kamu ingin menguji sesuatu.

---

## 18. Strategi Pengujian

### 18.1 Kontrak

| Jenis | Yang diuji |
|---|---|
| Fuzz `GeneLib` | Setiap alel anak berasal dari salah satu alel parent, kecuali saat mutasi |
| Fuzz `GeneLib` | `relatedness(a,b) == relatedness(b,a)`; `relatedness(a,a) == 255` |
| Fuzz `express` | Alel `dominance` tertinggi selalu menang; seri diputus konsisten oleh seed |
| Unit `Hatchery` | `hatch()` sebelum `revealBlock` gagal |
| Unit `Hatchery` | `hatch()` setelah 256 blok gagal, lalu `reroll()` memulihkannya |
| Unit `Hatchery` | `hatch()` dua kali gagal |
| Unit `Hatchery` | Cooldown & pembayaran stud fee |
| Unit `Genesis` | `mintFounder` setelah `seal()` gagal |
| Invariant | Total suplai == jumlah founder + jumlah kelahiran |
| Unit `LineageRoyalty` | Kedalaman berhenti di 4; total terbagi tidak melebihi input |

### 18.2 Runtime — golden file

20 genome tetap di `runtime/genome/golden/`, masing-masing dengan `manifestHash`
acuan. CI gagal jika ada yang bergeser.

Ini pagar utama untuk aturan determinisme di §8. Jika sebuah perubahan prompt
memang disengaja, naikkan versi modul dan perbarui golden file dalam commit yang
sama — sehingga pergeserannya selalu terlihat di review.

### 18.3 Integrasi

Satu tes e2e di Anvil dengan `MOCK_LLM=1`: deploy → mint genesis → breed → maju
blok → hatch → expand → verifikasi `manifestHash` → jalankan arena → submit →
baca kembali skor dari chain. Inilah tes yang benar-benar menjaga MVP.

### 18.4 Yang sengaja tidak diuji

Kualitas keluaran model, tampilan web, dan performa. Waktu hackathon terbatas;
lindungi hal yang kalau rusak membatalkan klaim proyek, bukan hal yang kalau
rusak hanya terlihat jelek.

---

## 19. Deployment & Runbook

### 19.1 Urutan deploy kontrak

```bash
bun run deploy:sepolia      # semua kontrak → deployments/sepolia.json
bun run verify:sepolia      # verifikasi Etherscan — lakukan, juri mengeceknya
bun run registry:seed       # daftarkan 12 modul skill
bun run genesis:mint        # mint 4 founder ke 3 alamat berbeda
bun run genesis:seal        # kunci generasi nol — TIDAK BISA DIBATALKAN
```

Verifikasi Etherscan bukan hal kosmetik. `GeneLib` yang terverifikasi membuat
juri bisa membaca sendiri fungsi meiosis-nya — itu bukti terkuat yang kamu
punya bahwa genetikanya nyata.

**Sebelum `genesis:seal`, pastikan `gene-sim.ts` (§4.4) sudah dijalankan dan
angkanya memuaskan.** Setelah `seal()`, generasi nol tidak bisa diperbaiki.

### 19.2 Menjalankan sistem di VPS

```bash
bun run orchestrator        # watcher + api
bun run web                 # Astro
bun run arena:run --round staking-landing --agents 1,2,5
```

Jalankan sebagai systemd unit, bukan di dalam `tmux`. Watcher harus hidup lagi
otomatis setelah VPS reboot — kalau tidak, kehamilan lewat jendela 256 blok saat
kamu sedang tidur.

```ini
[Service]
ExecStart=/root/.bun/bin/bun run orchestrator
Restart=always
RestartSec=5
```

Caddy di depan untuk HTTPS, agar ada URL yang bisa dibuka juri.

### 19.3 Pemulihan saat demo

| Gejala | Tindakan |
|---|---|
| Kehamilan tidak menetas | `bun run hatch:force <pregnancyId>` |
| `blockhash` kedaluwarsa | `bun run reroll <pregnancyId>` |
| Tx tersangkut | `bun run tx:bump` |
| Arena macet | `bun run arena:replay --round <id>` dari artefak tersimpan |
| RPC mati | Ganti ke `SEPOLIA_RPC_URL_FALLBACK` |
| VPS tidak terjangkau | Buka halaman hasil statis hasil build Astro (§15.2) |

Siapkan **dua penyedia RPC** sejak awal. RPC publik Sepolia rutin melambat, dan
itu selalu terjadi di saat paling buruk.

---

## 20. Milestone & Jadwal

**Tenggat: Desember 2026. Kapasitas: satu developer.** Sekitar 70 jam kerja
tersebar di 11 minggu — kurang lebih 7 jam seminggu. Lapang, asalkan tidak
menganggur di depan lalu panik di belakang.

Jadwal berikut mengasumsikan tenggat **awal Desember**. Geser kalau tanggalnya beda.

| Fase | Periode | Isi | Jam | Selesai berarti |
|---|---|---|---|---|
| ~~**P0**~~ | ~~17–26 Sep~~ | Monorepo Bun, `packages/shared`, `GeneLib` + fuzz, `gene-sim.ts` | 8 | ✅ **SELESAI 17 Sep.** 50,1% anak mewarisi keduanya; 9 test hijau |
| ~~**P1**~~ | ~~29 Sep–10 Okt~~ | `AgentRegistry`, `Genesis`, `Hatchery`, `SkillRegistry` | 10 | ✅ **Kontrak selesai 17 Sep**, kelahiran terverifikasi di Anvil, 27 test hijau, gas kelahiran 119.636. Deploy Sepolia menunggu ETH faucet |
| ~~**P2**~~ | ~~13–24 Okt~~ | `expand()` + golden file + 12 modul skill + `materialize()` + lapisan penyedia | 10 | ✅ **SELESAI 17 Sep.** 36 test runtime, 20 berkas acuan, `manifestHash` cocok on-chain, tiga agent menjalankan tugas nyata lewat Groq |
| **P3** | 27 Okt–7 Nov | **Uji diskriminasi dulu (§22.2)**, lalu VPS, sandbox, scorer, judge, median 3 run | 14 | **Angka hybrid vigor nyata.** Ini titik balik proyek |
| **P4** | 10–21 Nov | Orkestrator, indexer, 4 layar web | 12 | Alur penuh berjalan dari browser tanpa sentuh terminal |
| **P5** | 24–28 Nov | `LineageRoyalty`, `closeRound`, adapter ERC-8004 | 8 | Pendapatan anak terbagi ke leluhur dalam satu tx |
| **P6** | 1–5 Des | 5–8 perkawinan, sebaran, latihan demo, rekaman cadangan | 8 | Skrip demo berjalan mulus dua kali berturut-turut |

**Beku dua minggu sebelum tenggat.** Sisanya untuk latihan dan perbaikan kecil,
bukan fitur baru.

### 20.1 Gerbang mutlak

Jangan maju sebelum DoD fase sekarang terpenuhi. Yang paling sering tergoda
dilewati adalah P0 — melewatinya berarti membangun seluruh proyek di atas fungsi
genetik yang belum terbukti benar, dan di atas genome founder yang belum pernah
disimulasikan.

**P3 adalah titik paling menentukan.** Jika di akhir 7 November angka hybrid
vigor belum ada, hentikan pengembangan fitur dan selesaikan itu dulu. Semua yang
sesudahnya hanya pembungkus.

### 20.2 Kalau ada waktu sisa

Dengan runway sampai Desember, ini realistis dikerjakan di November:

1. **Generasi kedua** — kawinkan anak dengan G2, tunjukkan `SECURITY_INSTINCT`
   resesif muncul kembali di cucu. Ini demo terkuat yang bisa kamu punya dan
   sesuatu yang tidak bisa ditiru sistem non-genetik.
2. **ERC-8004 sungguhan**, bukan sekadar adapter.
3. **x402** untuk pembayaran antar agent.

Kerjakan berurutan. Nomor 1 jauh lebih bernilai daripada dua lainnya digabung.

### 20.3 Pembagian tim bertiga

Kamu satu-satunya developer, jadi seluruh tabel di atas milikmu. Dua rekan lain
tetap punya pekerjaan yang benar-benar berguna dan tidak butuh ngoding:

| Siapa | Tugas | Kapan |
|---|---|---|
| Rekan A | Memanen ETH faucet dari akun sendiri (§12.2) | Mencicil dari sekarang |
| Rekan A | Menulis & menyunting `spec.md` job arena | Sebelum P3 |
| Rekan B | Menilai buta keluaran arena untuk kalibrasi rubrik | Selama P3 |
| Rekan B | Deck pitch, rekaman video cadangan | November |
| Keduanya | Menonton latihan demo dan menyerang dengan pertanyaan juri | Desember |

Tugas Rekan B saat P3 lebih penting dari kelihatannya: kamu tidak bisa menilai
sendiri apakah rubrikmu adil terhadap keluaran agentmu sendiri.

---

## 21. Dial Cakupan

Jadwal §20 punya kelonggaran, tapi kalau tertinggal, pangkas dengan urutan ini.

**Urutan pemangkasan, dari yang paling aman dilepas:**
polish UI → royalti (P5) → orkestrator otomatis (jalankan via CLI) → indexer →
jumlah run arena (3 → 1) → jumlah modul skill (12 → 6).

**Yang tidak boleh dilepas dalam keadaan apa pun:** `GeneLib` beserta fuzz
test-nya, determinisme `expand()`, dan minimal satu perbandingan arena yang
jujur. Itu seluruh proyek.

### Periksa di tanggal ini

| Tanggal | Pertanyaan | Kalau jawabannya tidak |
|---|---|---|
| 26 Sep | `gene-sim` sudah menunjukkan angka bagus? | Perbaiki genome founder. Jangan deploy dulu |
| 10 Okt | Sudah ada anak lahir di Sepolia? | Pangkas modul skill jadi 6, kejar P2 |
| 31 Okt | Uji diskriminasi lolos dengan model gratis? | Anggarkan model berbayar untuk semua ronde skoring |
| 7 Nov | Angka hybrid vigor sudah ada? | **Hentikan semua fitur.** Buang P5, kerjakan ini saja |
| 21 Nov | Alur penuh jalan dari browser? | Lepas orkestrator otomatis, demokan lewat CLI |

Tanggal 7 November adalah yang paling penting di tabel ini. Jika lewat tanpa
angka, sisa waktu habis untuk mengejar dan tidak ada ruang untuk latihan demo.

---

## 22. Anggaran

### 22.1 Strategi model gratis

Rencananya dua tahap: **gratis untuk membangun, berbayar hanya untuk ronde final.**

Selama P0–P2 kualitas keluaran model sama sekali tidak penting — yang diuji
adalah pipa saluran, bukan kualitas landing page. Free tier lebih dari cukup, dan
`MOCK_LLM=1` menutup sisanya.

#### Pilihan free tier (September 2026)

| Penyedia | Batas | Cocok untuk |
|---|---|---|
| **Gemini Flash** | Model Flash generasi kini gratis tanpa kartu; batasnya tidak lagi dipublikasikan dan hanya terlihat di AI Studio | **Builder.** Konteks besar, batas paling longgar |
| **Groq** | 30 RPM, 1.000 RPD, 8.000 TPM — dan **OTPM per model**, lihat di bawah | Builder & judge, asal modelnya tepat |
| **OpenRouter** | 20 RPM, **50 RPD** — naik ke 1.000 RPD setelah sekali beli kredit $10 | Cadangan & variasi model |

#### Yang membatasi bukan RPM, melainkan TPM

Ini perhitungan yang menentukan dan mudah terlewat. Satu eksekusi agent adalah
loop agentik dengan pemanggilan tool, jadi sekitar **20–50 request**, dan
konteksnya membesar di tiap langkah. Satu ronde penuh = 9 eksekusi ≈ **200–450 request**.

Akibatnya:

- **OpenRouter free 50 RPD tidak cukup untuk satu eksekusi pun.** Kalau mau
  memakainya, beli kredit $10 sekali agar naik ke 1.000 RPD.
- **Yang benar-benar mengikat adalah OTPM per model, dan itu tidak sama untuk
  semua model.** Diukur 17 Sep: `qwen/qwen3.8-27b` dibatasi **1.000 token
  keluaran per menit**, sedangkan `openai/gpt-oss-20b` dan `openai/gpt-oss-120b`
  tidak kena batas itu sampai 6.000 token sekali pun.
- Yang membuatnya berbahaya: request yang perkiraan keluarannya melampaui OTPM
  **ditolak langsung dengan 429**, bukan diantrekan. Rate limiter tidak dapat
  menolongmu; yang bisa hanyalah menurunkan `max_tokens`. Satu landing page butuh
  1.500-3.000 token keluaran, jadi qwen sama sekali tidak terpakai untuk tugas ini.
- Maka pemetaan tier memakai **gpt-oss-120b untuk strong dan balanced,
  gpt-oss-20b untuk fast**. Tier fast dan balanced memang jadi berdekatan; itu
  keterbatasan penyedia, dan ia hidup di konfigurasi penyedia, bukan di genome.
- Clamp `max_tokens` dilakukan di lapisan penyedia dan dicatat di kuitansi run.
  Menurunkan angka di genome demi menuruti batas free tier akan mengubah
  `manifestHash` setiap agent yang pernah lahir — persis yang dicegah §8.1.

Tanpa token bucket dan retry 429 di §15.4, pipeline akan gagal di tengah ronde
dan kamu kehilangan seluruh hasilnya. Bangun itu di P2, bukan saat sudah kepepet.

Satu catatan kecil: konten yang dikirim ke free tier Gemini dapat dipakai untuk
meningkatkan produk mereka. Untuk proyek hackathon yang kodenya memang akan
dipublikasikan, ini tidak jadi soal — tapi tahu lebih dulu selalu lebih baik.

### 22.2 Kapan harus mulai membayar

Di sinilah risiko terbesarnya, dan sudah masuk §24.

**Hybrid vigor bergantung pada kepatuhan model terhadap system prompt.** Modul
skill di genome bekerja dengan cara menyuntikkan instruksi berbeda ke tiap agent.
Model yang lemah mengikuti system prompt secara kurang konsisten — sehingga
perbedaan antara G0 dan G1 ikut mengabur, dan skor ketiganya mengumpul di rentang
yang sama. Klaim utamamu gagal bukan karena genetikanya salah, tapi karena
modelnya tidak cukup patuh untuk menunjukkannya.

Maka jadwalkan **uji diskriminasi** di awal P3, sebelum membangun sisa arena:

```
Jalankan G0 dan G1 pada job kandidat memakai model gratis, 3 run masing-masing.
Lihat apakah skor keduanya terpisah jelas di lokus yang seharusnya membedakan.

terpisah   → lanjut dengan model gratis, hemat penuh
mengumpul  → beralih ke model berbayar untuk semua ronde skoring
```

Uji ini murah dan menjawab pertanyaan yang menentukan seluruh anggaranmu.

### 22.2a Hasil uji diskriminasi pertama — 17 Sep 2026

Dijalankan lebih awal dari jadwal, n=1 per agent, penyedia Groq free tier.

| Agent | Deterministik | Judge | Total |
|---|---|---|---|
| G0 Solidity Smith | 61,4/70 | 23/30 | **79,4** |
| G1 Pixel Sense | 64,2/70 | 21/30 | **85,2** |
| Anak G0 × G1 | 61,1/70 | 23/30 | **84,1** |

**Sebaran 5,8 poin — di bawah ambang 8. Verdict: MENGUMPUL.**

Dan lebih penting: **anak tidak mengungguli kedua parent.** Ia di antara
keduanya, dan G1 memimpin.

Yang lebih mengganggu adalah arahnya. G0 membawa `security-instinct-high` tapi
mendapat **6/10** pada ketahanan input, sementara G1 yang sama sekali tidak
membawa modul keamanan mendapat **8/10**. G0 juga membawa `aesthetic-plain` tapi
skor desainnya 11,7 — tidak jauh di bawah G1 yang 13,8. Pengaruh genome terlihat,
tapi lemah dan tidak konsisten dengan arah yang diprediksikan.

Ini risiko §22.2 yang benar-benar terjadi: **model gratis tidak cukup patuh pada
system prompt untuk membuat perbedaan genome terlihat jelas di keluaran.**

Catatan penting sebelum menarik kesimpulan: ini n=1. Median tiga run dapat
mengubah gambarannya, dan itu memang yang diwajibkan §11.3. Sebelum menyimpulkan
model gratis tidak memadai, jalankan ulang dengan RUNS=3 lalu ulangi sekali lagi
dengan model berbayar dan bandingkan sebarannya — itulah cara membedakan
"modelnya kurang patuh" dari "jobnya kurang membedakan", persis seperti di §24.

### 22.2c Sebaran 8 anakan — 17 Sep 2026

Delapan anak dari G0 × G1 dengan seed berbeda, plus kedua induk, satu run
masing-masing di sesi yang sama.

```
G0 Solidity Smith   83,8
G1 Pixel Sense      88,2
─────────────────────────
Anak 4              86,9
Anak 5              82,9
Anak 1              79,6
Anak 6              79,4
Anak 2              78,9
Anak 8              78,4
Anak 3              72,5
Anak 7              gagal di gerbang
```

**0 dari 7 anak melewati kedua induk. 6 dari 7 di bawah keduanya.**
Rata-rata anak 79,8 — di bawah G0 maupun G1.

Ini bukan sekadar "belum terbukti". Ini kebalikan dari hybrid vigor, dan dengan
n=8 ia jauh lebih meyakinkan daripada hasil n=1 dan n=3 sebelumnya. Penyebabnya
ditelusuri ke tiga kesalahan rancangan, semuanya milik kita sendiri.

#### 1. `stack-solidity` adalah beban, bukan bekal

Job arena adalah landing page React. G0 membawa modul `stack-solidity` yang
memerintahkan "bangun dengan Solidity dan Foundry". Anak yang mewarisinya
menerima instruksi yang sama sekali tidak relevan dengan tugasnya.

| anak | n | rata-rata |
|---|---|---|
| mewarisi `stack-react` | 2 | **84,9** |
| mewarisi `stack-solidity` | 5 | **77,8** |

Selisih 7,1 poin, dan itu menjelaskan hampir seluruh defisit anakan.

Hybrid vigor mensyaratkan spesialisasi kedua induk sama-sama berguna untuk
tugasnya. Mengawinkan spesialis Solidity dengan spesialis React lalu memberi
tugas React bukan menguji hibrida — ia hanya mengencerkan induk yang cocok.

#### 2. Modul keamanan dan metrik keamanan mengukur hal berbeda

| baris | G0 | G1 | anak |
|---|---|---|---|
| inputRobustness | **4,0** | **8,0** | 6,0 |

G0 membawa `security-instinct-high`; G1 tidak membawa modul keamanan sama
sekali. Hasilnya terbalik dari yang diharapkan.

Sebabnya: prompt `security-instinct-high` seluruhnya berbicara tentang XSS,
`eval`, dan rahasia di klien. Sementara `inputRobustness` mengukur ketahanan
formulir — validasi angka, batas nilai, state galat, tombol nonaktif. Keduanya
tidak beririsan.

Yang justru menghasilkan poin itu adalah `discipline-design` milik G1, yang
memuat kalimat "rancang juga keadaan kosong, memuat, dan galat". Metriknya
mengukur dengan benar; modulnya yang tidak mengajarkan hal yang diukur.

#### 3. `designQuality` tidak membedakan estetika sama sekali

| baris | G0 (`aesthetic-plain`) | G1 (`aesthetic-high`) |
|---|---|---|
| designQuality | **13,9** | **13,8** |

G0 diperintahkan secara eksplisit untuk TIDAK menghabiskan usaha pada penghalusan
visual, dan tetap menyamai G1. Skala tipografi, jumlah warna, dan ritme spasi
ternyata dihasilkan model mana pun secara wajar, jadi metrik ini mengukur
kompetensi dasar, bukan trait yang dimaksud.

#### Yang harus diperbaiki sebelum ronde berikutnya

1. **Selaraskan founder dengan job.** Untuk job React, G0 seharusnya spesialis
   keamanan dan korektness *di React*, bukan di Solidity. Atau tambahkan job
   Solidity supaya `stack-solidity` punya arena tempat ia berguna.
2. **Selaraskan modul dengan metrik.** Perluas `security-instinct-high` agar
   mencakup validasi masukan tak tepercaya pada formulir — itu memang bagian
   dari insting keamanan, dan itulah yang diukur.
3. **Buat `designQuality` benar-benar membedakan.** Ukur hal yang hanya muncul
   bila estetika digarap sungguh-sungguh, bukan yang muncul dari kompetensi dasar.

Ketiganya membuat hasil ronde berikutnya tidak bisa dibandingkan langsung dengan
yang ini. Itu wajar dan harus dinyatakan: ini ronde kalibrasi, bukan ronde bukti.

### 22.2b Perkiraan biaya

| Pos | Perkiraan |
|---|---|
| P0–P2 (free tier + `MOCK_LLM=1`) | **Rp 0** |
| Kalibrasi & ronde final berbayar, ~40 eksekusi | **US$20–80** (±Rp 350rb–1,3jt) |
| VPS, 6 minggu dari akhir Oktober | **Rp 100–180 ribu** |
| Gas Sepolia | Rp 0 |
| Penyimpanan artefak | Rp 0 |

Turun dari perkiraan awal US$150–400 menjadi **US$20–80**, semata karena
pengembangan tidak lagi memakai model berbayar.

Kalau uji diskriminasi lolos dengan model gratis, angka itu bisa mendekati nol —
tapi jangan merencanakan seolah pasti lolos.

### 22.3 Gas

Sepolia gratis; biayanya hanya waktu mengumpulkan ETH faucet (§12.2).

### 22.4 Penyimpanan

Artefak per ronde beberapa MB. Gratis di tingkat layanan mana pun. Fallback:
simpan artefak di repo dan tetap catat hash-nya on-chain — klaim verifiability
tidak bergantung pada IPFS, hanya pada hash yang bisa dicocokkan.

**Total di luar biaya model: sekitar Rp 400–700 ribu.**

---

## 23. Skrip Demo

Enam menit. Urutannya disusun agar bagian paling berisiko terjadi lebih awal,
saat masih ada waktu untuk pulih.

| Waktu | Isi | Cadangan |
|---|---|---|
| 0:00–0:40 | **Masalah.** Agent hari ini dibangun satu per satu dengan tangan. Tidak ada cara mewariskan kemampuan, tidak ada pasar untuk agent yang terbukti bagus. | — |
| 0:40–1:20 | **Konsep.** Tunjukkan genome sebagai bit di Etherscan. Perlihatkan `GeneLib.meiosis` yang sudah terverifikasi. | — |
| 1:20–2:30 | **Live: breed.** Klik di UI, tx masuk, kehamilan mulai menghitung mundur blok. | Kehamilan yang sudah disiapkan sebelumnya, tinggal `hatch()` |
| 2:30–3:00 | **Live: hatch.** Anak lahir. Tunjukkan trait yang diwarisi dari masing-masing parent, dan verifikasi `manifestHash`. | Anak yang sudah menetas sebelumnya |
| 3:00–4:30 | **Arena.** Tabel skor ketiganya. Bongkar komponen skor — tunjukkan 70 poin deterministiknya. Tunjukkan grafik sebaran seluruh anakan. | Sudah dihitung sebelumnya; ini memang bukan live |
| 4:30–5:15 | **Ekonomi.** Satu tx: anak dibayar, royalti mengalir ke pemilik kedua parent. Tunjukkan di Etherscan. | Tx yang sudah dieksekusi, ditampilkan dari riwayat |
| 5:15–6:00 | **Batas & jalan ke depan.** Katakan terus terang apa yang attested dan apa yang trustless. ERC-8004, smart account per agent, x402. | — |

### Aturan demo

- **Jangan menjalankan model secara live.** Eksekusi agent butuh menit dan bisa
  gagal. Arena ditampilkan dari hasil yang sudah dihitung, dengan CID yang bisa
  diperiksa — dan katakan begitu apa adanya.
- **Yang live hanya transaksi chain.** Cepat, visual, dan itulah bagian yang
  benar-benar tak bisa dipalsukan.
- **Rekam video cadangan penuh** sehari sebelumnya. Wifi acara akan mengecewakanmu.
- **Segmen 5:15 adalah yang paling menentukan.** Tim yang jujur soal batasan
  sistemnya hampir selalu dinilai lebih tinggi daripada yang mengklaim serba
  trustless lalu tidak bisa menjawab pertanyaan lanjutan.

---

## 24. Risiko

| Risiko | Dampak | Penanganan |
|---|---|---|
| `expand()` tidak deterministik | Klaim verifiability runtuh total | `manifestHash` on-chain + golden file di CI |
| Anak kalah dari kedua parent | Klaim utama gagal di panggung | `gene-sim` di P0; 5–8 anakan; tampilkan sebaran apa adanya (§4.3, §11.3b) |
| Job tidak diskriminatif | Ketiga agent skor mirip, tidak ada yang terbukti | Kalibrasi dengan G0 & G1 sebelum P3 selesai (§11.1) |
| Genome founder terlalu seragam | Anak nyaris tidak bervariasi | `gene-sim.ts` **sebelum** `seal()` (§4.4, §19.1) |
| Momentum hilang karena tenggat jauh | Panik di November | Tanggal periksa di §21; gerbang DoD §20.1 |
| `blockhash` kedaluwarsa | Agent tersangkut selamanya | `reroll()` wajib ada sejak P1; watcher sebagai systemd (§19.2) |
| Gene grinding | Genetika bisa dicurangi | Commit–reveal, sudah masuk desain |
| **Model gratis tidak cukup patuh system prompt** | Skor ketiga agent mengumpul, klaim utama gagal | Uji diskriminasi di awal P3 (§22.2); siapkan dana untuk ronde final |
| Rate limit free tier menggagalkan ronde di tengah | Kehilangan seluruh hasil ronde | Token bucket + retry 429 di §15.4, dibangun di P2 |
| TPM Groq terlalu sempit untuk builder | Throttle parah, ronde tidak selesai | Builder di Gemini, judge di Groq (§22.1) |
| Agent SDK tidak jalan di Bun | Blokir di awal P2 | Uji di jam pertama P2; cadangan: `runner` di Node (§15.1) |
| VPS 4 GB kena OOM saat Lighthouse | Kegagalan acak yang sulit dilacak | Ambil 8 GB; atau `SANDBOX_CONCURRENCY=1` |
| Operator key bocor dari VPS | Terbatas pada tx testnet | `DEPLOYER` tidak pernah ke VPS (§12.1) |
| Sandbox lolos isolasi | Kode buatan mesin berjalan di host | `--network none`, non-root, tanpa mount host, tanpa rahasia |
| ETH faucet tidak cukup | Tidak bisa deploy atau demo | Tiga orang memanen paralel, mencicil dari sekarang |
| RPC Sepolia melambat | Demo tersendat di momen terburuk | Dua penyedia RPC sejak awal |
| Biaya API membengkak | Kehabisan kredit sebelum ronde final | `MOCK_LLM=1`; ukur biaya di ronde pertama P3 |
| Standar ERC-8004 bergeser | Adapter tidak kompatibel | Isolasi di `adapters/`, verifikasi versi sebelum P1 |
| Konstanta lepas sinkron antar paket | Bug halus yang sulit dilacak | `packages/shared` sebagai satu-satunya sumber kebenaran |

Empat risiko teratas adalah yang benar-benar bisa menggagalkan proyek. Sisanya
merepotkan, bukan mematikan.

Perhatikan bahwa dua di antaranya — job tidak diskriminatif dan model tidak cukup
patuh — punya gejala yang **persis sama**: skor ketiga agent mengumpul. Kalau itu
terjadi, uji dulu mana penyebabnya dengan menjalankan job yang sama di model
berbayar. Kalau skornya langsung terpisah, penyebabnya model; kalau tetap
mengumpul, jobnya yang perlu diganti.

Satu risiko yang khas tenggat panjang dan sering diremehkan: **kehilangan
momentum**. Tiga bulan terasa lama sampai tiba-tiba tinggal dua minggu. Tanggal
periksa di §21 ada untuk itu.

---

## 25. Yang Masih Terbuka

Sudah terjawab: tenggat Desember, satu developer dari tim bertiga, stack Bun +
Astro + Foundry, eksekusi di VPS.

Yang tersisa:

1. **Tanggal persis tenggat Desember** — jadwal §20 mengasumsikan awal Desember. Kalau ternyata pertengahan atau akhir, ada ruang tambahan untuk §20.2.
2. **Nama hackathon & syarat sponsor** — kalau ada integrasi wajib (ERC-8004, x402, penyedia RPC tertentu), lebih baik diketahui sebelum P1.
3. **Kriteria penilaian resmi** — bobot ke inovasi teknis berarti perkuat P0–P3; bobot ke kelengkapan produk berarti P4 naik prioritas.
4. **Penyedia VPS** — Hetzner Singapura atau lokal seperti Biznet. Tidak mendesak sampai akhir Oktober.
5. **Penyimpanan skill module** — IPFS atau cukup hash dari repo. Repo lebih sederhana dan tidak melemahkan klaim apa pun.
6. **Token sendiri** — rekomendasi tegas: **jangan**. Menambah permukaan pertanyaan tanpa memperkuat satu pun dari tiga klaim.
