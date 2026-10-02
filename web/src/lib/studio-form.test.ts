// web/src/lib/studio-form.test.ts
import { expect, test } from "bun:test";
import { emptyTraits, studioFormProblems } from "./studio-form";

const base = { name: "Kurir API", role: "Pembuat REST API", traits: [{ label: "Bahasa", value: "Jawa halus" }], instructions: "" };
const blocking = (f: typeof base, taken: string[] = []) => studioFormProblems(f, taken).filter((p) => p.blocking);

test("form minimal sah", () => expect(blocking(base)).toEqual([]));
test("tanpa peran, sifat, dan instruksi diblokir", () => {
  expect(blocking({ ...base, role: "", traits: emptyTraits(), instructions: "" }).map((p) => p.field)).toEqual(["role"]);
});
test("sifat saja sudah cukup", () => expect(blocking({ ...base, role: "" })).toEqual([]));
test("nama > 32 byte diblokir", () => expect(blocking({ ...base, name: "🤖".repeat(9) }).map((p) => p.field)).toEqual(["name"]));
test("nama kembar hanya peringatan", () => {
  expect(studioFormProblems(base, ["kurir api"])).toEqual([{ field: "name", message: expect.stringContaining("Sudah ada"), blocking: false }]);
});
test("> 12 sifat diblokir; label kembar diperingatkan", () => {
  const many = Array.from({ length: 13 }, (_, i) => ({ label: `S${i}`, value: "v" }));
  expect(blocking({ ...base, traits: many }).map((p) => p.field)).toEqual(["traits"]);
  expect(studioFormProblems({ ...base, traits: [{ label: "Hobi", value: "a" }, { label: "hobi", value: "b" }] }, []).some((p) => p.field === "traits" && !p.blocking)).toBe(true);
});
test("instruksi > 4000 diblokir", () => expect(blocking({ ...base, instructions: "x".repeat(4001) }).map((p) => p.field)).toEqual(["instructions"]));
test("enam kolom bawaan", () => {
  expect(emptyTraits().map((t) => t.label)).toEqual(["Keahlian", "Stack & alat", "Cara berpikir", "Cara kerja", "Gaya bicara", "Kepribadian"]);
});
