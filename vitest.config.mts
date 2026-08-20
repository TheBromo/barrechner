import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", coverage: { include: ["src/lib/{format,hostname,slug,theme,types}.ts"] } },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
