// server/mode.test.ts
import { expect, test } from "bun:test";
import { testMode } from "./mode";

test("akun uji hanya hidup di chain lokal dengan TEST_ACCOUNTS=1", () => {
  expect(testMode({ TEST_ACCOUNTS: "1" }, true)).toBe(true);
  expect(testMode({ TEST_ACCOUNTS: "1" }, false)).toBe(false);
  expect(testMode({}, true)).toBe(false);
  expect(testMode({ TEST_ACCOUNTS: "true" }, true)).toBe(false);
});
