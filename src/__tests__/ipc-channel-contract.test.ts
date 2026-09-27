import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * IPC channel contract guard.
 *
 * `electron/preload.cjs` exposes ~67 methods under five namespaces
 * (files/history/media/system/capture); `electron/main.cjs` registers the
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
 *  2. set assertions — caller ⊆ handler, handler ⊆ caller, type ⊆ impl, and
 *     per-namespace method equality between preload and the .d.ts;
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
const packageJsonPath = join(repoRoot, "package.json");

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

/** The five namespaces of the bridge, in both preload.cjs and desktop.d.ts. */
const NAMESPACE_KEYS = ["files", "history", "media", "system", "capture"] as const;

/**
 * Methods inside the namespace blocks of the bridge shape. A namespace opens
 * with `  files: {` (2-space indent), its methods sit at 4-space indent, and
 * the block closes with a 2-space `}` — deeper-nested object members (request
 * payload shapes, listener bodies) sit at 6+ spaces and never match.
 */
function parseBridgeNamespaces(text: string) {
  const namespaces = new Map<string, Map<string, { line: number }>>();
  const opener = new RegExp(`^ {2}(${NAMESPACE_KEYS.join("|")}): \\{$`);
  const closer = /^ {2}[},][,;]?$/;
  const member = /^ {4}([A-Za-z_$][\w$]*)\??:/;
  let current: string | null = null;
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (current === null) {
      const open = line.match(opener);
      if (open) {
        current = open[1];
        namespaces.set(current, new Map());
      }
      continue;
    }
    if (closer.test(line)) {
      current = null;
      continue;
    }
    const key = line.match(member);
    if (key) {
      namespaces.get(current)?.set(key[1], { line: index + 1 });
    }
  }
  return namespaces;
}

/** Union of every method across the five namespaces, with its namespace. */
function flattenNamespaces(namespaces: ReturnType<typeof parseBridgeNamespaces>) {
  const flat = new Map<string, { namespace: string }>();
  for (const [namespace, methods] of namespaces) {
    for (const name of methods.keys()) {
      flat.set(name, { namespace });
    }
  }
  return flat;
}

/** The `API_VERSION` literal preload reports during the startup handshake. */
function parsePreloadApiVersion(text: string) {
  const m = text.match(/^const API_VERSION = "([^"]+)";$/m);
  return m?.[1] ?? null;
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
};

