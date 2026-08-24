import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/*
 * Scripts under scripts/ carry a `#!/usr/bin/env node` shebang because they are
 * standalone executables. Vite's SSR transform rewrites their `import` statements
 * into shims and prepends those to line 1, which pushes the shebang off column 0
 * and leaves `;#!/usr/bin/env node` mid-line. Rolldown then fails on the `!`, and
 * the importing test collapses with "Parse failure: Invalid Character `!`" before
 * a single assertion runs.
 *
 * Removing the shebangs would fix it and cost the scripts their executable
 * signature. Stripping it here instead keeps the files honest and covers the three
 * scripts no test imports yet. The trailing newline is deliberately left in place
 * so every subsequent line keeps its original number in stack traces.
 */
const stripShebang = {
  name: "strip-shebang",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.includes("/scripts/") || !code.startsWith("#!")) return null;
    return { code: code.replace(/^#![^\n]*/, ""), map: null };
  },
};

export default defineConfig({
  plugins: [stripShebang, react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
