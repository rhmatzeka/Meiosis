/**
 * "Rancang dengan AI" di Studio: dari deskripsi bebas menjadi nama, instruksi
 * khusus, dan nilai 16 lokus.
 *
 * Dua lapis. Model diminta mengeluarkan JSON; hasilnya divalidasi ketat. Bila
 * model tidak tersedia, menolak, atau mengeluarkan sesuatu yang tidak sah,
 * aturan kata kunci di bawah yang dipakai — Studio tidak pernah macet karena AI.
 */
import { LOCUS, TRAITS } from "../packages/shared/src/genome";
import { defaultTraits, validateTraits } from "../packages/shared/src/studio";
import { MAX_SOUL } from "./souls";

export interface Suggestion { name: string; instructions: string; traits: number[]; source: "ai" | "heuristic" }

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));
const clipName = (s: string) => {
  let out = s.trim().replace(/\s+/g, " ");
  while (new TextEncoder().encode(out).length > 32) out = out.slice(0, -1);
  return out.trim();
};

export function suggestFromText(description: string): Suggestion {
  const t = description.toLowerCase();
  const traits = defaultTraits();

  // stack
  if (has(t, "react", "next.js", "nextjs", "frontend", "landing", "komponen", "tsx")) traits[LOCUS.STACK_AFFINITY] = 1;
  if (has(t, "solidity", "smart contract", "kontrak pintar", "foundry", "erc-", "evm")) traits[LOCUS.STACK_AFFINITY] = 2;
  if (has(t, "python", "pandas", "django", "fastapi", "notebook", "scraping")) traits[LOCUS.STACK_AFFINITY] = 3;

  // keahlian utama (yang paling spesifik menang terakhir)
  if (has(t, "desain", "design", "tampilan", "ui", "ux", "landing")) traits[LOCUS.DISCIPLINE_PRIMARY] = 2;
  if (has(t, "kode", "code", "program", "bikin", "buat", "form", "api", "fitur", "bug")) traits[LOCUS.DISCIPLINE_PRIMARY] = 1;
  if (has(t, "data", "analisis", "statistik", "pandas", "laporan")) traits[LOCUS.DISCIPLINE_PRIMARY] = 5;
  if (has(t, "riset", "research", "rangkum", "cari tahu", "literatur", "dokumentasi")) traits[LOCUS.DISCIPLINE_PRIMARY] = 3;
  if (has(t, "audit", "celah", "pentest", "reentrancy", "kerentanan", "vulnerab")) traits[LOCUS.DISCIPLINE_PRIMARY] = 4;

  // bakat
  if (has(t, "aman", "keamanan", "secure", "security", "audit", "celah", "validasi")) traits[LOCUS.SECURITY_INSTINCT] = 2;
  if (has(t, "tes", "test", "teruji", "tdd", "teliti")) traits[LOCUS.TEST_RIGOR] = 2;
  if (has(t, "rapi", "cantik", "indah", "estetik", "bagus", "modern", "elegan", "desain")) traits[LOCUS.AESTHETIC] = 2;
  if (has(t, "tekun", "sampai selesai", "pantang", "gigih", "perbaiki sendiri", "debug")) traits[LOCUS.PERSISTENCE] = 2;
  if (has(t, "dokumentasi", "docs", "readme", "komentar")) traits[LOCUS.DOC_HABIT] = 2;
  if (has(t, "kreatif", "ide", "unik", "eksperimen")) traits[LOCUS.CREATIVITY] = 2;

  // gaya & otak
  if (has(t, "ringkas", "singkat", "to the point", "langsung")) traits[LOCUS.VERBOSITY] = 0;
  if (has(t, "jelaskan", "detail", "rinci", "ajari", "pemula")) traits[LOCUS.VERBOSITY] = 2;
  if (has(t, "cepat", "gesit", "sederhana")) traits[LOCUS.MODEL_TIER] = 0;
  if (has(t, "rumit", "kompleks", "arsitektur", "sulit", "pintar", "cerdas")) traits[LOCUS.MODEL_TIER] = 2;
  if (has(t, "web", "internet", "browsing", "cari di")) traits[LOCUS.MCP_SET_B] = 1;

  const d = description.trim();
  const disc = ["Serba Bisa", "Pengode", "Perancang", "Periset", "Penjaga", "Pengolah Data"][traits[LOCUS.DISCIPLINE_PRIMARY]];
  const stack = ["", " React", " Solidity", " Python"][traits[LOCUS.STACK_AFFINITY]];
  return {
    name: clipName(`${disc}${stack}`),
    instructions: d
      ? `Tujuanmu: ${d.replace(/\s+/g, " ")}\n\nBekerjalah dengan fokus pada tujuan itu. Tanyakan hal yang benar-benar tidak jelas, lalu selesaikan sampai tuntas.`
      : "",
    traits,
    source: "heuristic",
  };
}

/** Prompt untuk model: deskripsi → JSON rancangan. */
export function suggestPrompt(description: string): { system: string; user: string } {
  const loci = Object.entries(LOCUS).map(([k, i]) => `${i} ${k}: ${TRAITS[i].map((v, n) => `${n}=${v}`).join(", ")}`).join("\n");
  return {
    system:
      "Kamu merancang agent AI dari deskripsi pengguna. Balas HANYA satu objek JSON, tanpa teks lain, dengan kunci:\n" +
      '"name" (nama agent, paling panjang 28 karakter, bahasa pengguna),\n' +
      '"instructions" (instruksi sistem untuk agent itu, 4–10 kalimat konkret dalam bahasa pengguna: peran, cara kerja, hal yang harus dihindari),\n' +
      '"traits" (array 16 bilangan bulat, satu per lokus, sesuai daftar nilai di bawah).\n\n' +
      "Lokus dan nilai yang sah:\n" + loci,
    user: description,
  };
}

/** Membaca keluaran model. Apa pun yang tidak sah → `fallback` (aturan kata kunci). */
export function parseSuggestion(output: string, fallback: Suggestion): Suggestion {
  const heuristic: Suggestion = { ...fallback, source: "heuristic" };
  const start = output.indexOf("{"), end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return heuristic;
  try {
    const o = JSON.parse(output.slice(start, end + 1)) as { name?: unknown; instructions?: unknown; traits?: unknown };
    const traits = Array.isArray(o.traits) ? o.traits.map(Number) : [];
    if (validateTraits(traits)) return heuristic;
    const name = clipName(String(o.name ?? "")) || fallback.name;
    const instructions = String(o.instructions ?? "").trim().slice(0, MAX_SOUL) || fallback.instructions;
    return { name, instructions, traits, source: "ai" };
  } catch {
    return heuristic;
  }
}
