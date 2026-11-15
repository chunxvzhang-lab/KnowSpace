// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import type { KnowSpaceDesktopAPI } from "../types/desktop";

const source = ts.createSourceFile(
  "perf.cjs",
  readFileSync(resolve(__dirname, "../../scripts/capture-perf-baseline.cjs"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const bridge = source.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "installMockBridge",
);
if (!bridge) throw new Error("Performance fixture bridge missing");
const bridgeSource = bridge.getText(source);

it("loads corpus as data and preserves ordered asynchronous single/batch reads", async () => {
  const fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      longDoc: { markdown: "long text" },
      mermaidDoc: { markdown: "graph text" },
      vault: { chapters: [{ absolutePath: "note.md", markdown: "note text" }] },
    }),
  }));
  const sandbox = {
    window: {} as { bookMDDesktop: KnowSpaceDesktopAPI },
    fetch,
    payload: {
      apiVersion: "test",
      longDoc: { path: "long.md" },
      mermaidDoc: { path: "graph.md" },
      vault: { title: "Fixture", rootPath: "vault", chapters: [] },
      fixtureUrl: "http://fixture/corpus.json",
    },
  };
  runInNewContext(`(${bridgeSource})(payload)`, sandbox);
  const api = sandbox.window.bookMDDesktop.files;
  expect((await api.readMarkdownFile("long.md")).markdown).toBe("long text");
  expect(
    (await api.readMarkdownBatch!(["note.md", "graph.md"])).map((item) => item.markdown),
  ).toEqual(["note text", "graph text"]);
  expect(fetch).toHaveBeenCalledWith("http://fixture/corpus.json");
  await expect(api.readMarkdownFile("missing.md")).rejects.toThrow("unknown path");
});

it("reports fixture loading failure instead of providing empty documents", async () => {
  const sandbox = {
    window: {} as { bookMDDesktop: KnowSpaceDesktopAPI },
    fetch: async () => ({ ok: false, status: 503 }),
    payload: {
      apiVersion: "test",
      longDoc: { path: "long.md" },
      mermaidDoc: { path: "graph.md" },
      vault: { title: "Fixture", rootPath: "vault", chapters: [] },
      fixtureUrl: "http://fixture/corpus.json",
    },
  };
  runInNewContext(`(${bridgeSource})(payload)`, sandbox);
  await expect(sandbox.window.bookMDDesktop.files.readMarkdownFile("long.md")).rejects.toThrow(
    "fixture load failed: 503",
  );
});