/** Element ③: run the real contract logic on fixtures — a hole must be found. */
function missingHandlers(preloadText: string, mainText: string) {
  const invoke = parsePreloadInvoke(preloadText);
  const handled = matchChannels(mainText, /ipcMain\.handle\(\s*["']([^"']+)["']/g);
  return [...diffSets(invoke, handled).onlyA];
}

describe("IPC channel contract (preload.cjs ↔ main.cjs ↔ desktop.d.ts)", () => {
  const preload = read(preloadPath);
  const dts = read(dtsPath);
  const packageVersion = JSON.parse(read(packageJsonPath)).version as string;
  const main = parseElectronDirectory();

  const invoke = parsePreloadInvoke(preload);
  const sendSync = parsePreloadSendSync(preload);
  const listeners = parsePreloadListeners(preload);
  const preloadNamespaces = parseBridgeNamespaces(preload);
  const dtsNamespaces = parseBridgeNamespaces(dts);
  const methods = flattenNamespaces(preloadNamespaces);
  const dtsMethods = flattenNamespaces(dtsNamespaces);

  it("parser self-check: parsed surfaces are above plausible-empty thresholds", () => {
    // Element ④. A broken regex would yield empty sets and everything below
    // would pass vacuously. Counts hold even if a few channels move around;
    // a real refactor past these bounds should raise them deliberately.
    expect(invoke.size).toBeGreaterThanOrEqual(40);
    expect(sendSync.size).toBeGreaterThanOrEqual(1);
    expect(listeners.size).toBeGreaterThanOrEqual(5);
    expect(main.handles.size).toBeGreaterThanOrEqual(40);
    expect(main.sends.size).toBeGreaterThanOrEqual(5);
    // Five namespaces must all be present on both surfaces.
    for (const namespace of NAMESPACE_KEYS) {
      expect(preloadNamespaces.has(namespace)).toBe(true);
      expect(dtsNamespaces.has(namespace)).toBe(true);
    }
    // ≥40 methods across the namespaces, and a floor per namespace a bad
    // parse of exactly that block would break.
    expect(methods.size).toBeGreaterThanOrEqual(40);
    expect(dtsMethods.size).toBeGreaterThanOrEqual(40);
    expect(preloadNamespaces.get("files")?.size).toBeGreaterThanOrEqual(10);
    expect(preloadNamespaces.get("history")?.size).toBeGreaterThanOrEqual(4);
    expect(preloadNamespaces.get("media")?.size).toBeGreaterThanOrEqual(7);
    expect(preloadNamespaces.get("system")?.size).toBeGreaterThanOrEqual(15);
    expect(preloadNamespaces.get("capture")?.size).toBeGreaterThanOrEqual(20);
    expect(dtsNamespaces.get("files")?.size).toBeGreaterThanOrEqual(10);
    expect(dtsNamespaces.get("history")?.size).toBeGreaterThanOrEqual(4);
    expect(dtsNamespaces.get("media")?.size).toBeGreaterThanOrEqual(7);
    expect(dtsNamespaces.get("system")?.size).toBeGreaterThanOrEqual(15);
    expect(dtsNamespaces.get("capture")?.size).toBeGreaterThanOrEqual(20);
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
    // to navigate the bridge file from a test report.
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
      (channel) => !ALLOWED_MAIN_ONLY.some((a) => a.channel === channel),
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

  it("every method preload exposes is declared in desktop.d.ts (per namespace)", () => {
    for (const namespace of NAMESPACE_KEYS) {
      const preloadMethods = preloadNamespaces.get(namespace) ?? new Map();
      const dtsBlock = dtsNamespaces.get(namespace) ?? new Map();
      const { onlyA, onlyB } = diffSets(preloadMethods, dtsBlock);
      const undeclared = [...onlyA].filter(
        (name) => !ALLOWED_PRELOAD_ONLY.some((a) => a.name === name),
      );
      const extra = [...onlyB].filter((name) => !ALLOWED_DTS_ONLY.some((a) => a.name === name));
      expect(undeclared, `${namespace}: undeclared in desktop.d.ts`).toEqual([]);
      expect(extra, `${namespace}: not implemented by preload`).toEqual([]);
    }
  });

  it("every method desktop.d.ts declares is implemented by preload", () => {
    const { onlyB } = diffSets(methods, dtsMethods);
    const unimplemented = [...onlyB].filter(
      (name) => !ALLOWED_DTS_ONLY.some((a) => a.name === name),
    );
    expect(unimplemented).toEqual([]);
  });

  it("bridge apiVersion matches the app version (startup handshake stays honest)", () => {
    // preload reports API_VERSION over bookmd:api-version; system.cjs compares
    // it with app.getVersion() and warns on drift. This test catches the same
    // drift statically: the literal must equal package.json "version".
    const apiVersion = parsePreloadApiVersion(preload);
    expect(apiVersion).toBeTruthy();
    expect(apiVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(apiVersion).toBe(packageVersion);
    expect(preload).toContain("apiVersion: API_VERSION");
    expect(preload).toContain('ipcRenderer.invoke("bookmd:api-version"');
    expect(main.handles.has("bookmd:api-version")).toBe(true);
    // The .d.ts side of the contract: apiVersion is a non-optional string.
    expect(dts).toContain("apiVersion: string;");
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

  it("the namespace parser finds methods in a miniature bridge shape", () => {
    const fixture = [
      "const desktopApi = {",
      '  apiVersion: "0.0.0",',
      "",
      "  files: {",
      '    openDirectory: () => ipcRenderer.invoke("t:open"),',
      '    saveMarkdownFile: (request) => ipcRenderer.invoke("t:save", request),',
      "  },",
      "",
      "  system: {",
      "    onMenuCommand: (callback) => {",
      "      const listener = (_event, command) => callback(command);",
      '      ipcRenderer.on("t:menu", listener);',
      '      return () => ipcRenderer.removeListener("t:menu", listener);',
      "    },",
      "  },",
      "};",
    ].join("\n");
    const parsed = parseBridgeNamespaces(fixture);
    expect(parsed.get("files")?.size).toBe(2);
    expect([...(parsed.get("files")?.keys() ?? [])]).toEqual(["openDirectory", "saveMarkdownFile"]);
    expect(parsed.get("system")?.size).toBe(1);
    expect(parsed.get("history")).toBeUndefined();
    // Method-typed request shapes nested at 6 spaces must not leak in.
    const nested = [
      "  files: {",
      "    readSnapshot?: (params: {",
      "      filePath: string;",
      "      snapshotId: string;",
      "    }) => Promise<unknown>;",
      "  };",
    ].join("\n");
    const parsedNested = parseBridgeNamespaces(nested);
    expect(parsedNested.get("files")?.size).toBe(1);
    expect([...(parsedNested.get("files")?.keys() ?? [])]).toEqual(["readSnapshot"]);
  });

  it("the namespace parser returns nothing for an empty or flat document", () => {
    expect(parseBridgeNamespaces("").size).toBe(0);
    expect(parseBridgeNamespaces("const flat = { ping: () => {} };").size).toBe(0);
  });
});
