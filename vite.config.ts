import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), viteReact(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  // Provided by workerd at runtime. Alchemy's Cloudflare plugin resolves it during `alchemy deploy`/`dev`;
  // keeping it external lets a plain `vite build` (CI smoke test) succeed too.
  environments: { ssr: { build: { rollupOptions: { external: [/^cloudflare:/] } } } },
});
