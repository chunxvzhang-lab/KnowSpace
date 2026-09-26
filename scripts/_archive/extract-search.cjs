/**
 * Moves the search cluster out of App.tsx into useSearch.
 *
 * Two non-contiguous blocks: the results memo near the top of the component,
 * and the navigation and highlighting callbacks further down. The memo has to
 * land in the hook before the callbacks that read it, so the script assembles
 * the hook in that order regardless of where the blocks sit in App.
 *
 * Five names come back out — searchResults, jumpToHeading, jumpToRatio,
 * clearSearchHighlights and handleSearchJump — because App.tsx and its JSX use
 * them outside the cluster: the bookmark jump calls two of them, three effects
 * call them, and SearchPanel takes two as props.
 *
 * No hand-written dependency list; tsc finds the omissions, which it did six
 * times for the previous block.
 *
 * Usage: node scripts/extract-search.cjs [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "src", "App.tsx");
const hookPath = path.join(root, "src", "hooks", "useSearch.ts");
const write = process.argv.includes("--write");

/** Block A: the results memo, which the callbacks below depend on. */
const A_START = "  const isSearchActive = (sidebarOpen && sidebarTab === \"search\") || commandPaletteOpen;";
const A_END = "  const bookmarkedHeadingIds = useMemo(() => {";

/** Block B: the navigation and highlighting callbacks. */
const B_START = "  const jumpToHeading = useCallback(";
const B_END = "  const executeAction = useCallback(";

const REPLACEMENT = `  // ── Search (R1 batch B3b-4) ──────────────────────────────────────────────
  //
  // The five names the rest of the file uses come back out of the hook: the
  // bookmark jump calls jumpToHeading and jumpToRatio, three effects call them,
  // and SearchPanel takes searchResults and handleSearchJump as props.
  const {
    searchResults,
    jumpToHeading,
    jumpToRatio,
    clearSearchHighlights,
    handleSearchJump,
  } = useSearch({
    renderedChapter,
    session,
    editorViewRef,
    readerRef,
    selectChapterRef,
    setActiveHeadingId,
  });
`;

const HOOK_HEADER = `import { useCallback, useMemo } from "react";
import { findInChapter } from "../services/markdown";
import { searchVault } from "../services/searchIndexService";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { EditorView } from "@codemirror/view";
import type { RenderedChapter, SearchResult } from "../core/types";
import type { DocumentSessionState } from "./useDocumentSession";

/**
 * Search: running the query, jumping to a hit, and highlighting it.
 *
 * Fourth logic hook out of App.tsx (R1 batch B3b-4) and the largest cluster to
 * leave so far. It spans two regions of the component — the results memo and
 * the navigation callbacks — which is why they move together: the callbacks
 * read the memo, and splitting them would mean threading the results through a
 * parameter for no reason.
 *
 * Four things are passed in rather than reached for, all of them shared with
 * parts of App.tsx that are not about searching:
 *
 * - \`renderedChapter\` and \`session\` come from the editing session.
 * - \`editorViewRef\` and \`readerRef\` are the two scroll surfaces. Highlighting
 *   and jumping both need to reach whichever one is showing, and the reading
 *   position restore in App.tsx scrolls the same two.
 * - \`selectChapterRef\` lets a hit in another document navigate there through
 *   App's unsaved-changes guard rather than bypassing it.
 * - \`setActiveHeadingId\` tracks the reader's position, which stays in App.tsx
 *   because it describes the rendered document rather than the search.
 */

type UseSearchParams = {
  renderedChapter: RenderedChapter | null;
  session: DocumentSessionState["session"];
  editorViewRef: { current: EditorView | null };
  readerRef: { current: HTMLElement | null };
  selectChapterRef: { current: (chapterId: string) => void };
  setActiveHeadingId: (headingId: string | undefined) => void;
};

export function useSearch({
  renderedChapter,
  session,
  editorViewRef,
  readerRef,
  selectChapterRef,
  setActiveHeadingId,
}: UseSearchParams) {
  const searchQuery = useVaultStore((s) => s.searchQuery);
  const searchScope = useVaultStore((s) => s.searchScope);
  const vaultSearchIndex = useVaultStore((s) => s.vaultSearchIndex);
  const setSearchQuery = useVaultStore((s) => s.setSearchQuery);
  const setActiveSearchMatchId = useVaultStore((s) => s.setActiveSearchMatchId);

  // Whether the results are on screen at all — the side panel is showing them,
  // or the command palette is.
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);

  const isSearchActive = (sidebarOpen && sidebarTab === "search") || commandPaletteOpen;
  const searchResults = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || !isSearchActive) return [];
    if (searchScope === "vault") {
      return searchVault(vaultSearchIndex, trimmed);
    }
    return renderedChapter
      ? findInChapter(trimmed, renderedChapter.plainText, renderedChapter.headings, session?.source)
      : [];
  }, [searchScope, vaultSearchIndex, searchQuery, isSearchActive, renderedChapter, session?.source]);

`;

