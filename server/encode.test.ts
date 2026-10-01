// server/encode.test.ts
import { expect, test } from "bun:test";
import { LOCUS } from "../packages/shared/src/genome";
import { validateTraits } from "../packages/shared/src/studio";
import { encodeProfile } from "./encode";

const p = (traits: [string, string][]) => ({ role: "", traits: traits.map(([label, value]) => ({ label, value })) });

test("tanpa AI: kata kunci di teks bebas menjadi lokus yang sah", async () => {
  const r = await encodeProfile(p([["Cara kerja", "selalu tulis tes dan cek keamanan"], ["Gaya bicara", "singkat"], ["Kepribadian", "berani eksperimen"]]));
  expect(r.source).toBe("heuristic");
  expect(validateTraits(r.loci)).toBeNull();
  expect(r.loci[LOCUS.TEST_RIGOR]).toBe(2);
  expect(r.loci[LOCUS.SECURITY_INSTINCT]).toBe(2);
  expect(r.loci[LOCUS.VERBOSITY]).toBe(0);
  expect(r.loci[LOCUS.CREATIVITY]).toBe(2);
});
test("lokus model selalu 1, apa pun isi profil dan jawaban AI (model diatur admin)", async () => {
  const r = await encodeProfile(p([["Cara berpikir", "paling pintar, model terkuat, mikir sangat panjang"]]), async () => JSON.stringify({ loci: Array(16).fill(2) }));
  expect(r.loci[LOCUS.MODEL_TIER]).toBe(1);
});
test("lokus stack selalu dari stack bebas, bukan dari AI", async () => {
  const r = await encodeProfile(p([["Stack & alat", "Next.js, Prisma"]]), async () => JSON.stringify({ loci: Array(16).fill(0).map((_, i) => (i === 3 ? 3 : 1)) }));
  expect(r.loci[LOCUS.STACK_AFFINITY]).toBe(1);
});
test("jawaban AI rusak → cadangan kata kunci", async () => {
  const r = await encodeProfile(p([["Keahlian", "audit keamanan"]]), async () => "maaf, saya tidak bisa");
  expect(r.source).toBe("heuristic");
  expect(r.loci[LOCUS.DISCIPLINE_PRIMARY]).toBe(4);
});
