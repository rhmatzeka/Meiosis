/**
 * "Rancang untukku" di Studio: dari deskripsi bebas menjadi nama, peran,
 * sifat bebas (label = isi), dan instruksi. Angka genome tidak dibuat di sini;
 * itu tugas encode.ts saat agent benar-benar dibuat.
 *
 * Dua lapis. Model diminta mengeluarkan JSON; hasilnya divalidasi ketat. Bila
 * model tidak tersedia, menolak, atau mengeluarkan sesuatu yang tidak sah,
 * aturan kata kunci di bawah yang dipakai — Studio tidak pernah macet karena AI.
 */
import { KNOWN_STACKS, MAX_INSTRUCTIONS, MAX_ROLE, SLOTS, normalizeStack, normalizeTraits, type FreeTrait } from "../packages/shared/src/profile";

export interface Suggestion { name: string; role: string; traits: FreeTrait[]; instructions: string; source: "ai" | "heuristic" }

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const clipName = (s: string) => {
  let out = oneLine(s);
  while (new TextEncoder().encode(out).length > 32) out = out.slice(0, -1);
  return out.trim();
};
/** Kalimat pertama, dipotong di batas kata. */
const clipRole = (s: string) => {
  const first = oneLine(s).split(/(?<=[.!?])\s/)[0] ?? "";
  if (first.length <= MAX_ROLE) return first;
  const cut = first.slice(0, MAX_ROLE);
  return cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : MAX_ROLE).trim();
};

/** Teknologi dari KNOWN_STACKS yang disebut di teks, sesuai urutan; yang lebih panjang menang ("React Native" > "React"). */
export function stacksIn(text: string): string[] {
  const hits: { s: string; i: number; n: number }[] = [];
  for (const s of KNOWN_STACKS) {
    const re = new RegExp(`(^|[^a-z0-9])(${s.replace(/[.+]/g, "\\$&")})(?=$|[^a-z0-9])`, "gi");
    for (const m of text.matchAll(re)) hits.push({ s, i: (m.index ?? 0) + m[1].length, n: s.length });
  }
  hits.sort((a, b) => a.i - b.i || b.n - a.n);
  const kept: typeof hits = [];
  for (const h of hits) if (!kept.some((k) => h.i < k.i + k.n && k.i < h.i + h.n)) kept.push(h);
  return normalizeStack(kept.map((k) => k.s));
}

export function suggestFromText(description: string): Suggestion {
  const d = oneLine(description);
  if (!d) return { name: "Agent baru", role: "", traits: [], instructions: "", source: "heuristic" };
  const t = d.toLowerCase();

  let skill = "";
  if (has(t, "desain", "design", "tampilan", "ui", "ux", "landing")) skill = "desain antarmuka";
  if (has(t, "kode", "code", "program", "bikin", "buat", "form", "api", "fitur", "bug")) skill = "pemrograman";
  if (has(t, "data", "analisis", "statistik", "pandas", "laporan")) skill = "analisis data";
  if (has(t, "riset", "research", "rangkum", "cari tahu", "literatur", "dokumentasi")) skill = "riset dan merangkum";
  if (has(t, "audit", "celah", "pentest", "reentrancy", "kerentanan", "vulnerab")) skill = "keamanan dan audit";

  const work: string[] = [];
  if (has(t, "tes", "test", "teruji", "tdd", "teliti")) work.push("selalu menulis tes");
  if (has(t, "aman", "keamanan", "secure", "security", "audit", "celah", "validasi")) work.push("memeriksa keamanan");
  if (has(t, "rapi", "dokumentasi", "readme")) work.push("rapi dan terdokumentasi");

  let style = "";
  if (has(t, "santai", "gaul", "casual")) style = "santai";
  if (has(t, "ringkas", "singkat", "to the point", "langsung")) style = "singkat dan langsung";
  if (has(t, "jelaskan", "detail", "rinci", "ajari", "pemula")) style = "detail dan sabar menjelaskan";

  const stack = stacksIn(d);
  const traits = normalizeTraits([
    { label: "Keahlian", value: skill },
    { label: "Stack & alat", value: stack.join(", ") },
    { label: "Cara kerja", value: work.join(", ") },
    { label: "Gaya bicara", value: style },
  ]);
  const head = skill ? skill[0].toUpperCase() + skill.slice(1) : "Asisten";
  return {
    name: clipName(stack[0] ? `${head} ${stack[0]}` : head),
    role: clipRole(d),
    traits,
    instructions: `Tujuanmu: ${d}\n\nBekerjalah dengan fokus pada tujuan itu. Tanyakan hal yang benar-benar tidak jelas, lalu selesaikan sampai tuntas.`,
    source: "heuristic",
  };
}

/** Prompt untuk model: deskripsi → JSON rancangan dengan sifat bebas. */
export function suggestPrompt(description: string): { system: string; user: string } {
  return {
    system:
      "Kamu merancang agent AI dari deskripsi pengguna. Balas HANYA satu objek JSON, tanpa teks lain, dengan kunci:\n" +
      '"name" (nama agent, paling panjang 28 karakter, bahasa pengguna),\n' +
      `"role" (satu kalimat tugas agent, paling panjang ${MAX_ROLE} karakter),\n` +
      '"traits" (array objek {"label","value"}; pakai label bawaan bila cocok: ' + SLOTS.map((s) => `"${s.label}"`).join(", ") +
      '; boleh menambah label lain yang penting bagi pengguna; "Stack & alat" berisi nama teknologi dipisah koma; maksimal 8 objek; value singkat, paling panjang 200 karakter),\n' +
      '"instructions" (instruksi sistem untuk agent itu, 4–10 kalimat konkret dalam bahasa pengguna: peran, cara kerja, hal yang harus dihindari).',
    user: description,
  };
}

/** Membaca keluaran model. Apa pun yang tidak sah → `fallback` (aturan kata kunci). */
export function parseSuggestion(output: string, fallback: Suggestion): Suggestion {
  const heuristic: Suggestion = { ...fallback, source: "heuristic" };
  const start = output.indexOf("{"), end = output.lastIndexOf("}");
  if (start < 0 || end <= start) return heuristic;
  try {
    const o = JSON.parse(output.slice(start, end + 1)) as { name?: unknown; role?: unknown; instructions?: unknown; traits?: unknown };
    if (!Array.isArray(o.traits) || !o.traits.every((t) => t && typeof t === "object" && typeof t.label === "string" && typeof t.value === "string")) return heuristic;
    return {
      name: clipName(String(o.name ?? "")) || fallback.name,
      role: clipRole(String(o.role ?? "")) || fallback.role,
      traits: normalizeTraits(o.traits as FreeTrait[]),
      instructions: String(o.instructions ?? "").trim().slice(0, MAX_INSTRUCTIONS) || fallback.instructions,
      source: "ai",
    };
  } catch {
    return heuristic;
  }
}
