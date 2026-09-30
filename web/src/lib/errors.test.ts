import { expect, test } from "bun:test";
import { humanError } from "./errors";

const ctx = { names: { 1: "Solidity Smith", 2: "Pixel Sense" } as Record<number, string>, block: 100, secPerBlock: 12 };

test("penolakan di wallet tidak dianggap galat", () => {
  expect(humanError({ code: 4001, message: "User rejected the request." }, ctx)).toEqual({ message: "Dibatalkan.", quiet: true });
  expect(humanError(new Error("user rejected transaction"), ctx).quiet).toBe(true);
});

test("cooldown disebut dengan nama agent dan perkiraan waktu", () => {
  const e = new Error("execution reverted: reverted with custom error 'OnCooldown(1, 130)'");
  expect(humanError(e, ctx).message).toBe("Solidity Smith sedang istirahat, siap ±6 menit lagi.");
});

test("cooldown dari pesan server /api/tx juga dikenali", () => {
  const e = new Error("#2 masih masa jeda sampai blok 103 (sekarang 100)");
  expect(humanError(e, ctx).message).toBe("Pixel Sense sedang istirahat, siap ±36 detik lagi.");
});

test("agent yang tidak dibuka untuk kawin", () => {
  expect(humanError(new Error("custom error 'NotListedForStud(2)'"), ctx).message)
    .toBe("Pemilik Pixel Sense belum membukanya untuk kawin.");
});

test("tarif kurang", () => {
  expect(humanError(new Error("custom error 'InsufficientFee(10000000000000000, 0)'"), ctx).message)
    .toBe("Tarif kawinnya 0.01 ETH dan saldomu tidak cukup.");
});

test("saldo gas tidak cukup", () => {
  expect(humanError(new Error("insufficient funds for gas * price + value"), ctx).message)
    .toBe("Saldo ETH-mu tidak cukup untuk biaya jaringan.");
});

test("pesan lain dipotong jadi satu kalimat pendek", () => {
  const long = "x".repeat(500);
  expect(humanError(new Error(long), ctx).message.length).toBeLessThanOrEqual(181);
});

test("galat pasar dan studio diterjemahkan", () => {
  const m = (s: string) => humanError(new Error(`custom error '${s}'`), ctx).message;
  expect(m("BadDesign()")).toBe("Rancangan agent tidak sah. Periksa pilihan otak dan bakatnya.");
  expect(m("NotApproved(7)")).toBe("Izinkan Pasar menjual agent ini dulu.");
  expect(m("StaleListing(7)")).toBe("Agent ini sudah tidak dijual oleh pemiliknya.");
  expect(m("OwnListing(7)")).toBe("Ini agent milikmu sendiri.");
  expect(m("NotListed(7)")).toBe("Agent ini sedang tidak dijual.");
  expect(m("ZeroPrice()")).toBe("Harga harus lebih dari 0.");
  expect(m("InsufficientPayment(10000000000000000, 0)")).toBe("Pembayaran kurang. Harganya 0.01 ETH.");
});
