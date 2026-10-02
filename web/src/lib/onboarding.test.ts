import { expect, test } from "bun:test";
import { MIN_BALANCE_WEI, nextStep } from "./onboarding";

const base = { signedIn: true, balanceWei: MIN_BALANCE_WEI, ownsAgent: true, ranTask: true };

test("urutan langkah pertama", () => {
  expect(nextStep({ ...base, signedIn: false })).toBe("masuk");
  expect(nextStep({ ...base, balanceWei: 0n, ownsAgent: false, ranTask: false })).toBe("saldo");
  expect(nextStep({ ...base, ownsAgent: false, ranTask: false })).toBe("buat");
  expect(nextStep({ ...base, ranTask: false })).toBe("tugas");
  expect(nextStep(base)).toBeNull();
});
test("punya agent tapi saldo habis: isi saldo dulu", () => {
  expect(nextStep({ ...base, balanceWei: 0n, ranTask: false })).toBe("saldo");
});
test("saldo tepat di batas minimum dianggap cukup", () => {
  expect(nextStep({ ...base, balanceWei: MIN_BALANCE_WEI - 1n, ranTask: false })).toBe("saldo");
  expect(nextStep({ ...base, ranTask: false })).toBe("tugas");
});
test("semua selesai tapi saldo habis tidak memunculkan langkah lagi", () => {
  expect(nextStep({ ...base, balanceWei: 0n })).toBeNull();
});
