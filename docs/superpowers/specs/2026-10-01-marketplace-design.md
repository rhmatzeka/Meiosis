# Marketplace agent (bagian A)

Tanggal: 2026-10-01 · Status: disetujui (percakapan) · Lanjutan: bagian B, perlindungan prompt & Claude Code berbayar

## 1. Tujuan

Meiosis berubah dari "tempat mengawinkan empat founder" menjadi **pasar agent**:
siapa pun bisa **membuat** agent (Studio), **mengawinkan**, **menjual**, dan
**menyewakan** agent-nya, dan orang lain **membayar** untuk memakainya.
Orang awam harus bisa melakukan semuanya tanpa membaca dokumen teknis.

### Kriteria berhasil

1. Orang baru (login Google) bisa: membuat agent di Studio → memasangnya untuk
   dijual/disewa → orang lain membeli atau menyewa → penghasilan muncul di Dompet.
2. Setiap pemakaian agent milik orang lain di web dibayar; uangnya ke pemilik,
   leluhur, dan platform sesuai tabel §2.
3. Aturan Studio dipaksakan di kontrak, bukan di UI.
4. Halaman **Panduan** menjelaskan seluruh alur dalam bahasa sehari-hari.
5. Semua yang sudah ada tetap jalan (kawin, keeper, faucet, ekspor, MCP).

## 2. Alur uang

| Aksi | Pembayar | Tujuan uang |
|---|---|---|
| Rancang di Studio | pembuat, `studioFee` (bawaan 0.002 ETH) | kas platform |
| Kawin berbayar | pengawin, tarif pemilik (sudah ada) | `LineageRoyalty.pay`: leluhur lalu pemilik |
| Sewa per tugas | penyewa, harga sewa agent | 2,5% platform; sisanya `LineageRoyalty.pay` |
| Jual-beli | pembeli, harga jual | 2,5% platform; sisanya `LineageRoyalty.pay` (leluhur, lalu penjual), agent pindah |

Harga sewa efektif = `rentPrice(id)` bila pemilik memasangnya, selain itu
`RUN_PRICE_ETH` server (bawaan platform). Pemilik memakai agent-nya sendiri
gratis (tetap dibatasi jatah per jam). Di chain lokal tanpa login, pembayaran
dilakukan akun demo seperti biasa.

`.md` publik tetap tersedia di bagian A; bagian B menggantinya dengan `.md`
"remote" dan `.md` lengkap ber-watermark khusus pemilik.

## 3. Kontrak baru

### 3.1 `Studio.sol`

```solidity
struct Design { uint8 tier; uint8 discipline; uint8 stack; uint8 verbosity; uint8 talentA; uint8 talentB; }
function create(Design calldata d, string calldata name, uint64 manifestHash) external payable returns (uint64 id);
function preview(Design calldata d) external pure returns (uint256 genome);
function setFee(uint256) external onlyOwner;  function withdrawFees() external onlyOwner;
mapping(uint64 => bool) public designed;
```

Validasi (revert `BadDesign`):
- `tier` ∈ {0 cepat, 1 seimbang}: otak kuat hanya lewat keturunan.
- `discipline` ∈ 0..5, `stack` ∈ 0..3, `verbosity` ∈ 0..2.
- `talentA`, `talentB` ∈ {4 estetika, 5 tes, 6 keamanan, 14 ketekunan, 255 = tidak ada},
  dan tidak boleh sama kecuali keduanya 255.

Genome: setiap lokus homozigot (alel X = Y) dengan **dominansi 1**, sehingga
kalah dari alel founder berdominansi 2–3 saat dikawinkan:

| Lokus | Nilai |
|---|---|
| 0 otak | `tier` |
| 1 keahlian utama | `discipline` |
| 2 keahlian kedua | 0 (serba bisa) |
| 3 stack | `stack` |
| 4, 5, 6, 14 | 2 (tinggi) bila dipilih sebagai bakat, selain itu 1 (sedang) |
| 7 dokumentasi, 12 keberanian, 13 kreativitas | 1 |
| 8 perkakas | 1 (standar) |
| 9 akses build & berkas | 3 (build + berkas) |
| 10 akses web & data | 0 |
| 11 gaya bicara | `verbosity` |
| 15 cadangan | 0 |

Alur `create`: bayar ≥ `fee` (kelebihan dikembalikan) → `registry.mint` ke
Studio sendiri (generasi 0, tanpa induk) → `setName` (bila tidak kosong) dan
`setManifestHash` selagi Studio pemiliknya → `transferFrom` ke pembuat →
`designed[id] = true`, emit `Designed`. Studio mengimplementasikan
`IERC721Receiver`. Deploy memanggil `registry.setMinter(studio, true)`.

Fungsi yang sama ditulis di TypeScript (`packages/shared/src/studio.ts`,
`studioGenome(d)`); kesamaan keduanya diuji dengan vektor bersama.

### 3.2 `Market.sol`

