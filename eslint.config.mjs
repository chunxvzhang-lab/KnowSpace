import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Lint scope, phase 0: `src/**` (the TS the team writes daily).
 *
 * electron/*.cjs and scripts/*.cjs are CommonJS with Node globals and are
 * deliberately out for now - wiring them in needs a Node globals env block and
 * a pass over years of accumulated style; that is follow-up work, not a
 * reason to keep the whole toolchain out.
 */

export default tseslint.config(
  { ignores: ["dist", "release", "release-next", "node_modules", "web", "coverage", "scripts/_archive"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLImageElement: "readonly",
        HTMLCanvasElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        Event: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        WheelEvent: "readonly",
        CustomEvent: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        MutationObserver: "readonly",
        getComputedStyle: "readonly",
        matchMedia: "readonly",
        location: "readonly",
        history: "readonly",
        alert: "readonly",
        confirm: "readonly",
        URL: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        Image: "readonly",
        Worker: "readonly",
        crypto: "readonly",
        AbortController: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      // Typed escapes are measured by scripts/quality-ratchet.cjs (only
      // decrease allowed). Linting them here as errors would force 40+ legacy
      // fixes into one commit; as warnings they would fail --max-warnings 0
      // and get the rule switched off entirely - worse than not having it.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Empty `catch {}` is an idiom this repo uses deliberately for
      // fire-and-forget calls (see preload.cjs's launch-data probe); empty
      // blocks outside catches stay errors.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": "allow-with-description", "ts-expect-error": "allow-with-description" },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // ---- Legacy exhaustive-deps whitelist (phase 1 reclaims these) --------
  // Adding a dependency changes WHEN an effect runs, and in the four biggest
  // files that timing is load-bearing canvas / review behaviour. Fixing 57
  // effect declarations in one sweep is exactly the regression risk the plan
  // forbids (R4), so they are disabled per FILE with a reclaim note: each
  // extraction in phase 1 batches 1-3 re-enables the rule for its new modules.
  // Do not add files here; do not extend these after their split lands.
  {
    files: [
      "src/App.tsx", // 待拆分: batch 1 (Command Bus + store extraction)
      "src/components/CanvasView.tsx", // 待拆分: batch 2
      "src/components/MindmapView.tsx", // 待拆分: batch 3
      "src/components/DailyReviewPanel.tsx", // 待拆分: batch 3 (review UI split)
    ],
    rules: {
      "react-hooks/exhaustive-deps": "off",
    },
  },

  // ---- Layered dependency guard (plan 0-7 / section 4.6) ----------------
  // L2 must be callable from a non-React environment (phase 2 workers, phase 3
  // on-device AI, phase 5 plugins all require it). These rules are the only
  // automatic brake on architecture drift; the survey on 2026-09-26 found the
  // import bans already hold repo-wide, so they open with an EMPTY whitelist.
  {
    files: ["src/core/**/*.ts", "src/services/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "L2 domain kernel must stay framework-free (plan 3.1)." },
            { name: "react-dom", message: "L2 domain kernel must stay framework-free (plan 3.1)." },
            { name: "react/jsx-runtime", message: "L2 domain kernel must stay framework-free (plan 3.1)." },
            { name: "zustand", message: "State belongs to L3 stores, not the domain kernel (plan 3.1)." },
          ],
          patterns: [
            {
              group: ["electron", "electron/*"],
              message: "L2 must not reach the platform layer directly - go through L3/L4 (plan 3.1).",
            },
          ],
        },
      ],
    },
  },
  // window/document in L2: the files below carry real (non-comment)
  // references today (2026-09-26 survey: 11 files, ~61 references), mostly
  // DOM rasterisation for export and localStorage-adjacent reads. NEW files
  // get no pass. Remove entries as phase 1 batch 3 pulls the DOM out of each
  // service - a listed file that stops using the globals should be deleted
  // from this list in the same change.
  {
    files: ["src/core/**/*.ts", "src/services/**/*.ts"],
    ignores: [
      // 待迁移: DOM rasterisation / browser-triggered IO (phase 1 batch 3)
      "src/services/bookSource.ts",
      "src/services/canvasExport.ts",
      "src/services/canvasTheme.ts",
      "src/services/fileDownload.ts",
      "src/services/markdown.ts",
      "src/services/mermaid.ts",
      "src/services/mindmapImport.ts",
      "src/services/mindmapSidecar.ts",
      "src/services/searchIndexService.ts",
      "src/services/svgExport.ts",
      "src/services/tableGenerator.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "window", message: "L2 must run in a worker (plan 3.5) - inject or move this to L4." },
        { name: "document", message: "L2 must run in a worker (plan 3.5) - inject or move this to L4." },
      ],
    },
  },
  // L4/L5 (everything else in src): never import the platform layer directly;
  // IPC goes through the preload bridge only.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/core/**", "src/services/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["electron", "electron/*"],
              message: "Renderer code must not import electron - use the preload bridge (plan 3.1).",
            },
          ],
        },
      ],
    },
  },

  // Tests load the untyped CommonJS electron modules (markdown-files.cjs,
  // snapshots.cjs) with require - that is the established pattern under
  // "type": "module" and is guarded as text by ipc-channel-contract.test.ts.
  {
    files: ["src/__tests__/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
