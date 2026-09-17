// Aturan keamanan untuk MENILAI kode buatan agent — bukan lint repo kita sendiri.
// Repo Meiosis memakai Biome; keduanya beda urusan.
import security from "eslint-plugin-security";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Yang benar-benar berbahaya di halaman web, dinaikkan ke error.
      "security/detect-eval-with-expression": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-unsafe-regex": "error",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  { ignores: ["dist/**", "node_modules/**", "*.config.*"] },
];
