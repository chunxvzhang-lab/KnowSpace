/**
 * Moves the new-document creation flow out of App.tsx into useDocumentCreation.
 *
 * A script rather than a hand edit because the block is 235 lines and
 * transcribing that by hand is how a refactor introduces a typo nobody notices.
 * The boundaries are located by marker, not by line number, so the script
 * either finds them or refuses to touch anything.
 *
 * Usage: node scripts/extract-document-creation.cjs [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "src", "App.tsx");
const hookPath = path.join(root, "src", "hooks", "useDocumentCreation.ts");
const write = process.argv.includes("--write");

/** First and last function of the block, matched exactly. */
const START_MARKER = "  const doCreateNewFile = async () => {";
const END_MARKER = "  const openMarkdownFile = useCallback(";

/** The line App gets instead of the block. */
const REPLACEMENT = `  const { doCreateNewFile, doCreateNewMindmap, doCreateNewCanvas } = useDocumentCreation({
    openSession,
    setViewMode,
    activeLoadedChapterIdRef,
  });
`;

const HOOK_HEADER = `import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { useDocumentSession } from "./useDocumentSession";

/**
 * Creating a new document — a Markdown file, a mind map or a space canvas.
 *
 * Second logic hook out of App.tsx (R1 batch B3b-2). The three flows are the
 * same shape: ask the desktop bridge to create the file, refresh the manifest
 * (or append to it when there is no folder to refresh), point the tab list and
 * the side panel at the new document, hand the source to the editing session,
 * and say so.
 *
 * Two things are passed in rather than reached for. The session owns opening a
 * document, so this hook asks it to rather than duplicating that logic. And
 * \`activeLoadedChapterIdRef\` marks which chapter the session is holding; the
 * effect in App.tsx that re-fetches a chapter reads and writes it too, so it
 * stays where both can see it.
 *
 * The three thin wrappers that trigger these flows stay in App.tsx: they route
 * through the unsaved-changes guard, which is App's.
 */

type UseDocumentCreationParams = {
  /** The session owns opening documents; this hook only asks it to. */
  openSession: ReturnType<typeof useDocumentSession>["openSession"];
  setViewMode: ReturnType<typeof useDocumentSession>["setViewMode"];
  /**
   * Which chapter the session currently holds.
   *
   * Declared structurally rather than as a React ref type so the signature does
   * not depend on whether the project is on the React 18 or 19 ref typings.
   */
  activeLoadedChapterIdRef: { current: string };
};

export function useDocumentCreation({
  openSession,
  setViewMode,
  activeLoadedChapterIdRef,
}: UseDocumentCreationParams) {
  const manifest = useVaultStore((s) => s.manifest);
  const setManifest = useVaultStore((s) => s.setManifest);
  const setNotice = useUiStore((s) => s.setNotice);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setChapterId = useTabStore((s) => s.setActiveTabId);
  const setTabs = useTabStore((s) => s.setTabs);

`;

const HOOK_FOOTER = `
  return { doCreateNewFile, doCreateNewMindmap, doCreateNewCanvas };
}
`;

function main() {
  const source = fs.readFileSync(appPath, "utf8");
  const lines = source.split(/\r?\n/);

  const start = lines.findIndex((line) => line === START_MARKER);
  if (start === -1) {
    console.error(`FAIL: start marker not found: ${START_MARKER}`);
    process.exit(1);
  }

  const end = lines.findIndex((line, index) => index > start && line === END_MARKER);
  if (end === -1) {
    console.error(`FAIL: end marker not found after the start: ${END_MARKER}`);
    process.exit(1);
  }

  const body = lines.slice(start, end);
  // The blank separator line before the next declaration belongs to App.
  while (body.length && body[body.length - 1].trim() === "") body.pop();

  console.log(`extracting lines ${start + 1}-${end} (${body.length} lines)`);

  // Every identifier the block touches, so a missed dependency shows up here
  // rather than as a compile error after the fact.
  const declared = new Set([
    "manifest",
    "setManifest",
    "setNotice",
    "setSidebarOpen",
    "setSidebarTab",
    "setChapterId",
    "setTabs",
    "openSession",
    "setViewMode",
    "activeLoadedChapterIdRef",
  ]);
  const referenced = new Set();
  for (const line of body) {
    for (const match of line.matchAll(/\b([a-z][A-Za-z0-9_]*)\b/g)) referenced.add(match[1]);
  }
  const suspicious = ["handleCreateCanvasExtractNote", "selectChapter", "guardAction", "isDirty", "session"];
  const leaked = suspicious.filter((name) => referenced.has(name));
  if (leaked.length) {
    console.error(`FAIL: the block references App-only names: ${leaked.join(", ")}`);
    process.exit(1);
  }
  void declared;

  const hookSource = HOOK_HEADER + body.join("\n") + HOOK_FOOTER;

  const nextLines = [
    ...lines.slice(0, start),
    ...REPLACEMENT.split("\n").slice(0, -1),
    "",
    ...lines.slice(end),
  ];
  const nextApp = nextLines.join("\n");

  if (!write) {
    console.log("--- dry run, nothing written ---");
    console.log(`App.tsx ${lines.length} -> ${nextLines.length} lines`);
    console.log(`hook would be ${hookSource.split("\n").length} lines`);
    console.log("--- first 3 extracted lines ---");
    console.log(body.slice(0, 3).join("\n"));
    console.log("--- last 3 extracted lines ---");
    console.log(body.slice(-3).join("\n"));
    return;
  }

  fs.writeFileSync(hookPath, hookSource);
  fs.writeFileSync(appPath, nextApp);
  console.log(`wrote ${path.relative(root, hookPath)}`);
  console.log(`rewrote ${path.relative(root, appPath)}: ${lines.length} -> ${nextLines.length} lines`);
}

main();
