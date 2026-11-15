const { ipcMain, app, safeStorage } = require("electron");
const path = require("node:path");
const { complete, validateMessages } = require("./ai-provider.cjs");
const { createAiStore } = require("./ai-store.cjs");

function registerAiHandlers(context) {
  let store;
  const active = new Map();
  const getStore = () =>
    (store ||= createAiStore(path.join(app.getPath("userData"), "ai"), safeStorage));
  const trusted = (event) =>
    [...context.windows].some((win) => !win.isDestroyed() && win.webContents === event.sender) &&
    event.senderFrame === event.sender.mainFrame;
  const invoke = (action) => async (event, request) => {
    if (!trusted(event)) return { success: false, message: "当前窗口不能访问 AI 服务。" };
    try {
      return { success: true, value: await action(event, request) };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : "AI 操作失败。" };
    }
  };
  const validId = (id) => typeof id === "string" && /^[\w-]{1,80}$/.test(id);
  const validWorkspace = (id) => typeof id === "string" && id.length > 0 && id.length <= 2048;
  async function run(event, request, testing = false) {
    if (!request || !validId(request.requestId) || !validWorkspace(request.workspaceId))
      throw new Error("AI 请求标识无效。");
    if (
      !testing &&
      (!Array.isArray(request.sources) ||
        request.sources.length > 8 ||
        typeof request.prompt !== "string" ||
        request.prompt.length > 4000 ||
        ![
          "question",
          "rewrite",
          "outline",
          "summary",
          "create",
          "edit",
          "mindmap",
          "canvas",
        ].includes(request.mode) ||
        request.sources.some(
          (s) =>
            !s ||
            typeof s.id !== "string" ||
            !/^S[1-8]$/.test(s.id) ||
            typeof s.chapterId !== "string" ||
            s.chapterId.length > 2048 ||
            typeof s.title !== "string" ||
            s.title.length > 512 ||
            typeof s.text !== "string" ||
            s.text.length > (["outline", "edit"].includes(request.mode) ? 20000 : 12000) ||
            !Number.isSafeInteger(s.startLine) ||
            s.startLine < 1 ||
            !Number.isSafeInteger(s.endLine) ||
            s.endLine < s.startLine,
        ))
    )
      throw new Error("AI 任务或来源格式无效。");
    validateMessages(request.messages);
    if (active.has(event.sender.id) || active.size >= 3)
      throw new Error("已有 AI 请求正在运行，请先停止或等待完成。");
    const controller = new AbortController();
    const entry = { requestId: request.requestId, controller };
    active.set(event.sender.id, entry);
    const cancel = () => controller.abort();
    event.sender.once("destroyed", cancel);
    event.sender.once("did-start-navigation", cancel);
    const timer = setTimeout(cancel, 120_000);
    let reserved = 0,
      date = null,
      recorded = false;
    const started = Date.now();
    try {
      const connection = await getStore().getConnection();
      const settings = testing
        ? { ...connection.settings, maxOutputTokens: 16 }
        : connection.settings;
      reserved =
        Buffer.byteLength(JSON.stringify(request.messages), "utf8") +
        settings.maxOutputTokens +
        1024;
      date = await getStore().reserve(reserved, settings.dailyTokenLimit);
      const response = await complete({
        ...connection,
        settings,
        messages: request.messages,
        signal: controller.signal,
        onText: (text) => {
          if (!testing && !controller.signal.aborted && !event.sender.isDestroyed()) {
            event.sender.send("bookmd:ai-event", { requestId: request.requestId, text });
          }
        },
      });
      if (controller.signal.aborted) throw new Error("请求已停止或超时。");
      const actual =
        response.inputTokens !== null && response.outputTokens !== null
          ? response.inputTokens + response.outputTokens
          : null;
      const record = {
        id: request.requestId,
        prompt: request.prompt,
        mode: request.mode,
        text: response.text,
        sources: request.sources,
        model: settings.model,
        createdAt: new Date().toISOString(),
        elapsedMs: Date.now() - started,
        usage: {
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          budgetTokens: actual ?? reserved,
        },
      };
      await getStore().finish(
        date,
        reserved,
        actual,
        request.workspaceId,
        !testing && settings.saveHistory ? record : null,
      );
      recorded = true;
      return testing ? { model: settings.model, usageReported: actual !== null } : record;
    } finally {
      clearTimeout(timer);
      event.sender.removeListener("destroyed", cancel);
      event.sender.removeListener("did-start-navigation", cancel);
      if (active.get(event.sender.id) === entry) active.delete(event.sender.id);
      // Failed or cancelled requests retain their reservation: the remote service may still bill them.
      if (date && !recorded)
        await getStore().finish(date, reserved, null, request.workspaceId, null);
    }
  }
  ipcMain.handle(
    "bookmd:ai-get-settings",
    invoke(() => getStore().getSettings()),
  );
  ipcMain.handle(
    "bookmd:ai-save-settings",
    invoke((_event, request) => getStore().saveSettings(request)),
  );
  ipcMain.handle(
    "bookmd:ai-generate",
    invoke((event, request) => run(event, request)),
  );
  ipcMain.handle(
    "bookmd:ai-test",
    invoke((event, requestId) =>
      run(
        event,
        {
          requestId,
          workspaceId: "connection-test",
          prompt: "连接测试",
          mode: "question",
          sources: [],
          messages: [{ role: "user", content: "Reply with OK." }],
        },
        true,
      ),
    ),
  );
  ipcMain.handle("bookmd:ai-cancel", (event, requestId) => {
    if (!trusted(event) || !validId(requestId)) return false;
    const request = active.get(event.sender.id);
    if (!request || request.requestId !== requestId) return false;
    request.controller.abort();
    return true;
  });
  ipcMain.handle(
    "bookmd:ai-get-history",
    invoke((_event, workspaceId) => {
      if (!validWorkspace(workspaceId)) throw new Error("知识库标识无效。");
      return getStore().getHistory(workspaceId);
    }),
  );
  ipcMain.handle(
    "bookmd:ai-clear-history",
    invoke((_event, workspaceId) => {
      if (!validWorkspace(workspaceId)) throw new Error("知识库标识无效。");
      return getStore().clearHistory(workspaceId);
    }),
  );
}

module.exports = { registerAiHandlers };
