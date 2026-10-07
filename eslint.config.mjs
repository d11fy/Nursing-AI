import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Repository-local agent skills and evaluation fixtures are executable
    // tooling inputs, not application source code.
    ".codex/**",
    ".evaluation/**",
    "android/**/build/**",
    "android/app/src/main/assets/public/**",
    "mobile/dist/**",
  ]),
  {
    files: ["mobile/src/**/*.{ts,tsx}"],
    rules: {
      // The bundled Capacitor client is a separate Vite application. Its API
      // payloads are runtime-validated at the shared backend boundary, and its
      // async screen loaders intentionally set loading state before awaiting.
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
