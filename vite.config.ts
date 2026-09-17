import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The app's own version, injected at build time.
 *
 * The About dialog used to hard-code it, which drifted: v2.4.0 shipped with the
 * dialog still reading v2.3.0 because the string was in a component nobody
 * edits during a release. Reading package.json means the version the dialog
 * shows is the version that was built, and bumping one file is enough.
 */
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string };

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-codemirror": [
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/language",
            "@codemirror/commands",
            "@codemirror/autocomplete",
            "@codemirror/search",
            "@codemirror/lang-markdown",
            "@codemirror/theme-one-dark",
          ],
          "vendor-markdown": [
            "markdown-it",
            "markdown-it-front-matter",
            "markdown-it-task-lists",
            "dompurify",
            "js-yaml",
          ],
          "vendor-highlight": ["highlight.js"],
          "vendor-mermaid": ["mermaid"],
          "vendor-katex": ["katex"],
          "vendor-cytoscape": ["cytoscape"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
});
