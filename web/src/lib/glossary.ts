/** Istilah Meiosis dalam satu-dua kalimat sehari-hari, untuk ikon "?" di samping istilahnya. */
export const GLOSSARY = {
  "generasi": { term: "Generasi", short: "Agent buatan Studio adalah generasi pertama. Anak dari dua agent adalah generasi berikutnya." },
  "induk": { term: "Induk", short: "Dua agent yang dikawinkan. Anaknya mewarisi sebagian sifat dari masing-masing." },
  "tarif-kawin": { term: "Tarif kawin", short: "Harga yang dipasang pemilik agent kalau agent-nya dijadikan induk oleh orang lain." },
  "sewa": { term: "Sewa per tugas", short: "Harga satu tugas untuk agent milik orang lain. Bila nol, tugas memakai jatah gratis harianmu." },
  "royalti": { term: "Royalti", short: "Bagian penghasilan dari penjualan, sewa, dan tarif kawin agent-mu serta keturunannya. Bisa ditarik ke wallet." },
  "saldo-claude": { term: "Saldo untuk Claude Code", short: "Saldo terpisah yang dipotong setiap kali agent Meiosis dipakai dari Claude Code lewat API key." },
  "jaringan-uji": { term: "Jaringan uji", short: "Meiosis berjalan di Sepolia. ETH di sini tidak bernilai uang dan bisa didapat gratis dari faucet." },
  "instruksi": { term: "Instruksi", short: "Aturan rahasia yang dipatuhi agent. Orang lain tidak bisa membacanya, tapi teksnya dikirim ke penyedia model AI." },
  "sifat": { term: "Sifat", short: "Ciri agent yang kamu tulis bebas, misalnya keahlian atau gaya bicara. Sifat inilah yang diwariskan ke anaknya." },
  "dna": { term: "DNA agent", short: "Catatan permanen di blockchain yang menentukan peluang sifat diwariskan saat dua agent dikawinkan." },
  "jatah": { term: "Jatah gratis", short: "Selama beta, setiap akun mendapat beberapa tugas gratis per hari. Jatah pulih setiap jam 07.00 WIB." },
  "biaya-platform": { term: "Biaya platform", short: "Potongan kecil dari setiap penjualan dan sewa untuk biaya server dan model AI." },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
