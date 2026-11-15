import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiPanel } from "../components/ai/AiWorkspace";
import { AiSettingsForm } from "../components/ai/AiSettingsForm";
import type { AiDesktopAPI, AiPublicSettings, AiRecord, AiRequest, AiResult } from "../types/ai";
import type { DocumentSession } from "../core/types";
import { useUiStore } from "../store/useUiStore";
import { resetStores, restoreStores } from "./helpers/resetStores";

const settings: AiPublicSettings = {
  provider: "compatible",
  baseUrl: "https://example.test/v1",
  model: "fixture-model",
  maxOutputTokens: 128,
  dailyTokenLimit: 20000,
  saveHistory: false,
  hasApiKey: false,
  keyStorage: "none",
};
const session: DocumentSession = {
  chapterId: "a",
  absolutePath: "C:/fixture/a.md",
  fileName: "项目A.md",
  baseUrl: "",
  source: "# 项目A\n\n预算10万元。",
  savedSource: "",
  diskVersion: null,
  sourceRevision: 2,
  savedRevision: 1,
  writable: true,
};
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount(connection: AiPublicSettings = settings, currentSession: DocumentSession = session) {
  const deferred = pending<AiResult<AiRecord>>();
  let event: ((value: { requestId: string; text: string }) => void) | null = null;
  const unsubscribe = vi.fn();
  const api: AiDesktopAPI = {
    getSettings: vi.fn().mockResolvedValue({ success: true, value: connection }),
    saveSettings: vi.fn().mockResolvedValue({ success: true, value: settings }),
    testConnection: vi.fn(),
    generate: vi.fn().mockReturnValue(deferred.promise),
    cancel: vi.fn().mockResolvedValue(true),
    onEvent: vi.fn((callback) => {
      event = callback;
      return unsubscribe;
    }),
    getHistory: vi.fn().mockResolvedValue({ success: true, value: [] }),
    clearHistory: vi.fn().mockResolvedValue({ success: true, value: null }),
  };
  const create = vi.fn();
  const jump = vi.fn();
  const update = vi.fn();
  const changeView = vi.fn();
  const panelProps = {
    api,
    workspaceId: "fixture-vault",
    editorViewRef: { current: null },
    onCreateFromTemplate: create,
    onSearchJump: jump,
    onUpdateSource: update,
    onViewModeChange: changeView,
  };
  const rendered = render(<AiPanel {...panelProps} session={currentSession} />);
  rendered.container.querySelector("details.ai-context")?.setAttribute("open", "");
  return {
    ...rendered,
    api,
    deferred,
    create,
    jump,
    update,
    changeView,
    changeSession: (next: DocumentSession) =>
      rendered.rerender(<AiPanel {...panelProps} session={next} />),
    unsubscribe,
    emit: (requestId: string, text: string) => event?.({ requestId, text }),
  };
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  restoreStores();
  vi.restoreAllMocks();
});

