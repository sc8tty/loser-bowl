import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
    },
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
