import { expect, test } from "bun:test";
import { matchAgent } from "./search";

const a = {
  id: 12, name: "Kurir API",
  profile: { role: "Pembuat REST API toko online", traits: [{ label: "Stack & alat", value: "Laravel, MySQL" }, { label: "Bahasa", value: "Jawa halus" }] },
};

test("cocok lewat stack, #id, peran, dan sifat buatan sendiri", () => {
  expect(matchAgent(a, "laravel")).toBe(true);
  expect(matchAgent(a, "#12")).toBe(true);
  expect(matchAgent(a, "rest api")).toBe(true);
  expect(matchAgent(a, "Jawa Halus")).toBe(true);
  expect(matchAgent(a, "kurir")).toBe(true);
});
test("semua kata harus cocok", () => {
  expect(matchAgent(a, "laravel jawa")).toBe(true);
  expect(matchAgent(a, "laravel flutter")).toBe(false);
});
test("#id harus persis", () => expect(matchAgent(a, "#1")).toBe(false));
test("kosong cocok dengan semua; teks asing tidak", () => {
  expect(matchAgent(a, "  ")).toBe(true);
  expect(matchAgent(a, "kotlin")).toBe(false);
});
