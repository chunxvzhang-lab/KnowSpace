/**
 * Moves the desktop shell wiring and the keyboard shortcuts out of App.tsx into
 * useGlobalShortcuts.
 *
 * Two non-contiguous effects, five hundred lines apart:
 *
 *   A (851-907): launch file, menu commands, the close guard, flash-note refresh.
 *   B (1404-1588): the key handler.
 *
 * They move together because they are the same concern — the ways the app is
 * driven from outside its own UI — and because both are pure plumbing over
 * refs that App.tsx already keeps to avoid stale closures.
 *
 * Three of the four boundaries need the anchor-and-back-up trick rather than a
 * single marker line: `  useEffect(() => {` matches fifteen places here, and the
 * effect bodies are the only unique part. The end of block B is found the same
 * way, by anchoring on the notice effect's first line and backing up to its
 * opening.
 *
 * Usage: node scripts/extract-global-shortcuts.cjs [--write]
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appPath = path.join(root, "src", "App.tsx");
const hookPath = path.join(root, "src", "hooks", "useGlobalShortcuts.ts");
const write = process.argv.includes("--write");

const A_ANCHOR = "    if (!window.bookMDDesktop) return undefined;";
const A_END = "  // Load chapter content when chapterId changes";
const B_ANCHOR = "    const onKey = (event: KeyboardEvent) => {";
const NOTICE_ANCHOR = "    if (!notice) return;";

const REPLACEMENT = `  // ── Desktop shell wiring and keyboard shortcuts (R1 batch B3b-6) ─────────
  //
  // The eight refs below are the same mirrors App.tsx already kept: these
  // handlers are registered once and must not close over values that change.
  useGlobalShortcuts({
    initialHandledRef,
    openDesktopMarkdownPathRef,
    createNewFileRef,
    openMarkdownDirectoryRef,
    saveSessionRef,
    saveSessionAsRef,
    toggleFullscreenRef,
    guardActionRef,
  });
`;

const HOOK_HEADER = `import { useEffect } from "react";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";

/**
 * How the app is driven from outside its own UI: the launch file, the
 * application menu, the close guard, flash-note refreshes, and the keyboard.
 *
 * Sixth logic hook out of App.tsx (R1 batch B3b-6). The two effects it holds
 * were five hundred lines apart in the component and belong together — both are
 * registrations that live for the life of the window and both are written in
 * terms of the same refs.
 *
 * Those refs are the point of the interface. Every one of them mirrors a value
 * App.tsx owns, because a handler registered once cannot close over a callback
 * that changes identity on the next render. Passing the mirrors in keeps that
 * mechanism intact; the alternative would be for this hook to reach back into
 * App, which it cannot.
 */

type UseGlobalShortcutsParams = {
  /** The launch file has already been handled this session. */
  initialHandledRef: { current: boolean };
  openDesktopMarkdownPathRef: { current: (absolutePath: string) => void };
  createNewFileRef: { current: () => void };
  openMarkdownDirectoryRef: { current: () => void };
  saveSessionRef: { current: () => void };
  saveSessionAsRef: { current: () => void };
  toggleFullscreenRef: { current: () => void };
  guardActionRef: { current: (action: unknown) => void };
};

export function useGlobalShortcuts({
  initialHandledRef,
  openDesktopMarkdownPathRef,
  createNewFileRef,
  openMarkdownDirectoryRef,
  saveSessionRef,
  saveSessionAsRef,
  toggleFullscreenRef,
  guardActionRef,
}: UseGlobalShortcutsParams) {
  const setNotice = useUiStore((s) => s.setNotice);
  const setManifest = useVaultStore((s) => s.setManifest);

`;

const HOOK_FOOTER = `}
`;

function backUpToEffect(lines, anchorIndex) {
  for (let i = anchorIndex; i >= Math.max(0, anchorIndex - 12); i -= 1) {
    if (/^  useEffect\(/.test(lines[i])) return i;
  }
  return -1;
}

function main() {
  const lines = fs.readFileSync(appPath, "utf8").split(/\r?\n/);

  const aAnchor = lines.findIndex((line) => line === A_ANCHOR);
  const aStart = backUpToEffect(lines, aAnchor);
  const aEnd = lines.findIndex((line) => line === A_END);
  const bAnchor = lines.findIndex((line) => line === B_ANCHOR);
  const bStart = backUpToEffect(lines, bAnchor);
  const nAnchor = lines.findIndex((line) => line === NOTICE_ANCHOR);
  const bEnd = backUpToEffect(lines, nAnchor);

  for (const [name, value] of Object.entries({ aStart, aEnd, bStart, bEnd })) {
    if (value === -1 || value === undefined) {
      console.error(`FAIL: could not resolve ${name}`);
      process.exit(1);
    }
  }
  if (!(aStart < aEnd && aEnd < bStart && bStart < bEnd)) {
    console.error("FAIL: block ranges are out of order");
    process.exit(1);
  }

  const blockA = lines.slice(aStart, aEnd);
  const blockB = lines.slice(bStart, bEnd);
  const isTrailer = (line) => line.trim() === "" || line.trim().startsWith("//");
  while (blockA.length && isTrailer(blockA[blockA.length - 1])) blockA.pop();
  while (blockB.length && isTrailer(blockB[blockB.length - 1])) blockB.pop();

  console.log(`block A: lines ${aStart + 1}-${aEnd} (${blockA.length} lines)`);
  console.log(`block B: lines ${bStart + 1}-${bEnd} (${blockB.length} lines)`);

  const nextLines = [
    ...lines.slice(0, aStart),
    ...lines.slice(aEnd, bStart),
    ...REPLACEMENT.split("\n").slice(0, -1),
    "",
    ...lines.slice(bEnd),
  ];

  if (!write) {
    console.log("--- dry run, nothing written ---");
    console.log(`App.tsx ${lines.length} -> ${nextLines.length} lines`);
    console.log("--- A: first / last ---");
    console.log(blockA[0]);
    console.log(blockA[blockA.length - 1]);
    console.log("--- B: first / last ---");
    console.log(blockB[0]);
    console.log(blockB[blockB.length - 1]);
    return;
  }

  fs.writeFileSync(hookPath, HOOK_HEADER + blockA.join("\n") + "\n\n" + blockB.join("\n") + HOOK_FOOTER);
  fs.writeFileSync(appPath, nextLines.join("\n"));
  console.log(`wrote ${path.relative(root, hookPath)}`);
  console.log(`rewrote ${path.relative(root, appPath)}: ${lines.length} -> ${nextLines.length} lines`);
}

main();
