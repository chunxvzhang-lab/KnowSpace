import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
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
