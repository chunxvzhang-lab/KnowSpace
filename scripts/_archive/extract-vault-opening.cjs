/**
 * Moves the open-a-document flow out of App.tsx into useVaultOpening.
 *
 * Same approach as extract-document-creation.cjs: locate by marker, refuse to
 * run if either marker is missing, then rewrite both files. That script's
 * dependency check was a hard-coded guess and missed two names; this one relies
 * on tsc instead, which is exhaustive by nature, so the flow is extract, compile,
 * and add whatever the compiler names.
 *
 * Usage: node scripts/extract-vault-opening.cjs [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "src", "App.tsx");
const hookPath = path.join(root, "src", "hooks", "useVaultOpening.ts");
const write = process.argv.includes("--write");

const START_MARKER = "  const doOpenMarkdownFile = async (file: File) => {";
/**
 * The creation hook call sits between this block and openMarkdownFile, because
 * that is where the creation flow used to be. Ending here rather than at
 * openMarkdownFile keeps the call out of the extraction — the dry run showed it
 * being swallowed otherwise, which would have deleted it.
 */
const END_MARKER = "  const { doCreateNewFile, doCreateNewMindmap, doCreateNewCanvas } = useDocumentCreation({";

const REPLACEMENT = `  const { doOpenMarkdownFile, doOpenDesktopMarkdownPath, doOpenMarkdownDirectory } =
    useVaultOpening({
      openSession,
      setViewMode,
      activeLoadedChapterIdRef,
      pendingBookmarkRef,
    });
`;

const HOOK_HEADER = `import { useRef } from "react";
import { loadBookmarks } from "../services/storage";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { Bookmark } from "../core/types";
import type { useDocumentSession } from "./useDocumentSession";

/**
 * Opening a document: a file dropped or picked, a path handed over by the
 * desktop shell, or a whole folder.
 *
 * Third logic hook out of App.tsx (R1 batch B3b-3), and the largest single
 * block to leave so far. The three flows share a shape — work out what was
 * asked for, read the source, build or refresh the manifest, register the tab,
 * hand the source to the session — but each has its own edge cases, and they
 * are kept separate rather than merged behind a parameter for the same reason
 * the creation flows are.
 *
 * \`openRequestRef\` lives here because this is its only reader and writer: it
 * counts requests so a slow read that has been overtaken by a newer one can
 * notice and abandon its result.
 *
 * Two refs travel in. \`activeLoadedChapterIdRef\` marks which chapter the
 * session holds and is also read by the loading effect that stays in App.tsx.
 * \`pendingBookmarkRef\` is shared with the bookmark jump, which is a separate
 * concern that happens to hand over the same way.
 */

type UseVaultOpeningParams = {
  /** The session owns opening documents; this hook only asks it to. */
  openSession: ReturnType<typeof useDocumentSession>["openSession"];
  setViewMode: ReturnType<typeof useDocumentSession>["setViewMode"];
  activeLoadedChapterIdRef: { current: string };
  /** A bookmark waiting for its chapter to finish loading. */
  pendingBookmarkRef: { current: Bookmark | null };
};

export function useVaultOpening({
  openSession,
  setViewMode,
  activeLoadedChapterIdRef,
  pendingBookmarkRef,
}: UseVaultOpeningParams) {
  const manifest = useVaultStore((s) => s.manifest);
  const setManifest = useVaultStore((s) => s.setManifest);
  const setBookmarks = useVaultStore((s) => s.setBookmarks);
  const setNotice = useUiStore((s) => s.setNotice);
  const setDirectoryOpen = useUiStore((s) => s.setDirectoryOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setChapterId = useTabStore((s) => s.setActiveTabId);
  const setTabs = useTabStore((s) => s.setTabs);

  /**
   * Counts open requests so a slow read that has been superseded can abandon
   * its result instead of overwriting the newer one.
   */
  const openRequestRef = useRef(0);

`;

const HOOK_FOOTER = `
  return { doOpenMarkdownFile, doOpenDesktopMarkdownPath, doOpenMarkdownDirectory };
}
`;

function main() {
  const lines = fs.readFileSync(appPath, "utf8").split(/\r?\n/);

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
  while (body.length && body[body.length - 1].trim() === "") body.pop();

  console.log(`extracting lines ${start + 1}-${end} (${body.length} lines)`);

  const nextLines = [
    ...lines.slice(0, start),
    ...REPLACEMENT.split("\n").slice(0, -1),
    "",
    ...lines.slice(end),
  ];

  if (!write) {
    console.log("--- dry run, nothing written ---");
    console.log(`App.tsx ${lines.length} -> ${nextLines.length} lines`);
    console.log("--- first 2 extracted lines ---");
    console.log(body.slice(0, 2).join("\n"));
    console.log("--- last 2 extracted lines ---");
    console.log(body.slice(-2).join("\n"));
    return;
  }

  fs.writeFileSync(hookPath, HOOK_HEADER + body.join("\n") + HOOK_FOOTER);
  fs.writeFileSync(appPath, nextLines.join("\n"));
  console.log(`wrote ${path.relative(root, hookPath)}`);
  console.log(`rewrote ${path.relative(root, appPath)}: ${lines.length} -> ${nextLines.length} lines`);
}

main();
