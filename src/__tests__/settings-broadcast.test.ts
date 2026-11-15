// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";

const file = ts.createSourceFile(
  "main.cjs",
  readFileSync(resolve(__dirname, "../../electron/main.cjs"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const broadcast = file.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "broadcastSettings",
);
if (!broadcast) throw new Error("Settings broadcaster missing");

const shared = ts.createSourceFile(
  "shared.cjs",
  readFileSync(resolve(__dirname, "../../electron/shared.cjs"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const readConfig = shared.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "getAppConfig",
);
if (!readConfig) throw new Error("Settings reader missing");

it.each([
  ['{"autoSaveEnabled":false}', false],
  ['{"autoSaveEnabled":true}', true],
  ["{}", true],
  ["malformed", true],
] as const)("reads persisted auto-save setting from %s", (json, expected) => {
  const result = runInNewContext(`(${readConfig.getText(shared)})()`, {
    app: { getPath: () => "profile" },
    path: { join: (...parts: string[]) => parts.join("/") },
    fs: { existsSync: () => true, readFileSync: () => json },
  });
  expect(result.autoSaveEnabled).toBe(expected);
});

it.each([true, false, undefined])(
  "broadcasts auto-save=%s to every document and flash window",
  (autoSaveEnabled) => {
    const sends = [vi.fn(), vi.fn(), vi.fn()];
    const windows = sends.map((send) => ({ isDestroyed: () => false, webContents: { send } }));
    runInNewContext(`(${broadcast.getText(file)})()`, {
      getAutoLaunch: () => false,
      getAppConfig: () => ({ autoSaveEnabled, runInBackground: true, flashShortcut: "Alt+Space" }),
      windows: new Set(windows.slice(0, 2)),
      flashCapsuleWindow: windows[2],
    });
    for (const send of sends)
      expect(send).toHaveBeenCalledWith(
        "bookmd:app-settings-updated",
        expect.objectContaining({ autoSaveEnabled: autoSaveEnabled !== false }),
      );
  },
);
