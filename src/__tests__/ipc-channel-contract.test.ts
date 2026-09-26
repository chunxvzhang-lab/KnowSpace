import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * IPC channel contract guard.
 *
 * `electron/preload.cjs` exposes ~60 methods; `electron/main.cjs` registers the
 * handlers; `src/types/desktop.d.ts` tells the renderer what exists. Nothing
 * cross-checks these three surfaces: TypeScript never sees the .cjs files, and
 * the channel name is a string literal on both ends. A renderer call whose
 * channel nobody handles fails at runtime — as a TypeError or an eternal
 * pending promise — and only when that specific feature is first used. All
 * three signals stay silent: no compile error, no console noise, and no test
 * reads either .cjs file. This guard is the machine check (guide rule 10).
 *
 * Guard shape follows the five-element template the CSS guards established:
 *  1. single source of truth — the .cjs / .d.ts files are parsed, never copied;
 *  2. set assertions — caller ⊆ handler, handler ⊆ caller, type ⊆ impl;
 *  3. negative contrast — the parsers must flag a missing handler on a fixture
 *     and must pass a complete one (a guard that cannot fail is worse than none);
 *  4. parser self-check — a regex that silently matches nothing would turn every
 *     assertion green, so parsed counts are pinned above thresholds;
 *  5. allowlists decay — a waived mismatch that gets fixed must be removed,
 *     and every waiver needs a reason of at least 20 characters.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const preloadPath = join(repoRoot, "electron", "preload.cjs");
const dtsPath = join(repoRoot, "src", "types", "desktop.d.ts");

const read = (p: string) => readFileSync(p, "utf8");

const lineOf = (text: string, index: number) => text.slice(0, index).split(/\r?\n/).length;

function matchChannels(text: string, re: RegExp) {
  const found = new Map<string, { line: number }>();
  for (const m of text.matchAll(re)) {
    found.set(m[1], { line: lineOf(text, m.index ?? 0) });
  }
  return found;
}

