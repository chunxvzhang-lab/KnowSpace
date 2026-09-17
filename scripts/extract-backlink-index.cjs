/**
 * Moves the backlink and graph cluster out of App.tsx into useBacklinkIndex.
 *
 * The block is contiguous — two effects (the idle index builder and the
 * incremental update on save), four derived values, and the two callbacks that
 * jump to a backlink and turn an unlinked mention into a wiki link.
 *
 * Seven names come back out, which is more than any previous batch and worth
 * stating plainly: the side panel and the graph pane read currentLinkedReferences,
 * currentUnlinkedMentions, graphData, currentActiveId and currentDocTitle, and
 * two of them are needed in three places further down. isBacklinksVisible and
 * isGraphVisible stay internal; nothing outside reads them.
 *
 * The start is located by an anchor inside the effect body and then backed up to
 * the useEffect line, because `  useEffect(() => {` on its own matches fifteen
 * other places in this file.
 *
 * Usage: node scripts/extract-backlink-index.cjs [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "src", "App.tsx");
const hookPath = path.join(root, "src", "hooks", "useBacklinkIndex.ts");
const write = process.argv.includes("--write");

/** A line unique to the index builder, used to find where the block starts. */
const START_ANCHOR = "    if (!manifest?.chapters?.length) return;";
const END_MARKER = "  const handleRenameChapter = useCallback(";

const REPLACEMENT = `  // ── Backlinks and the graph (R1 batch B3b-5) ─────────────────────────────
  //
  // Seven names come back out: the side panel and the graph pane read five of
  // them, and two are needed again further down. backlinkIndex itself stays
  // subscribed here because three later call sites read it directly.
  const {
    currentLinkedReferences,
    currentUnlinkedMentions,
    graphData,
    handleJumpToBacklink,
    handleConvertMention,
    currentActiveId,
    currentDocTitle,
  } = useBacklinkIndex({
    session,
    activeChapter,
    selectChapter,
    editorViewRef,
  });
`;

const HOOK_HEADER = `import { useCallback, useEffect, useMemo } from "react";
import { loadChapterMarkdown } from "../services/bookSource";
import {
  convertUnlinkedMentionInText,
  getLinkedReferences,
  getUnlinkedMentions,
  refactorWikiLinksInContent,
  updateDocumentInIndex,
} from "../services/backlinkIndex";
import { buildGraphDataFromIndex } from "../services/graphService";
import { updateVaultSearchIndexForDocument } from "../services/searchIndexService";
import { useTabStore } from "../store/useTabStore";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";
import type { ChapterManifest } from "../core/types";
import type { EditorView } from "@codemirror/view";
import type { DocumentSessionState } from "./useDocumentSession";

/**
 * The backlink index, the graph derived from it, and the two actions that act
 * on it — jumping to a referring document, and turning a mention into a link.
 *
 * Fifth logic hook out of App.tsx (R1 batch B3b-5). It holds the whole
 * lifecycle: the index is built document by document on idle callbacks so the
 * editor stays responsive on a large vault, kept up to date as documents are
 * saved, and read back as references for the panel and as nodes for the graph.
 *
 * Three things travel in. \`session\` and \`activeChapter\` say which document the
 * index should be updated with. \`selectChapter\` lets a backlink navigate
 * through App's unsaved-changes guard rather than around it. \`editorViewRef\` is
 * where a converted mention is written when the editor is showing.
 *
 * The index itself is not returned: three call sites further down App.tsx read
 * it straight from the store, and duplicating it here would give the same value
 * two owners.
 */

type UseBacklinkIndexParams = {
  session: DocumentSessionState["session"];
  activeChapter?: ChapterManifest;
  selectChapter: (chapterId: string) => void;
  editorViewRef: { current: EditorView | null };
};

export function useBacklinkIndex({
  session,
  activeChapter,
  selectChapter,
  editorViewRef,
}: UseBacklinkIndexParams) {
  const manifest = useVaultStore((s) => s.manifest);
  const backlinkIndex = useVaultStore((s) => s.backlinkIndex);
  const setBacklinkIndex = useVaultStore((s) => s.setBacklinkIndex);
  const setVaultSearchIndex = useVaultStore((s) => s.setVaultSearchIndex);
  const setNotice = useUiStore((s) => s.setNotice);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const isGraphPaneOpen = useUiStore((s) => s.isGraphPaneOpen);
  const chapterId = useTabStore((s) => s.activeTabId);

`;

const HOOK_FOOTER = `
  return {
    currentLinkedReferences,
    currentUnlinkedMentions,
    graphData,
    handleJumpToBacklink,
    handleConvertMention,
    currentActiveId,
    currentDocTitle,
  };
}
`;

function main() {
  const lines = fs.readFileSync(appPath, "utf8").split(/\r?\n/);

  const anchor = lines.findIndex((line) => line === START_ANCHOR);
  if (anchor === -1) {
    console.error(`FAIL: start anchor not found: ${START_ANCHOR}`);
    process.exit(1);
  }
  // Back up to the useEffect that owns the anchor.
  let start = -1;
  for (let i = anchor; i >= Math.max(0, anchor - 10); i -= 1) {
    if (/^  useEffect\(/.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) {
    console.error("FAIL: no useEffect found above the start anchor");
    process.exit(1);
  }

  const end = lines.findIndex(
    (line, index) => index > start && line === END_MARKER
  );
  if (end === -1) {
    console.error(`FAIL: end marker not found: ${END_MARKER}`);
    process.exit(1);
  }

  const body = lines.slice(start, end);
  const isTrailer = (line) => line.trim() === "" || line.trim().startsWith("//");
  while (body.length && isTrailer(body[body.length - 1])) body.pop();

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
