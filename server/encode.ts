/**
 * Profil bebas → 16 lokus genome untuk Studio.create.
 *
 * Pembuat agent tidak pernah memilih lokus. AI menerjemahkan teksnya bila
 * tersedia; aturan kata kunci per kolom menjadi cadangan. Dua lokus tidak
 * pernah ditentukan teks: L0 (kelas model) dikunci admin, dan L3 (stack)
 * selalu diturunkan dari kolom "Stack & alat".
 */
import { LOCUS, LOCUS_COUNT, TRAITS } from "../packages/shared/src/genome";
import { slotOf, stackLocus, stackOf, type Profile } from "../packages/shared/src/profile";
import { defaultTraits, validateTraits } from "../packages/shared/src/studio";

export type Ask = (prompt: { system: string; user: string }) => Promise<string>;

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));
const slotText = (p: Profile, label: string) =>
  p.traits.filter((t) => slotOf(t.label)?.label === label).map((t) => t.value.toLowerCase()).join(" ");

function heuristic(p: Profile): number[] {
  const loci = defaultTraits();
  const all = [p.role, ...p.traits.map((t) => `${t.label} ${t.value}`)].join(" ").toLowerCase();
  const skill = slotText(p, "Keahlian") || p.role.toLowerCase();
  const work = slotText(p, "Cara kerja");
  const style = slotText(p, "Gaya bicara");
  const mind = slotText(p, "Cara berpikir");
  const persona = slotText(p, "Kepribadian");

  loci[LOCUS.DISCIPLINE_PRIMARY] = 0;
  if (has(skill, "desain", "design", "ui", "ux", "tampilan")) loci[LOCUS.DISCIPLINE_PRIMARY] = 2;
  if (has(skill, "kode", "code", "program", "backend", "frontend", "api", "developer")) loci[LOCUS.DISCIPLINE_PRIMARY] = 1;
  if (has(skill, "data", "analisis", "statistik")) loci[LOCUS.DISCIPLINE_PRIMARY] = 5;
  if (has(skill, "riset", "research", "rangkum", "literatur")) loci[LOCUS.DISCIPLINE_PRIMARY] = 3;
  if (has(skill, "keamanan", "security", "audit", "celah", "pentest")) loci[LOCUS.DISCIPLINE_PRIMARY] = 4;

  if (has(work, "tes", "test", "tdd")) loci[LOCUS.TEST_RIGOR] = 2;
  if (has(work, "aman", "keamanan", "security", "validasi")) loci[LOCUS.SECURITY_INSTINCT] = 2;
  if (has(work, "dokumentasi", "docs", "readme", "rapi")) loci[LOCUS.DOC_HABIT] = 2;
  if (has(work + " " + persona, "rapi", "cantik", "estetik", "indah", "elegan")) loci[LOCUS.AESTHETIC] = 2;
  if (has(work + " " + persona, "tekun", "tuntas", "gigih", "sampai selesai")) loci[LOCUS.PERSISTENCE] = 2;

  if (has(style, "singkat", "ringkas", "langsung", "to the point")) loci[LOCUS.VERBOSITY] = 0;
  if (has(style, "detail", "rinci", "panjang", "sabar")) loci[LOCUS.VERBOSITY] = 2;

  if (has(mind, "berani", "cepat", "eksperimen", "praktis")) loci[LOCUS.RISK_APPETITE] = 2;
  if (has(mind, "hati-hati", "teliti", "konservatif", "cek dua kali")) loci[LOCUS.RISK_APPETITE] = 0;

  if (has(persona, "kreatif", "eksperimen", "berani", "unik", "imajinatif")) loci[LOCUS.CREATIVITY] = 2;
  if (has(persona, "kaku", "konservatif", "hati-hati")) loci[LOCUS.CREATIVITY] = 0;

  if (has(all, "web", "internet", "browsing", "cari di")) loci[LOCUS.MCP_SET_B] = 1;
  return loci;
}

function locked(loci: number[], p: Profile): number[] {
  const out = [...loci];
  out[LOCUS.MODEL_TIER] = 1;
  out[LOCUS.STACK_AFFINITY] = stackLocus(stackOf(p));
  out[LOCUS.RESERVED] = 0;
  return out;
}

export function encodePrompt(p: Profile): { system: string; user: string } {
  const loci = Object.keys(LOCUS).map((k, i) => `${i} ${k}: ${TRAITS[i].map((v, n) => `${n}=${v}`).join(", ")}`).join("\n");
  return {
    system:
      'Terjemahkan profil agent AI berikut ke 16 angka genome. Balas HANYA JSON {"loci":[16 bilangan bulat]} sesuai daftar nilai sah:\n' + loci,
    user: [`peran: ${p.role}`, ...p.traits.map((t) => `${t.label}: ${t.value}`)].join("\n"),
  };
}

export async function encodeProfile(p: Profile, ai?: Ask): Promise<{ loci: number[]; source: "ai" | "heuristic" }> {
  if (ai) {
    try {
      const out = await ai(encodePrompt(p));
      const s = out.indexOf("{"), e = out.lastIndexOf("}");
      const raw = (JSON.parse(out.slice(s, e + 1)) as { loci?: unknown }).loci;
      if (Array.isArray(raw) && raw.length === LOCUS_COUNT) {
        const loci = locked(raw.map(Number), p);
        if (!validateTraits(loci)) return { loci, source: "ai" };
      }
    } catch { /* jatuh ke aturan kata kunci */ }
  }
  return { loci: locked(heuristic(p), p), source: "heuristic" };
}