const parsePreloadInvoke = (text: string) =>
  matchChannels(text, /ipcRenderer\.invoke\(\s*["']([^"']+)["']/g);
const parsePreloadSendSync = (text: string) =>
  matchChannels(text, /ipcRenderer\.sendSync\(\s*["']([^"']+)["']/g);
const parsePreloadListeners = (text: string) =>
  matchChannels(text, /ipcRenderer\.on\(\s*["']([^"']+)["']/g);

/** Keys of the `const desktopApi = { ... }` literal: 2-space indented. */
function parsePreloadMethods(text: string) {
  const names = new Map<string, number>();
  for (const m of text.matchAll(/^ {2}([A-Za-z_$][\w$]*):/gm)) {
    names.set(m[1], lineOf(text, m.index ?? 0));
  }
  return names;
}

/** Keys of the `KnowSpaceDesktopAPI` type: 2-space indent, nested object
 * members sit at 4 and must not be mistaken for methods. */
function parseDtsMethods(text: string) {
  const start = text.indexOf("export type KnowSpaceDesktopAPI = {");
  if (start === -1) return new Map<string, number>();
  const end = text.indexOf("\n};", start);
  const block = text.slice(start, end === -1 ? undefined : end);
  const names = new Map<string, number>();
  for (const m of block.matchAll(/^ {2}([A-Za-z_$][\w$]*)\??:/gm)) {
    names.set(m[1], lineOf(text, start + (m.index ?? 0)));
  }
  return names;
}

function parseElectronDirectory() {
  const dir = join(repoRoot, "electron");
  const handles = new Map<string, { line: number }>();
  const ons = new Map<string, { line: number }>();
  const sends = new Map<string, { line: number }>();
  for (const entry of readdirSync(dir).sort()) {
    if (!entry.endsWith(".cjs")) continue;
    const text = read(join(dir, entry));
    for (const [map, re] of [
      [handles, /ipcMain\.handle\(\s*["']([^"']+)["']/g],
      [ons, /ipcMain\.on\(\s*["']([^"']+)["']/g],
      [sends, /\.send\(\s*["']([^"']+)["']/g],
    ] as const) {
      for (const m of text.matchAll(re)) {
        if (!map.has(m[1])) map.set(m[1], { line: lineOf(text, m.index ?? 0) });
      }
    }
  }
  return { handles, ons, sends };
}

/** Channels main registers but nothing in preload calls. */
const ALLOWED_MAIN_ONLY: { channel: string; reason: string }[] = [];
/** Methods the .d.ts promises but preload does not implement. */
const ALLOWED_DTS_ONLY: { name: string; reason: string }[] = [];
/** Methods preload implements but the .d.ts does not declare. */
const ALLOWED_PRELOAD_ONLY: { name: string; reason: string }[] = [];

const diffSets = <T>(a: Map<string, T>, b: Map<string, T>) => {
  const onlyA = new Set([...a.keys()].filter((k) => !b.has(k)));
  const onlyB = new Set([...b.keys()].filter((k) => !a.has(k)));
  return { onlyA, onlyB };
}

/** Element ③: run the real contract logic on fixtures — a hole must be found. */
function missingHandlers(preloadText: string, mainText: string) {
  const invoke = parsePreloadInvoke(preloadText);
  const handled = matchChannels(mainText, /ipcMain\.handle\(\s*["']([^"']+)["']/g);
  return [...diffSets(invoke, handled).onlyA];
}

describe("IPC channel contract (preload.cjs ↔ main.cjs ↔ desktop.d.ts)", () => {
  const preload = read(preloadPath);
  const dts = read(dtsPath);
  const main = parseElectronDirectory();

  const invoke = parsePreloadInvoke(preload);
  const sendSync = parsePreloadSendSync(preload);
  const listeners = parsePreloadListeners(preload);
  const methods = parsePreloadMethods(preload);
  const dtsMethods = parseDtsMethods(dts);

  it("parser self-check: parsed surfaces are above plausible-empty thresholds", () => {
    // Element ④. A broken regex would yield empty sets and everything below
    // would pass vacuously. Counts hold even if a few channels move around;
    // a real refactor past these bounds should raise them deliberately.
    expect(invoke.size).toBeGreaterThanOrEqual(40);
    expect(sendSync.size).toBeGreaterThanOrEqual(1);
    expect(listeners.size).toBeGreaterThanOrEqual(5);
    expect(methods.size).toBeGreaterThanOrEqual(50);
    expect(dtsMethods.size).toBeGreaterThanOrEqual(50);
    expect(main.handles.size).toBeGreaterThanOrEqual(40);
    expect(main.sends.size).toBeGreaterThanOrEqual(5);
  });

  it("parser self-check: channel names are string literals, not template expressions", () => {
    // The guard can only see literal channels. A backtick channel would be
    // invisible to it AND to TypeScript — forbid the pattern outright.
    expect(preload.matchAll(/ipcRenderer\.(?:invoke|sendSync|on)\(\s*`/g).next().done).toBe(true);
    for (const re of [/ipcMain\.handle\(\s*`/g, /ipcMain\.on\(\s*`/g]) {
      for (const text of [read(join(repoRoot, "electron", "main.cjs"))]) {
        expect(text.matchAll(re).next().done).toBe(true);
      }
    }
  });

  it("every preload invoke channel has a registered handler in main", () => {
    // Failure output carries preload.cjs:line — line numbers are the only way
    // to navigate a 130-line bridge file from a test report.
    const unhandled = [...invoke.entries()]
      .filter(([channel]) => !main.handles.has(channel))
      .map(([channel, loc]) => `${channel} (preload.cjs:${loc.line})`);
    expect(unhandled).toEqual([]);
  });

  it("every preload sendSync channel has an ipcMain.on listener in main", () => {
    const unhandled = [...sendSync.entries()]
      .filter(([channel]) => !main.ons.has(channel))
      .map(([channel, loc]) => `${channel} (preload.cjs:${loc.line})`);
    expect(unhandled).toEqual([]);
  });

  it("every channel preload subscribes to is actually sent by main", () => {
    const unsent = [...listeners.entries()]
      .filter(([channel]) => !main.sends.has(channel))
      .map(([channel, loc]) => `${channel} (preload.cjs:${loc.line})`);
    expect(unsent).toEqual([]);
  });

  it("every handler main registers is reachable from preload (no dead handlers)", () => {
    const orphans = [...diffSets(main.handles, invoke).onlyA].filter(
      (channel) => !ALLOWED_MAIN_ONLY.some((a) => a.channel === channel)
    );
    expect(orphans).toEqual([]);
  });

  it("both contextBridge names stay exposed (knowSpaceDesktop + bookMDDesktop)", () => {
    // Two names were kept for compatibility with code written before the
    // rename. Dropping one silently breaks every `(window as ...).bookMDDesktop`
    // call site — exactly the silent-failure class this guard exists for.
    expect(preload).toContain('exposeInMainWorld("knowSpaceDesktop"');
    expect(preload).toContain('exposeInMainWorld("bookMDDesktop"');
  });

  it("every method preload exposes is declared in desktop.d.ts", () => {
    const { onlyA } = diffSets(methods, dtsMethods);
    const undeclared = [...onlyA].filter((name) => !ALLOWED_PRELOAD_ONLY.some((a) => a.name === name));
    expect(undeclared).toEqual([]);
  });

  it("every method desktop.d.ts declares is implemented by preload", () => {
    const { onlyB } = diffSets(methods, dtsMethods);
    const unimplemented = [...onlyB].filter((name) => !ALLOWED_DTS_ONLY.some((a) => a.name === name));
    expect(unimplemented).toEqual([]);
  });

  it("allowlist decay: every waiver is still a real mismatch with a real reason", () => {
    // Element ⑤. A waiver whose mismatch got fixed is hiding surface area
    // that should be asserted again; a short reason is a waiver nobody can
    // evaluate in review.
    for (const waiver of [...ALLOWED_MAIN_ONLY, ...ALLOWED_DTS_ONLY, ...ALLOWED_PRELOAD_ONLY]) {
      expect(waiver.reason.length).toBeGreaterThanOrEqual(20);
      const stillMismatched =
        ("channel" in waiver && main.handles.has(waiver.channel) && !invoke.has(waiver.channel)) ||
        ("name" in waiver && !methods.has(waiver.name) && dtsMethods.has(waiver.name)) ||
        ("name" in waiver && methods.has(waiver.name) && !dtsMethods.has(waiver.name));
      expect(stillMismatched).toBe(true);
    }
  });
});

describe("IPC guard negative contrast (the guard itself must be able to fail)", () => {
  // Element ③. A regression here — someone "simplifies" a parser into always
  // returning an empty set — would turn every assertion above green while
  // checking nothing. These fixtures pin the parsers to known answers.
  const completePreload = 'const api = { ping: () => ipcRenderer.invoke("t:ping") };';
  const completeMain = 'ipcMain.handle("t:ping", () => {});';
  const brokenMain = 'ipcMain.handle("t:other", () => {});';

  it("a complete fixture passes", () => {
    expect(missingHandlers(completePreload, completeMain)).toEqual([]);
  });

  it("a fixture with an unhandled channel is detected by channel name", () => {
    expect(missingHandlers(completePreload, brokenMain)).toEqual(["t:ping"]);
  });

  it("an empty parse fails the self-check threshold instead of passing vacuously", () => {
    expect(parsePreloadInvoke("").size).toBe(0);
    expect(parsePreloadInvoke("").size).toBeLessThan(40);
  });
});