```solidity
function list(uint64 id, uint256 price) external;      // pemilik; Market harus di-approve
function cancel(uint64 id) external;                    // penjual atau pemilik sekarang
function buy(uint64 id) external payable;
function setRentPrice(uint64 id, uint256 price) external; // pemilik; 0 = pakai harga bawaan platform
function rent(uint64 id, bytes32 job) external payable;   // bayar satu tugas
function listingOf(uint64 id) external view returns (address seller, uint256 price, bool valid);
uint16 public feeBps = 250; function withdrawFees() external onlyOwner;
```

- `list`: revert `NotOwner`, `ZeroPrice`, `NotApproved` (butuh `approve` atau
  `setApprovalForAll` ke Market).
- `buy`: revert `NotListed`, `StaleListing` (pemilik sudah bukan penjual),
  `OwnListing`, `InsufficientPayment`. Urutan: hapus listing & `rentPrice` →
  biaya platform → `royalty.pay{value: harga − biaya}(id, "SALE")` (dikreditkan
  selagi penjual masih pemilik) → `safeTransferFrom(penjual, pembeli)` →
  kembalikan kelebihan. `nonReentrant`.
- `rent`: `msg.value > 0` dan ≥ `rentPrice[id]`; 2,5% platform, sisanya
  `royalty.pay(id, "RENT")`; emit `Rented(id, payer, amount, job)`.

## 4. Server

- `deployAll`: deploy Studio & Market, `setMinter(studio)`, `STUDIO_FEE_ETH`,
  `MARKET_FEE_BPS`. `Deployment` bertambah `studio`, `market`.
- `/api/agents` per agent: `sale: { price, seller } | null` (hanya listing
  sah), `rentPriceWei`, `designed`.
- `/api/tx` aksi baru: `studioCreate {design, name}` (server menghitung
  manifestHash dari `studioGenome`), `approveMarket`, `list {id, priceEth}`,
  `cancelListing {id}`, `buy {id}`, `setRentPrice {id, priceEth}`,
  `rent {id, job}`. `/api/local-act` mendukungnya untuk akun demo.
- `GET /api/studio/preview?d=...` → genome, sifat, dan biaya.
- `/api/run`: untuk tiap agent yang bukan milik peminta dan harga efektifnya
  > 0, wajib bukti `Rented` di tx yang dikirim (agent, jumlah ≥ harga, job
  belum dipakai). Menggantikan pemeriksaan `Paid` lama.

## 5. Tampilan

- **Navigasi**: Pasar · Studio · Kawinkan · Beri tugas · Silsilah · Panduan
  (desktop). Ponsel: Pasar, Studio, Kawinkan, Tugas, Dompet. Arena pindah ke
  tautan di Pasar dan kaki halaman. `/koleksi` dialihkan ke `/pasar`.
- **Beranda**: tiga pintu (Buat agent, Kawinkan, Cari & pakai agent) + Panduan.
- **Pasar** (`/pasar`): tab Semua / Dijual / Bisa disewa / Bisa dikawinkan /
  Milikku, urutan Terbaru / Termurah / Terlaris, pencarian. Kartu menampilkan
  harga jual, sewa, dan kawin.
- **Studio** (`/studio`): pilihan di kiri (keahlian, stack, gaya bicara, dua
  bakat, otak), pratinjau langsung di kanan (sel, pita genome, sifat), nama,
  biaya, tombol "Buat agent". Setelah jadi → halaman agent.
- **Halaman agent**: Beli (bila dijual), Sewa untuk tugas, Kawinkan dengan…,
  Bawa pulang; pemilik: Jual (dua langkah: izinkan Pasar, pasang harga),
  Batal jual, Harga sewa, dan yang sudah ada.
- **Beri tugas**: harga per agent terlihat; pembayaran lewat `Market.rent`.
- **Dompet**: penghasilan (royalti siap ditarik), agent yang dijual, kehamilan.
- **Panduan** (`/panduan`): apa itu Meiosis, masuk & ETH gratis, buat,
  kawinkan, jual/sewa, pakai di web, bawa ke Claude Code, FAQ.

## 6. Galat

`humanError` ditambah: `BadDesign`, `NotApproved`, `StaleListing`,
`OwnListing`, `InsufficientPayment`, `NotListed`, `ZeroPrice`.

## 7. Pengujian

- Foundry: Studio (desain sah → genome sama dengan vektor TS; tier kuat,
  bakat kembar, nilai di luar jangkauan ditolak; biaya kurang ditolak,
  kelebihan dikembalikan; nama & manifest terpasang; pembuat jadi pemilik),
  Market (list tanpa approve ditolak; buy: 2,5% platform, leluhur & penjual
  dikreditkan, agent pindah, listing basi ditolak, beli milik sendiri ditolak;
  rent: pembagian sama, harga sewa ditegakkan).
- `bun test`: `studioGenome` vs vektor, `humanError` baru.
- e2e: Studio → agent baru milik wallet uji; jual → akun demo lain membeli →
  royalti penjual masuk; sewa berbayar di Beri tugas (mode tiruan).

## 8. Di luar cakupan bagian A

Prompt privat, saldo, API key, MCP online, `.md` remote/watermark (bagian B).
Lelang, tawar-menawar, profil penjual.
