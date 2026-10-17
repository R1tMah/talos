import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Database tests shell out to the Supabase CLI, one transaction per file.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
