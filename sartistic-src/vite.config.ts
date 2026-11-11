import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

export default defineConfig(({ command }) => ({
  server: { host: "::", port: 8080 },
  css: { transformer: "lightningcss" },
  resolve: {
    // Native tsconfig "paths" support (replaces vite-tsconfig-paths).
    tsconfigPaths: true,
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    // Must come before viteReact(): it includes the TanStack Router plugin,
    // which has to run before React's JSX transform.
    tanstackStart({
      // Use src/server.ts (our SSR error wrapper) as the server entry.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    // Nitro packages the server for deployment. With no preset it builds a
    // Node server (`node .output/server/index.mjs`) and auto-detects hosts like
    // Vercel or Netlify. Set NITRO_PRESET (e.g. "cloudflare-module") to override.
    ...(command === "build" ? [nitro()] : []),
    viteReact(),
  ],
}));
