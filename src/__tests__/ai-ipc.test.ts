// @vitest-environment node
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../electron/ai.cjs", import.meta.url), "utf8");
const nativeRequire = createRequire(import.meta.url);
function mount() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const sender = Object.assign(new EventEmitter(), {
    id: 1,
    mainFrame: {},
    isDestroyed: () => false,
    send: vi.fn(),
  });
  const event = { sender, senderFrame: sender.mainFrame };
  const store = {
    getSettings: vi.fn().mockResolvedValue({ model: "fixture" }),
    saveSettings: vi.fn().mockResolvedValue({ model: "fixture" }),
    getConnection: vi.fn().mockResolvedValue({
      settings: {
        provider: "compatible",
        baseUrl: "https://example.test/v1",
        model: "fixture",
        maxOutputTokens: 128,
        dailyTokenLimit: 20000,
        saveHistory: false,
      },
      apiKey: "fixture-private-key",
    }),
    reserve: vi.fn().mockResolvedValue("fixture-date"),
    finish: vi.fn().mockResolvedValue(null),
    getHistory: vi.fn().mockResolvedValue([]),
    clearHistory: vi.fn().mockResolvedValue(null),
  };
  const complete = vi.fn().mockImplementation(async ({ onText }) => {
    onText("内容");
    return { text: "内容", inputTokens: 3, outputTokens: 2 };
  });
  const module = { exports: {} as { registerAiHandlers: (context: unknown) => void } };
  runInNewContext(source, {
    module,
    Buffer,
    setTimeout,
    clearTimeout,
    AbortController,
    Date,
    Error,
    require: (name: string) =>
      name === "electron"
        ? {
            ipcMain: { handle: (id: string, fn: (...args: any[]) => any) => handlers.set(id, fn) },
            app: { getPath: () => "C:/fixture" },
            safeStorage: {},
          }
        : name === "./ai-store.cjs"
          ? { createAiStore: () => store }
          : name === "./ai-provider.cjs"
            ? { complete, validateMessages: () => {} }
            : nativeRequire(name),
  });
  module.exports.registerAiHandlers({
    windows: new Set([{ webContents: sender, isDestroyed: () => false }]),
  });
  const request = {
    requestId: "fixture-request",
    workspaceId: "vault",
    prompt: "问题",
    mode: "question",
    sources: [],
    messages: [{ role: "user", content: "问题" }],
  };
  return { handlers, sender, event, store, complete, request };
}

describe("AI IPC trust and lifecycle", () => {
  it.each(["create", "mindmap", "canvas"])(
    "accepts %s creation through the existing trusted handler",
    async (mode) => {
      const fixture = mount();
      expect(
        await fixture.handlers.get("bookmd:ai-generate")!(fixture.event, {
          ...fixture.request,
          mode,
        }),
      ).toMatchObject({ success: true, value: { mode } });
    },
  );
  it("accepts full outline input up to 20000 characters and preserves the smaller rewrite boundary", async () => {
    const fixture = mount();
    const outline = {
      ...fixture.request,
      mode: "outline",
      sources: [
        {
          id: "S1",
          chapterId: "a",
          title: "大纲",
          startLine: 1,
          endLine: 2,
          text: `# 项目\n${"字".repeat(19995)}`,
        },
      ],
    };
    expect(await fixture.handlers.get("bookmd:ai-generate")!(fixture.event, outline)).toMatchObject(
      { success: true, value: { mode: "outline" } },
    );
    expect(
      await fixture.handlers.get("bookmd:ai-generate")!(fixture.event, {
        ...outline,
        mode: "rewrite",
      }),
    ).toMatchObject({ success: false });
    expect(
      await fixture.handlers.get("bookmd:ai-generate")!(fixture.event, {
        ...outline,
        sources: [{ ...outline.sources[0], text: "字".repeat(20001) }],
      }),
    ).toMatchObject({ success: false });
    expect(fixture.complete).toHaveBeenCalledOnce();
  });
  it("rejects unknown windows and subframes before touching settings or credentials", async () => {
    const { handlers, event, store } = mount();
    expect(
      await handlers.get("bookmd:ai-get-settings")!({ ...event, senderFrame: {} }),
    ).toMatchObject({ success: false });
    expect(
      await handlers.get("bookmd:ai-get-settings")!({ sender: { id: 99 }, senderFrame: {} }),
    ).toMatchObject({ success: false });
    expect(store.getSettings).not.toHaveBeenCalled();
  });
  it("streams only to the owning window and removes lifecycle listeners afterwards", async () => {
    const { handlers, event, sender, store, request } = mount();
    const result = await handlers.get("bookmd:ai-generate")!(event, request);
    expect(result).toMatchObject({
      success: true,
      value: { text: "内容", usage: { budgetTokens: 5 } },
    });
    expect(sender.send).toHaveBeenCalledExactlyOnceWith("bookmd:ai-event", {
      requestId: request.requestId,
      text: "内容",
    });
    expect(JSON.stringify(result)).not.toContain("fixture-private-key");
    expect(store.finish).toHaveBeenCalledWith("fixture-date", expect.any(Number), 5, "vault", null);
    expect(sender.listenerCount("destroyed")).toBe(0);
    expect(sender.listenerCount("did-start-navigation")).toBe(0);
  });
  it("rejects duplicate runs and will not cancel a different request", async () => {
    const fixture = mount();
    let release!: () => void;
    fixture.complete.mockImplementationOnce(
      ({ signal }) =>
        new Promise((resolve, reject) => {
          release = () => resolve({ text: "完成", inputTokens: null, outputTokens: null });
          signal.addEventListener("abort", () => reject(new Error("fixture cancelled")), {
            once: true,
          });
        }),
    );
    const first = fixture.handlers.get("bookmd:ai-generate")!(fixture.event, fixture.request);
    await vi.waitFor(() => expect(fixture.complete).toHaveBeenCalledOnce());
    const duplicate = await fixture.handlers.get("bookmd:ai-generate")!(
      fixture.event,
      fixture.request,
    );
    expect(duplicate).toMatchObject({
      success: false,
      message: expect.stringContaining("已有 AI 请求"),
    });
    expect(fixture.handlers.get("bookmd:ai-cancel")!(fixture.event, "another-request")).toBe(false);
    release();
    expect(await first).toMatchObject({ success: true });
  });
  it("aborts on navigation and retains the budget reservation without persisting a partial answer", async () => {
    const fixture = mount();
    fixture.complete.mockImplementationOnce(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("fixture cancelled")), {
            once: true,
          });
        }),
    );
    const running = fixture.handlers.get("bookmd:ai-generate")!(fixture.event, fixture.request);
    await vi.waitFor(() => expect(fixture.complete).toHaveBeenCalledOnce());
    fixture.sender.emit("did-start-navigation");
    expect(await running).toMatchObject({ success: false });
    expect(fixture.store.finish).toHaveBeenCalledWith(
      "fixture-date",
      expect.any(Number),
      null,
      "vault",
      null,
    );
  });
  it("rejects malformed sources before model access", async () => {
    const fixture = mount();
    expect(
      await fixture.handlers.get("bookmd:ai-generate")!(fixture.event, {
        ...fixture.request,
        sources: [{ id: "S99" }],
      }),
    ).toMatchObject({ success: false });
    expect(fixture.store.getConnection).not.toHaveBeenCalled();
    expect(fixture.complete).not.toHaveBeenCalled();
  });
});