const HOOK_FOOTER = `
  return {
    searchResults,
    jumpToHeading,
    jumpToRatio,
    clearSearchHighlights,
    handleSearchJump,
  };
}
`;

function indexOfLine(lines, marker, from = 0) {
  const index = lines.findIndex((line, i) => i >= from && line === marker);
  if (index === -1) {
    console.error(`FAIL: marker not found${from ? ` after line ${from}` : ""}: ${marker}`);
    process.exit(1);
  }
  return index;
}

function main() {
  const lines = fs.readFileSync(appPath, "utf8").split(/\r?\n/);

  const aStart = indexOfLine(lines, A_START);
  const aEnd = indexOfLine(lines, A_END, aStart);
  const bStart = indexOfLine(lines, B_START, aEnd);
  const bEnd = indexOfLine(lines, B_END, bStart);

  if (!(aStart < aEnd && aEnd < bStart && bStart < bEnd)) {
    console.error("FAIL: block ranges are out of order");
    process.exit(1);
  }

  const blockB = lines.slice(bStart, bEnd);
  // Trailing blanks go, and so do trailing comments: the comment immediately
  // above executeAction explains executeAction, not this cluster, and the first
  // dry run showed it being swallowed. The block itself ends with `};`.
  const isTrailer = (line) => line.trim() === "" || line.trim().startsWith("//");
  while (blockB.length && isTrailer(blockB[blockB.length - 1])) blockB.pop();

  console.log(`block A: lines ${aStart + 1}-${aEnd} (${aEnd - aStart} lines)`);
  console.log(`block B: lines ${bStart + 1}-${bEnd} (${blockB.length} lines)`);

  const nextLines = [
    ...lines.slice(0, aStart),
    // everything between the two blocks stays put: bookmarkedHeadingIds,
    // handleMermaidError and the useColumnResize call all live here
    ...lines.slice(aEnd, bStart),
    ...REPLACEMENT.split("\n").slice(0, -1),
    "",
    ...lines.slice(bEnd),
  ];

  if (!write) {
    console.log("--- dry run, nothing written ---");
    console.log(`App.tsx ${lines.length} -> ${nextLines.length} lines`);
    console.log("--- B: first 2 ---");
    console.log(blockB.slice(0, 2).join("\n"));
    console.log("--- B: last 2 ---");
    console.log(blockB.slice(-2).join("\n"));
    console.log("--- App around the join ---");
    console.log(nextLines.slice(aStart - 2, aStart + 8).join("\n"));
    return;
  }

  fs.writeFileSync(hookPath, HOOK_HEADER + blockB.join("\n") + HOOK_FOOTER);
  fs.writeFileSync(appPath, nextLines.join("\n"));
  console.log(`wrote ${path.relative(root, hookPath)}`);
  console.log(`rewrote ${path.relative(root, appPath)}: ${lines.length} -> ${nextLines.length} lines`);
}

main();
