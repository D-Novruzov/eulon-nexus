import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";

// Custom plugin to ensure kuzu worker is in the correct location
function kuzuWorkerPlugin() {
  return {
    name: "kuzu-worker-plugin",
    closeBundle() {
      // After build, copy kuzu_wasm_worker.js to assets folder as well
      const distDir = path.resolve(__dirname, "dist");
      const assetsDir = path.join(distDir, "assets");
      const workerSrc = path.join(distDir, "kuzu_wasm_worker.js");
      const workerDest = path.join(assetsDir, "kuzu_wasm_worker.js");

      try {
        if (existsSync(workerSrc)) {
          if (!existsSync(assetsDir)) {
            mkdirSync(assetsDir, { recursive: true });
          }
          copyFileSync(workerSrc, workerDest);
          console.log("✅ Copied kuzu_wasm_worker.js to assets folder");
        }
      } catch (error) {
        console.warn("⚠️ Could not copy kuzu worker to assets:", error);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), kuzuWorkerPlugin()],
  worker: {
    format: "es",
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    fs: {
      allow: [".."],
    },
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
    hmr: {
      overlay: false,
    },
  },

  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      "node:async_hooks": path.resolve(__dirname, "src/lib/polyfills.ts"),
      async_hooks: path.resolve(__dirname, "src/lib/polyfills.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["@langchain/langgraph", "kuzu-wasm"],
    include: [
      "camelcase",
      "decamelize",
      "ansi-styles",
      "chalk",
      "supports-color",
      "p-queue",
      "p-retry",
      "semver",
      "base64-js",
      "num-sort",
      "binary-search",
      "js-tiktoken",
      "uuid",
      "ms",
      "retry",
      "p-timeout",
      "p-finally",
      "eventemitter3",
      "web-tree-sitter",
      "comlink",
    ],
    force: true,
    holdUntilCrawlEnd: true,
  },
  build: {
    target: "esnext",
    assetsInlineLimit: 0,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
      defaultIsModuleExports: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          kuzu: ["kuzu-wasm"],
        },
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    allowedHosts: [".railway.app", ".up.railway.app"],
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
});