describe("AI workspace", () => {
  it("refuses to send an edit while a diagram draft has not reached the document", async () => {
    useUiStore.getState().openAi("create");
    const fixture = mount();
    await screen.findByText("fixture-model");
    act(() => useUiStore.setState({ aiPendingDocument: session.absolutePath }));
    fireEvent.change(screen.getByLabelText("向 AI 助理发送消息"), {
      target: { value: "修改脑图分支" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    expect(fixture.api.generate).not.toHaveBeenCalled();
    expect(screen.getByText(/还有未提交的修改/)).toBeTruthy();
  });
  it("keeps model output as a draft if a local diagram edit starts during generation", async () => {
    useUiStore.getState().openAi("create");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByLabelText("向 AI 助理发送消息"), {
      target: { value: "修改一级标题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    act(() => useUiStore.setState({ aiPendingDocument: session.absolutePath }));
    await act(async () =>
      fixture.deferred.resolve({
        success: true,
        value: recordFor(
          request,
          JSON.stringify({ edits: [{ before: "# 项目A", after: "# 测试" }] }),
        ),
      }),
    );
    expect(fixture.update).not.toHaveBeenCalled();
    expect(screen.getByText(/还有未提交的修改/)).toBeTruthy();
    expect(screen.getByLabelText("替换内容 1")).toBeTruthy();
  });
  it("previews the same full original used by an inferred edit request", async () => {
    useUiStore.getState().openAi("create");
    const long = { ...session, source: session.source + "\n" + "内容".repeat(6500) };
    const fixture = mount(settings, long);
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByLabelText("向 AI 助理发送消息"), {
      target: { value: "修改一级标题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览发送内容" }));
    expect(fixture.api.generate).not.toHaveBeenCalled();
    expect(screen.getByText(/完整原文 · 精确修改/)).toBeTruthy();
  });
  it("executes a conversational heading change and keeps revision notes out of the document", async () => {
    useUiStore.getState().openAi("create");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByLabelText("向 AI 助理发送消息"), {
      target: { value: "文件一级标题改为测试" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    expect(request.mode).toBe("edit");
    expect(request.sources[0].text).toBe(session.source);
    expect(request.messages[0].content).toContain('"edits"');
    await act(async () =>
      fixture.deferred.resolve({
        success: true,
        value: recordFor(
          request,
          JSON.stringify({ edits: [{ before: "# 项目A", after: "# 测试" }] }),
        ),
      }),
    );
    expect(fixture.update).toHaveBeenCalledExactlyOnceWith("# 测试\n\n预算10万元。");
  });
  it("does not append model explanations for an edit request", async () => {
    useUiStore.getState().openAi("create");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByLabelText("向 AI 助理发送消息"), {
      target: { value: "一级标题改为测试" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    await act(async () =>
      fixture.deferred.resolve({
        success: true,
        value: recordFor(request, "## 修订说明\n修改后的首行是 # 测试"),
      }),
    );
    expect(fixture.update).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("原文未变");
  });
  it("opens model settings in About and refreshes after a saved settings event", async () => {
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "模型接口" }));
    expect(useUiStore.getState().aboutOpen).toBe(true);
    expect(useUiStore.getState().aboutTab).toBe("model");
    vi.mocked(fixture.api.getSettings).mockResolvedValue({
      success: true,
      value: { ...settings, model: "new-model" },
    });
    act(() => window.dispatchEvent(new Event("knowspace-ai-settings-updated")));
    await screen.findByText("new-model");
    expect(screen.queryByLabelText("API Key")).toBeNull();
  });
  it("edits whiteboard cards through named fields, including clearing and replacing a title", async () => {
    useUiStore.getState().openAi("create");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByRole("combobox", { name: "生成内容" }), {
      target: { value: "canvas" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "生成完成后直接写入" }));
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    await act(async () =>
      fixture.deferred.resolve({
        success: true,
        value: recordFor(request, '{"cards":[{"title":"草稿标题","content":"初始内容"}]}'),
      }),
    );
    fireEvent.change(screen.getByLabelText("卡片标题"), { target: { value: "" } });
    expect(screen.getByLabelText("卡片内容")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("卡片标题"), { target: { value: "修订标题" } });
    fireEvent.change(screen.getByLabelText("卡片内容"), { target: { value: "修订后的内容" } });
    fireEvent.click(screen.getByRole("button", { name: "另存白板" }));
    expect(JSON.parse(fixture.create.mock.calls[0][0].content).nodes[0].text).toBe(
      "## 修订标题\n\n修订后的内容",
    );
  });
  it("writes conversation content into an empty document and can undo the exact write", async () => {
    useUiStore.getState().openAi("create");
    const blank = { ...session, source: "" };
    const fixture = mount(settings, blank);
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByLabelText("向 AI 助理发送消息"), {
      target: { value: "写一段项目简介" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    expect(request.mode).toBe("create");
    expect(request.sources).toEqual([]);
    await act(async () =>
      fixture.deferred.resolve({
        success: true,
        value: recordFor(request, "# 项目简介\n\n从需求开始。"),
      }),
    );
    const next = "# 项目简介\n\n从需求开始。";
    expect(fixture.update).toHaveBeenCalledExactlyOnceWith(next);
    expect(fixture.changeView).toHaveBeenCalledWith("live");
    expect(screen.getByRole("button", { name: "已写入" }).hasAttribute("disabled")).toBe(true);
    fixture.changeSession({ ...blank, source: next, sourceRevision: blank.sourceRevision + 1 });
    fireEvent.click(screen.getByRole("button", { name: "撤销本次写入" }));
    expect(fixture.update).toHaveBeenLastCalledWith("");
  });

  it("recognizes a mind map request, writes Markdown branches and opens the map", async () => {
    useUiStore.getState().openAi("create");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByLabelText("向 AI 助理发送消息"), {
      target: { value: "把资料整理成思维导图" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    expect(request.mode).toBe("mindmap");
    await act(async () =>
      fixture.deferred.resolve({
        success: true,
        value: recordFor(request, "# 项目规划\n\n- 调研\n- 实施"),
      }),
    );
    expect(fixture.update).toHaveBeenCalledExactlyOnceWith(
      session.source + "\n\n# 项目规划\n## 调研\n## 实施",
    );
    expect(fixture.changeView).toHaveBeenCalledWith("mindmap");
  });

  it("routes card edits even with canvas selected, preserves the board view, saves as canvas and undoes", async () => {
    useUiStore.getState().openAi("create");
    const board = {
      ...session,
      fileName: "练习.canvas",
      source: JSON.stringify({
        nodes: [
          { id: "a", type: "text", text: "## 预算\n\n10万元", x: 0, y: 0, width: 340, height: 220 },
        ],
        edges: [],
      }),
    };
    const fixture = mount(settings, board);
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByRole("combobox", { name: "生成内容" }), {
      target: { value: "canvas" },
    });
    fireEvent.change(screen.getByLabelText("向 AI 助理发送消息"), {
      target: { value: "把预算卡片改为20万元" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    expect(request.mode).toBe("edit");
    expect(request.sources[0].text).toBe(board.source);
    expect(request.messages[0].content).toContain("nodeId");
    await act(async () =>
      fixture.deferred.resolve({
        success: true,
        value: recordFor(
          request,
          JSON.stringify({ edits: [{ nodeId: "a", before: "10万元", after: "20万元" }] }),
        ),
      }),
    );
    const next = fixture.update.mock.calls[0][0];
    expect(JSON.parse(next).nodes[0].text).toBe("## 预算\n\n20万元");
    expect(fixture.changeView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "另存白板" }));
    expect(fixture.create.mock.calls[0][0]).toMatchObject({ extension: ".canvas", content: next });
    fixture.changeSession({ ...board, source: next, sourceRevision: board.sourceRevision + 1 });
    fireEvent.click(screen.getByRole("button", { name: "撤销本次写入" }));
    expect(fixture.update).toHaveBeenLastCalledWith(board.source);
  });

  it("creates an editable canvas file through the guarded save path instead of replacing Markdown", async () => {
    useUiStore.getState().openAi("create");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByLabelText("向 AI 助理发送消息"), {
      target: { value: "生成两张白板卡片" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    expect(request.mode).toBe("canvas");
    await act(async () =>
      fixture.deferred.resolve({
        success: true,
        value: recordFor(request, '{"cards":[{"title":"预算","content":"10万元"}]}'),
      }),
    );
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.create).toHaveBeenCalledOnce();
    const template = fixture.create.mock.calls[0][0];
    expect(template.extension).toBe(".canvas");
    expect(JSON.parse(template.content).nodes[0]).toMatchObject({
      type: "text",
      text: "## 预算\n\n10万元",
    });
  });

  it("keeps the draft and refuses automatic writes when the document changed during generation", async () => {
    useUiStore.getState().openAi("create");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    expect(request.mode).toBe("create");
    fixture.changeSession({
      ...session,
      chapterId: "other",
      source: "其他文档",
      sourceRevision: 3,
    });
    await act(async () =>
      fixture.deferred.resolve({ success: true, value: recordFor(request, "生成的正文") }),
    );
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
    expect(screen.getByText(/文档已变化或已切换，未写入任何内容/)).toBeTruthy();
    expect((screen.getByLabelText("创作草稿") as HTMLTextAreaElement).value).toBe("生成的正文");
  });

  it("supports draft-only creation and blocks malformed whiteboard data", async () => {
    useUiStore.getState().openAi("create");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByRole("combobox", { name: "生成内容" }), {
      target: { value: "canvas" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "生成完成后直接写入" }));
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    await act(async () =>
      fixture.deferred.resolve({ success: true, value: recordFor(request, '{"cards":[') }),
    );
    expect(fixture.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "另存白板" }));
    expect(screen.getByText(/白板卡片格式无效/)).toBeTruthy();
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it("offers full-document writing from a Markdown outline without requiring a selection", async () => {
    useUiStore.getState().openAi("rewrite");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.change(screen.getByRole("combobox", { name: "写作方式" }), {
      target: { value: "outline" },
    });
    fireEvent.click(screen.getByRole("button", { name: "预览发送内容" }));
    expect(fixture.api.generate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /\[S1\] 项目A.md/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "生成全文" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    expect(request.mode).toBe("outline");
    expect(request.sources[0].text).toBe(session.source);
    const text = "# 项目A\n\n项目预算10万元，以下安排需结合实际执行。";
    await act(async () =>
      fixture.deferred.resolve({ success: true, value: recordFor(request, text) }),
    );
    expect((screen.getByLabelText("全文草稿") as HTMLTextAreaElement).value).toBe(text);
    fireEvent.click(screen.getByRole("button", { name: "保存为新笔记" }));
    expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({ content: text }));
  });

  it("blocks incomplete outlines and requires another confirmation after a draft edit", async () => {
    useUiStore.getState().openAi("outline");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "生成全文" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    await act(async () =>
      fixture.deferred.resolve({ success: true, value: recordFor(request, "# 项目A") }),
    );
    const replace = screen.getByRole("button", { name: "替换当前文档全文" });
    expect(replace.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("全文草稿仍有空章节，请补齐正文后再应用。")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("全文草稿"), {
      target: { value: "# 项目A\n\n预算10万元。" },
    });
    fireEvent.click(replace);
    expect(screen.getByRole("group", { name: "确认替换全文" })).toBeTruthy();
    expect(screen.getByText(/开启自动保存时，修改将按设置写入磁盘/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保留原文" }));
    expect(screen.queryByRole("group", { name: "确认替换全文" })).toBeNull();
    fireEvent.click(replace);
    fireEvent.change(screen.getByLabelText("全文草稿"), {
      target: { value: "# 项目A\n\n预算10万元，待验收。" },
    });
    expect(screen.queryByRole("group", { name: "确认替换全文" })).toBeNull();
    fireEvent.click(replace);
    fireEvent.click(screen.getByRole("button", { name: "确认替换全文" }));
    expect(screen.getByText("请先进入实时预览编辑，再确认替换全文；当前草稿已保留。")).toBeTruthy();
  });

  it("keeps a truncated full-document response as an unfinished draft", async () => {
    useUiStore.getState().openAi("outline");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "生成全文" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    act(() => fixture.emit(request.requestId, "# 项目A\n\n未完成"));
    await act(async () =>
      fixture.deferred.resolve({ success: false, message: "输出达到长度上限" }),
    );
    expect(screen.getByText("未完成草稿")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "替换当前文档全文" })).toBeNull();
    expect(screen.getByText("# 项目A 未完成", { exact: false })).toBeTruthy();
  });

  it.each([
    ["http://127.0.0.1:11434", "发往配置的本机服务"],
    ["https://localhost.example.test/v1", "发往配置的模型服务"],
    ["https://example.test/localhost", "发往配置的模型服务"],
  ])("labels the actual destination host for %s", async (baseUrl, label) => {
    mount({ ...settings, baseUrl });
    await screen.findByText("fixture-model");
    expect(screen.getByText(new RegExp(label))).toBeTruthy();
  });

  it("previews outgoing evidence without a model call", async () => {
    const { api } = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "预览发送内容" }));
    expect(screen.getByText("这是待发送的来源预览，尚未调用模型。")).toBeTruthy();
    expect(screen.getByRole("button", { name: /\[S1\] 项目A.md/ })).toBeTruthy();
    expect(api.generate).not.toHaveBeenCalled();
  });

  it("ignores other request events and late results after cancellation", async () => {
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    act(() => {
      fixture.emit("different-request", "不应出现");
      fixture.emit(request.requestId, "已生成片段");
    });
    expect(screen.queryByText("不应出现")).toBeNull();
    expect(screen.getByText("已生成片段")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(fixture.api.cancel).toHaveBeenCalledWith(request.requestId);
    await act(async () =>
      fixture.deferred.resolve({ success: true, value: recordFor(request, "迟到的最终答案") }),
    );
    expect(screen.queryByText("迟到的最终答案")).toBeNull();
    expect(screen.getByText("未完成草稿")).toBeTruthy();
    expect(fixture.unsubscribe).toHaveBeenCalled();
  });

  it("keeps citations, navigates by source and passes exports through the existing creation guard", async () => {
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    await act(async () =>
      fixture.deferred.resolve({ success: true, value: recordFor(request, "预算10万元。[S1]") }),
    );
    fireEvent.click(screen.getByRole("button", { name: /\[S1\] 项目A.md/ }));
    expect(fixture.jump).toHaveBeenCalledWith(
      expect.objectContaining({ chapterId: "a", lineNumber: 1 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存为新笔记" }));
    expect(fixture.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ content: expect.stringContaining("## 参考来源") }),
    );
    expect(screen.getByRole("button", { name: "已发起保存" }).hasAttribute("disabled")).toBe(true);
    expect(fixture.create).toHaveBeenCalledTimes(1);
  });

  it("cancels and unsubscribes when its library component unmounts", async () => {
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    fixture.unmount();
    expect(fixture.api.cancel).toHaveBeenCalledWith(request.requestId);
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
    await act(async () =>
      fixture.deferred.resolve({ success: true, value: recordFor(request, "晚到结果") }),
    );
    expect(screen.queryByText("晚到结果")).toBeNull();
  });

  it("collapses the sidebar and cancels its active generation", async () => {
    useUiStore.getState().openAi();
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    const request = vi.mocked(fixture.api.generate).mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: "关闭 AI 工作台" }));
    expect(useUiStore.getState().aiOpen).toBe(false);
    expect(fixture.api.cancel).toHaveBeenCalledWith(request.requestId);
    expect(fixture.unsubscribe).toHaveBeenCalled();
    await act(async () =>
      fixture.deferred.resolve({ success: true, value: recordFor(request, "迟到结果") }),
    );
    expect(screen.queryByText("迟到结果")).toBeNull();
  });

  it("makes rewrite require an actual writable editor selection", async () => {
    useUiStore.getState().openAi("rewrite");
    const fixture = mount();
    await screen.findByText("fixture-model");
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    expect(screen.getByText("请在当前文档的编辑模式中选择需要改写的文字。")).toBeTruthy();
    expect(fixture.api.generate).not.toHaveBeenCalled();
  });
});

it("clears the credential field when handing settings to main and cancels an unfinished connection test", async () => {
  const tested = pending<AiResult<{ model: string; usageReported: boolean }>>();
  const api = {
    saveSettings: vi.fn().mockResolvedValue({ success: true, value: settings }),
    testConnection: vi.fn().mockReturnValue(tested.promise),
    cancel: vi.fn().mockResolvedValue(true),
  } as unknown as AiDesktopAPI;
  const saved = vi.fn();
  const view = render(<AiSettingsForm api={api} settings={settings} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText("API Key"), {
    target: { value: "fixture-transient-key" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存并测试连接" }));
  await waitFor(() => expect(api.testConnection).toHaveBeenCalledOnce());
  expect((screen.getByLabelText("API Key") as HTMLInputElement).value).toBe("");
  expect(api.saveSettings).toHaveBeenCalledWith(
    expect.objectContaining({ apiKey: "fixture-transient-key" }),
  );
  view.unmount();
  expect(api.cancel).toHaveBeenCalledWith(vi.mocked(api.testConnection).mock.calls[0][0]);
  await act(async () =>
    tested.resolve({ success: true, value: { model: "fixture-model", usageReported: false } }),
  );
});

function recordFor(request: AiRequest, text: string): AiRecord {
  return {
    id: request.requestId,
    mode: request.mode,
    prompt: request.prompt,
    text,
    sources: request.sources,
    model: "fixture-model",
    createdAt: "2026-11-15T01:00:00Z",
    elapsedMs: 10,
    usage: { inputTokens: 12, outputTokens: 5, budgetTokens: 17 },
  };
}
