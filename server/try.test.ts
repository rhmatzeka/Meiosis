import { expect, test } from "bun:test";
import { tryRequestProblems } from "./try";

const ok = { role: "Pembuat API", traits: [{ label: "Stack & alat", value: "Go" }], instructions: "", task: "Buat endpoint login" };

test("permintaan coba yang sah lolos", () => expect(tryRequestProblems(ok)).toBeNull());
test("tugas kosong ditolak", () => expect(tryRequestProblems({ ...ok, task: "   " })).toMatch(/Tulis dulu tugas/));
test("tugas lebih dari 1000 karakter ditolak", () => expect(tryRequestProblems({ ...ok, task: "x".repeat(1001) })).toMatch(/1000/));
test("profil dan instruksi kosong ditolak", () => {
  expect(tryRequestProblems({ role: "", traits: [{ label: "Keahlian", value: "  " }], instructions: "", task: "halo" })).toMatch(/otak agent/);
});
test("instruksi saja sudah cukup", () => expect(tryRequestProblems({ role: "", traits: [], instructions: "Kamu ramah.", task: "halo" })).toBeNull());
test("instruksi lebih dari 4000 karakter ditolak", () => expect(tryRequestProblems({ ...ok, instructions: "i".repeat(4001) })).toMatch(/4000/));
