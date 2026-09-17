# Menambah agent baru

Ada dua hal berbeda yang sama-sama disebut "menambah agent", dan keduanya
ditempuh dengan cara yang sangat berbeda.

---

## 1. Menambah agent ke jaringan yang sedang berjalan → kawinkan

**Ini satu-satunya cara, dan memang disengaja.**

Setelah `Genesis.seal()` dipanggil, generasi nol terkunci selamanya dan tidak ada
agent baru yang bisa dicetak dari luar. Semua agent sesudahnya harus lahir dari
dua induk yang sudah ada.

Alasannya bukan kerumitan demi kerumitan: seluruh klaim proyek ini bergantung
pada setiap agent punya asal-usul yang bisa dibuktikan. Kalau agent bisa muncul
begitu saja dengan genome apa pun, silsilah kehilangan arti, royalti leluhur
tidak punya dasar, dan "terbukti sah keturunan kedua induknya" jadi kalimat
kosong.

Lewat UI: tab **Kawinkan** → pilih dua induk → Kawinkan → tunggu 5 blok → Tetaskan.

Lewat CLI:

```bash
bun run demo:local        # satu siklus penuh
```

Trait anak tidak bisa kamu tentukan. Yang bisa kamu kendalikan adalah **memilih
induknya**, dan itulah seluruh permainannya — persis seperti peternak memilih
indukan.

---

## 2. Menambah JENIS agent baru → modul skill, lalu founder baru

Kalau yang kamu mau adalah kemampuan yang belum ada di gene pool sama sekali —
misalnya agent penulis dokumentasi, agent data, atau agent Rust — itu bukan soal
mengawinkan, melainkan memperluas katalog.

### 2a. Tambah modul skill

Satu modul = satu direktori di `runtime/skills/`:

```
runtime/skills/stack-rust/
├── module.json
└── prompt.md
```

```json
{
  "locus": 3,
  "traitId": 4,
  "name": "stack-rust",
  "version": "1.0.0",
  "mcpTools": ["filesystem", "bash"]
}
```

`prompt.md` berisi potongan instruksi yang akan disusun jadi system prompt.

Dua aturan yang tidak bisa dilanggar:

- **`traitId` harus di dalam jangkauan lokusnya.** Jumlah trait sah per lokus
  ada di `GeneLib.TRAIT_COUNTS` (Solidity) dan `TRAIT_COUNTS` (TypeScript).
  Lokus 3 `STACK_AFFINITY` hanya punya 4 slot (0–3), jadi menambah trait ke-5
  berarti mengubah konstanta itu **di kedua tempat sekaligus**.
- **Satu `(lokus, traitId)` hanya boleh dimiliki satu modul.** Katalog akan
  menolak kalau ada dua yang mengklaim slot sama.

Setelah menambah modul:

```bash
bun run gen-golden        # manifestHash berubah, berkas acuan diperbarui
bun test runtime/         # harus hijau lagi
```

Golden test akan merah sebelum `gen-golden` dijalankan. Itu memang tujuannya —
setiap perubahan yang menggeser `expand()` harus terlihat di review, bukan
lewat diam-diam.

### 2b. Tambah atau ubah founder

Genome founder dirancang tangan di `packages/shared/src/founders.ts`:

```ts
export const G4_RUST_SMITH = buildGenome([
  L(A(2, 1), A(2, 1)), // L0  tier balanced
  L(A(3, 1), A(3, 1)), // L1  code
  ...
  L(A(2, 4), A(0, 1)), // L3  rust dominan, react resesif
]);
```

`A(dominance, traitId)` membuat satu alel, `L(x, y)` menggabungkan dua alel jadi
satu lokus. Dominansi 0–3; yang tertinggi menang saat ekspresi, dan alel
dominansi 0 hanya muncul bila lawannya juga 0 — itulah cara membuat trait
tersembunyi yang melompat generasi.

**Sebelum deploy, wajib simulasi dulu:**

```bash
bun run gene-sim
```

Ini menjalankan 10.000 perkawinan dan melaporkan sebarannya. Kalau angkanya
jelek, perbaiki genome founder sekarang — setelah `seal()` dipanggil, generasi
nol tidak bisa diperbaiki lagi.

### 2c. Deploy ulang

Di chain lokal, cukup klik **Deploy & mint generasi nol** lagi di UI. Kontrak
baru dibuat dan founder baru di-mint.

`Genesis.MAX_FOUNDERS` saat ini 4. Kalau butuh lebih, ubah konstanta itu di
`contracts/src/Genesis.sol` dan sesuaikan `server/api.ts` yang memanggil
`mintFounder` empat kali.

---

## Yang menentukan agent bisa apa

| Ingin | Ubah |
|---|---|
| Agent lebih gigih memperbaiki kodenya | Lokus 14 `PERSISTENCE` → `maxSteps` |
| Agent boleh menulis berkas | Lokus 8 `TOOL_TIER` ≥ standard |
| Agent boleh menjalankan build sendiri | `TOOL_TIER` = full, atau `MCP_SET_A` memuat build |
| Agent menjawab lebih panjang | Lokus 11 `VERBOSITY` |
| Agent lebih berani/kreatif | Lokus 13 `CREATIVITY` → temperature |

Pemetaan lengkapnya ada di `runtime/genome/expand.ts` dan `runtime/tools/index.ts`.

---

## Menambah tool baru

Tool hidup di `runtime/tools/index.ts`. Satu tool butuh `spec` berisi JSON Schema
dan sebuah `run()`:

```ts
run_tests: {
  spec: {
    name: "run_tests",
    description: "Jalankan test suite dan kembalikan hasilnya.",
    parameters: { type: "object", properties: {} },
  },
  async run(_a, ctx) { /* … */ },
}
```

Lalu tentukan siapa yang boleh memakainya di `toolsFor()`. Gerbangnya sebaiknya
dikaitkan ke lokus genome, bukan ke konfigurasi global — kalau setiap agent
mendapat tool yang sama, lokus `TOOL_TIER` kembali kehilangan arti.
