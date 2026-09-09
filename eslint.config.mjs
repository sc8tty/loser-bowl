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
    // Spawned-task worktrees are full checkouts (with their own .next output)
    // living inside the repo. CI never sees them, so without this local lint
    // reports thousands of problems that CI does not.
    ".claude/**",
  ]),
]);

export default eslintConfig;
