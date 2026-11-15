const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const root = path.resolve(__dirname, "..");
const output =
  process.env.KNOWSPACE_AI_QA_OUTPUT || path.join(root, "output", "playwright", "ai-phase1");
const profile = path.join(output, `profile-${Date.now()}`);
const vault = path.join(output, `fixture-vault-${Date.now()}`);
const requests = [];
const checks = [];
const errors = [];
const fixtureA = "# 项目A\n\n预算10万元，项目按计划推进。\n\n## 风险\n\n上线前需要完成验收。\n";
const fixtureB = "# 项目B\n\n预算20万元，计划下月交付。\n";
const fixtureOutline =
  "---\ntitle: 知识库建设方案\n---\n# 知识库建设方案\n\n## 建设背景\n用于内部知识整理。\n\n## 建设目标\n\n### 使用场景\n\n#### 文档写作\n\n##### 草稿确认\n\n###### 撤销与保存\n\n## 实施计划\n\n## 验收安排\n";
const fullArticle =
  "---\ntitle: 知识库建设方案\n---\n# 知识库建设方案\n\n本方案围绕内部知识整理展开。\n\n## 建设背景\n现有资料用于内部知识整理，具体资料规模待确认。\n\n## 建设目标\n形成可维护的文档和可复用的写作流程。\n\n### 使用场景\n以日常笔记和方案书写为主要场景。\n\n#### 文档写作\n根据 Markdown 标题大纲生成草稿。\n\n##### 草稿确认\n使用者逐章核对事实并决定是否采纳。\n\n###### 撤销与保存\n全文应用后可一次撤销，确认无误后手动保存。\n\n## 实施计划\n先整理大纲，再生成和审核全文，时间安排待确认。\n\n## 验收安排\n核对章节完整性、可撤销性和保存内容。\n";

async function main() {
  fs.mkdirSync(vault, { recursive: true });
  const note = path.join(vault, "01-项目A.md");
  fs.writeFileSync(note, fixtureA);
  fs.writeFileSync(path.join(vault, "02-项目B.md"), fixtureB);
  fs.writeFileSync(path.join(vault, ".private.md"), "fixture-excluded-content");
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        const body = JSON.parse(raw);
        requests.push({ route: request.url, body });
        const last = body.messages.at(-1).content;
        const testing = last === "Reply with OK.";
        const rewriting = body.messages[0]?.content.includes("按用户要求改写选区");
        const outlining = body.messages[0]?.content.includes("依据当前 Markdown 文档大纲");
        const truncated = last.includes("fixture-outline-truncated");
        const missing = last.includes("fixture-outline-missing");
        const slow = last.includes("fixture-cancel");
        const answer = testing
          ? "OK"
          : outlining
            ? truncated
              ? "# 知识库建设方案\n\n未完成的正文"
              : missing
                ? "# 知识库建设方案\n\n缺少后续章节的正文。"
                : fullArticle
            : rewriting
              ? "预算为10万元，项目按计划推进。"
              : "项目A预算为10万元，上线前需要完成验收。[S1]";
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\n`,
        );
        if (truncated) {
          response.end('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n');
          return;
        }
        if (!slow)
          response.end(
            'data: {"choices":[],"usage":{"prompt_tokens":40,"completion_tokens":12}}\n\ndata: [DONE]\n\n',
          );
      } catch {
        response.writeHead(400);
        response.end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serviceUrl = `http://127.0.0.1:${server.address().port}`;
  let app;
  try {
    const packagedExecutable = process.env.KNOWSPACE_AI_PREVIEW_EXE;
    app = await electron.launch({
      executablePath: packagedExecutable || require("electron"),
      args: [...(packagedExecutable ? [] : [root]), note, `--user-data-dir=${profile}`],
      env: { ...process.env, BOOKMD_DEV_SERVER_URL: "" },
      timeout: 30000,
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.bookMDDesktop?.system.setAppSettings));
    await page.evaluate(async () => {
      const result = await window.bookMDDesktop.system.setAppSettings({ autoSaveEnabled: false });
      if (!result.success) throw new Error("Cannot disable auto-save in isolated QA profile");
      if (
        result.settings.autoSaveEnabled !== false ||
        (await window.bookMDDesktop.system.getAppSettings()).autoSaveEnabled !== false
      )
        throw new Error("Disabled auto-save did not round-trip through persisted settings");
    });
    const state = await app.evaluate(({ app, BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(
        (item) => !item.webContents.getURL().includes("mode=flash"),
      );
      win.setSize(1460, 980);
      return {
        profile: app.getPath("userData"),
        electron: process.versions.electron,
        appPath: app.getAppPath(),
        packaged: app.isPackaged,
      };
    });
    assert.equal(path.resolve(state.profile), profile);
    await page.locator(".reader-pane").waitFor();
    await page.getByRole("button", { name: "AI 助理", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "AI 工作台" });
    async function assertDockedLayout(stacked = false) {
      const layout = await page.evaluate(() => {
        const sidebar = document.querySelector(".ai-workspace");
        const reader = document.querySelector(".reader-frame");
        const workspace = document.querySelector(".workspace");
        const bounds = (element) => {
          const box = element.getBoundingClientRect();
          return {
            x: box.x,
            y: box.y,
            right: box.right,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          };
        };
        return {
          sidebar: bounds(sidebar),
          reader: bounds(reader),
          workspace: bounds(workspace),
          directChild: sidebar.parentElement === workspace,
          position: getComputedStyle(sidebar).position,
        };
      });
      assert.ok(layout.directChild, "AI sidebar must participate in the workspace layout");
      assert.notEqual(layout.position, "fixed", "AI sidebar must not float above the document");
      assert.ok(
        layout.sidebar.right <= layout.workspace.right + 1 &&
          layout.sidebar.bottom <= layout.workspace.bottom + 1,
        "AI sidebar stays inside the workspace",
      );
      assert.ok(
        layout.reader.width > 260 && layout.reader.height > 120,
        "The document remains usable",
      );
      assert.ok(
        stacked
          ? layout.reader.bottom <= layout.sidebar.y + 1
          : layout.reader.right <= layout.sidebar.x + 1,
        "Document and AI sidebar must not overlap",
      );
      return layout;
    }
    await panel.getByRole("button", { name: "模型接口", exact: true }).waitFor();
    const docked = await assertDockedLayout();
    await panel.getByRole("button", { name: "关闭 AI 工作台" }).click();
    await panel.waitFor({ state: "hidden" });
    const restored = await page.locator(".reader-frame").boundingBox();
    assert.ok(
      restored.width > docked.reader.width &&
        Math.abs(restored.x + restored.width - docked.workspace.right) <= 1,
      "Closing AI restores the document area, including any temporarily hidden navigation columns",
    );
    await page.getByRole("button", { name: "AI 助理", exact: true }).click();
    await panel.getByRole("button", { name: "模型接口", exact: true }).waitFor();
    checks.push(
      "Docked sidebar shares workspace width, never overlaps the document, and restores width on close",
    );
    await panel.getByRole("button", { name: "模型接口", exact: true }).click();
    const about = page.getByRole("dialog");
    await about.getByLabel("服务地址").fill(`${serviceUrl}/v1`);
    await about.getByLabel("模型名称").fill("fixture-model");
    await about.getByLabel("API Key", { exact: true }).fill("fixture-local-test-key");
    await about.getByLabel("在本机保留对话与来源", { exact: false }).check();
    await about.getByRole("button", { name: "保存并测试连接" }).click();
    await about.getByRole("status").filter({ hasText: "连接成功" }).waitFor();
    const storedConfig = fs.readFileSync(path.join(profile, "ai", "settings.json"), "utf8");
    assert.ok(JSON.parse(storedConfig).encryptedKey);
    assert.ok(!storedConfig.includes("fixture-local-test-key"));
    const publicConfig = await page.evaluate(() => window.bookMDDesktop.ai.getSettings());
    assert.equal(publicConfig.value.keyStorage, "encrypted");
    assert.equal(publicConfig.value.apiKey, undefined);
    assert.equal(await about.getByLabel("API Key", { exact: true }).inputValue(), "");
    await page.screenshot({ path: path.join(output, "01-connection.png") });
    checks.push(
      "Native IPC, system-encrypted credentials, streaming connection test and reported usage",
    );

    await page.getByRole("dialog").getByTitle("关闭 (Esc)").click();
    await panel.getByRole("button", { name: "工作台", exact: true }).click();
    await panel.locator("details.ai-context > summary").click();
    await panel.getByRole("button", { name: "知识问答", exact: true }).click();
    const beforePreview = requests.length;
    await panel.getByRole("button", { name: "预览发送内容" }).click();
    await panel.getByText("这是待发送的来源预览，尚未调用模型。", { exact: true }).waitFor();
    assert.equal(requests.length, beforePreview);
    await panel.getByRole("button", { name: "生成", exact: true }).click();
    await panel.getByText("生成完成", { exact: true }).waitFor();
    assert.ok(requests.at(-1).body.messages.at(-1).content.includes("预算10万元"));
    assert.ok(!JSON.stringify(requests).includes("fixture-excluded-content"));
    await panel.locator(".ai-sources > summary").click();
    await panel.getByRole("button", { name: /\[S1\]/ }).click();
    await panel.locator(".ai-chat-body").evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({ path: path.join(output, "02-question-sources.png") });
    checks.push(
      "Outgoing preview without a request, document question, citations, source navigation and excluded-note isolation",
    );

    await page.keyboard.press("Control+e");
    const editor = page.locator(".document-workspace.view-live .cm-content");
    await editor.waitFor();
    await editor.focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await panel.getByRole("button", { name: "选区写作", exact: true }).click();
    await panel.getByRole("button", { name: "生成", exact: true }).click();
    await panel.getByLabel("改写草稿", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "应用到选区" }).click();
    await panel.getByText("改写已应用，可在编辑器中撤销。", { exact: true }).waitFor();
    assert.equal(
      await editor.evaluate((node) => node.cmTile.root.view.state.doc.toString()),
      fixtureA.replace("预算10万元，项目按计划推进。", "预算为10万元，项目按计划推进。"),
    );
    await editor.focus();
    await page.keyboard.press("Control+z");
    assert.equal(
      await editor.evaluate((node) => node.cmTile.root.view.state.doc.toString()),
      fixtureA,
    );
    checks.push("Actual CodeMirror selection rewrite, application and single-step undo");

    await panel.getByRole("button", { name: "资料汇总", exact: true }).click();
    await panel.getByRole("combobox", { name: /^范围/ }).selectOption("selected");
    await panel.getByRole("checkbox", { name: /项目A$/ }).check();
    await panel.getByRole("checkbox", { name: /项目B$/ }).check();
    await panel.getByRole("button", { name: "开始汇总" }).click();
    await panel.getByText("生成完成", { exact: true }).waitFor();
    const context = JSON.parse(requests.at(-1).body.messages.at(-1).content);
    assert.equal(new Set(context.sources.map((item) => item.title)).size, 2);
    await app.evaluate(
      ({ dialog }, target) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
      },
      path.join(vault, "AI-汇总成果.md"),
    );
    await panel.getByRole("button", { name: "保存为新笔记" }).click();
    const unsaved = page.getByRole("dialog", { name: "是否保存未保存的修改？" });
    await unsaved.waitFor();
    await unsaved.getByRole("button", { name: "放弃更改", exact: true }).click();
    await page.locator(".status-filename").filter({ hasText: "AI-汇总成果" }).waitFor();
    const saved = fs.readFileSync(path.join(vault, "AI-汇总成果.md"), "utf8");
    assert.ok(saved.includes("## 参考来源"));
    assert.ok(saved.includes("预算20万元"));
    checks.push("Multi-note summary and real native file creation with embedded evidence");

    await panel.getByRole("button", { name: "知识问答", exact: true }).click();
    await panel.getByRole("combobox", { name: /^范围/ }).selectOption("current");
    await panel.getByLabel("向 AI 助理发送消息").fill("fixture-cancel");
    await panel.getByRole("button", { name: "生成", exact: true }).click();
    await panel.getByText("正在生成", { exact: true }).waitFor();
    await panel.locator(".ai-answer").filter({ hasText: "项目A预算" }).waitFor();
    await panel.getByRole("button", { name: "停止", exact: true }).click();
    await panel.getByText("未完成草稿", { exact: true }).waitFor();
    await panel.getByRole("button", { name: "记录", exact: true }).click();
    await panel.locator(".ai-history-item").first().waitFor();
    assert.equal(await panel.locator(".ai-history-item").count(), 3);
    checks.push(
      "Cancellation aborts the network stream and excludes partial answers from retained history",
    );

    await panel.getByRole("button", { name: "工作台", exact: true }).click();
    await panel.locator("details.ai-context > summary").click();
    // Use the real editor and IPC; all text and model responses are local fixtures.
    await panel.getByRole("button", { name: "选区写作", exact: true }).click();
    await panel.getByRole("combobox", { name: "写作方式", exact: true }).selectOption("outline");
    await editor.evaluate((node, text) => {
      const view = node.cmTile.root.view;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }, fixtureOutline);
    await panel.getByText("当前大纲 · 9 个标题", { exact: true }).waitFor();
    await page.getByRole("button", { name: "阅读", exact: true }).click();
    await editor.waitFor({ state: "hidden" });
    await page
      .locator(".reader-pane")
      .getByRole("heading", { name: "知识库建设方案", exact: true })
      .waitFor();
    await panel.getByLabel("向 AI 助理发送消息").fill("写成正式方案，事实不清楚处标注待确认。");
    const beforeOutlinePreview = requests.length;
    await panel.getByRole("button", { name: "预览发送内容" }).click();
    assert.equal(requests.length, beforeOutlinePreview);
    await panel.locator(".ai-chat-body").evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({ path: path.join(output, "outline-01-entry.png"), scale: "css" });
    await panel.getByRole("button", { name: "生成全文", exact: true }).click();
    const draft = panel.getByLabel("全文草稿", { exact: true });
    await draft.waitFor();
    const outlineContext = JSON.parse(requests.at(-1).body.messages.at(-1).content);
    assert.equal(outlineContext.sources.length, 1);
    assert.equal(outlineContext.sources[0].text, fixtureOutline);
    assert.equal(await draft.inputValue(), fullArticle);
    await panel.getByRole("button", { name: "进入实时预览编辑", exact: true }).click();
    await editor.waitFor();
    const reviewedArticle = fullArticle.replace("具体资料规模待确认", "资料规模由负责人确认");
    await draft.fill(reviewedArticle);
    await panel.getByRole("button", { name: "替换当前文档全文", exact: true }).click();
    await panel.getByRole("group", { name: "确认替换全文", exact: true }).waitFor();
    await page.waitForFunction(() => {
      const group = document.querySelector(".ai-apply-confirm").getBoundingClientRect();
      const body = document.querySelector(".ai-chat-body").getBoundingClientRect();
      return group.top >= body.top && group.bottom <= body.bottom + 1;
    });
    assert.equal(
      await editor.evaluate((node) => node.cmTile.root.view.state.doc.toString()),
      fixtureOutline,
    );
    await page.screenshot({ path: path.join(output, "outline-02-confirm.png"), scale: "css" });
    await panel.getByRole("button", { name: "保留原文", exact: true }).click();
    assert.equal(
      await editor.evaluate((node) => node.cmTile.root.view.state.doc.toString()),
      fixtureOutline,
    );
    await panel.getByRole("button", { name: "替换当前文档全文", exact: true }).click();
    await panel.getByRole("button", { name: "确认替换全文", exact: true }).click();
    await panel
      .getByText("全文已应用，可在编辑器中一次撤销。保存方式跟随自动保存设置。", { exact: true })
      .waitFor();
    assert.equal(
      await editor.evaluate((node) => node.cmTile.root.view.state.doc.toString()),
      reviewedArticle,
    );
    assert.equal(fs.readFileSync(path.join(vault, "AI-汇总成果.md"), "utf8"), saved);
    await editor.focus();
    await page.keyboard.press("Control+Home");
    await page.screenshot({ path: path.join(output, "outline-03-applied.png"), scale: "css" });
    await editor.focus();
    await page.keyboard.press("Control+z");
    assert.equal(
      await editor.evaluate((node) => node.cmTile.root.view.state.doc.toString()),
      fixtureOutline,
    );
    checks.push(
      "Full unsaved Markdown outline (levels 1–6 and YAML), generation in reading mode, editable full draft, live-preview entry, two-step replacement, no disk write with auto-save disabled, and single-step undo",
    );

    await panel.getByRole("button", { name: "生成全文", exact: true }).click();
    await draft.waitFor();
    const changedOutline = fixtureOutline + "\n人工补充内容。\n";
    await editor.evaluate((node) => {
      const view = node.cmTile.root.view;
      view.dispatch({ changes: { from: view.state.doc.length, insert: "\n人工补充内容。\n" } });
    });
    await panel.getByRole("button", { name: "替换当前文档全文", exact: true }).click();
    await panel.getByRole("button", { name: "确认替换全文", exact: true }).click();
    await panel.getByRole("status").filter({ hasText: "文档已变化或已切换" }).waitFor();
    assert.equal(
      await editor.evaluate((node) => node.cmTile.root.view.state.doc.toString()),
      changedOutline,
    );
    assert.equal(await draft.inputValue(), fullArticle);
    checks.push(
      "A manual edit prevents stale full-document replacement and keeps both the current text and generated draft",
    );

    await panel.getByLabel("向 AI 助理发送消息").fill("fixture-outline-truncated");
    await panel.getByRole("button", { name: "生成全文", exact: true }).click();
    await panel.getByText("未完成草稿", { exact: true }).waitFor();
    assert.equal(
      await panel.getByRole("button", { name: "替换当前文档全文", exact: true }).count(),
      0,
    );
    await panel.getByRole("status").filter({ hasText: "长度上限" }).waitFor();
    assert.ok((await panel.locator(".ai-answer").textContent()).includes("未完成的正文"));
    await panel.getByLabel("向 AI 助理发送消息").fill("fixture-outline-missing");
    await panel.getByRole("button", { name: "生成全文", exact: true }).click();
    await draft.waitFor();
    assert.equal(
      await panel.getByRole("button", { name: "替换当前文档全文", exact: true }).isDisabled(),
      true,
    );
    await panel
      .getByText("全文草稿的标题、层级或顺序与原大纲不一致，请核对并补齐后再应用。", {
        exact: true,
      })
      .waitFor();
    checks.push("Truncated output stays unfinished; missing outline chapters disable replacement");

    await panel.getByRole("button", { name: "生成全文", exact: true }).click();
    await draft.waitFor();
    const fullNote = path.join(vault, "AI-全文成果.md");
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, fullNote);
    await panel.getByRole("button", { name: "保存为新笔记", exact: true }).click();
    await unsaved.waitFor();
    await unsaved.getByRole("button", { name: "放弃更改", exact: true }).click();
    await page.locator(".status-filename").filter({ hasText: "AI-全文成果" }).waitFor();
    assert.equal(fs.readFileSync(fullNote, "utf8"), fullArticle);
    checks.push(
      "Full article saves through the existing unsaved-document guard as plain Markdown with original YAML and no added wrapper headings",
    );
    for (const [theme, label] of [
      ["light", "日光浅色"],
      ["twitter", "极客暗黑"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.locator(`.app-shell.theme-${theme}`).waitFor();
      await page.screenshot({ path: path.join(output, `theme-${theme}.png`) });
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => !win.webContents.getURL().includes("mode=flash"))
        .setSize(390, 844),
    );
    const bounds = await panel.boundingBox();
    assert.ok(bounds && bounds.width <= 390 && bounds.x >= 0);
    await page.screenshot({ path: path.join(output, "03-narrow.png") });
    await assertDockedLayout(true);
    for (const [width, height] of [
      [1280, 900],
      [960, 640],
      [1460, 540],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()
            .find((win) => !win.webContents.getURL().includes("mode=flash"))
            .setSize(...size),
        [width, height],
      );
      await assertDockedLayout();
      const input = await panel.locator(".ai-composer").boundingBox();
      const sidebar = await panel.boundingBox();
      assert.ok(
        input.y >= sidebar.y && input.y + input.height <= sidebar.y + sidebar.height,
        "Composer remains inside short and narrow sidebars",
      );
      await page.screenshot({ path: path.join(output, `layout-${width}x${height}.png`) });
    }
    checks.push("Light, dark, stacked 390px, 960px, 1280px and short-window layouts");
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => !win.webContents.getURL().includes("mode=flash"))
        .setSize(1460, 980),
    );
    await page.getByRole("button", { name: "全屏模式", exact: true }).click();
    await page.locator(".app-shell.is-fullscreen").waitFor();
    await assertDockedLayout();
    await page.keyboard.press("F11");
    await page.locator(".app-shell.is-fullscreen").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "白板", exact: true }).click();
    await page.locator(".knowspace-canvas-view").waitFor();
    await page.keyboard.press("F11");
    await page.locator(".app-shell.is-canvas-fullscreen").waitFor();
    const canvasLayout = await assertDockedLayout();
    const canvas = await page.locator(".knowspace-canvas-view").boundingBox();
    assert.ok(
      canvas.x + canvas.width <= canvasLayout.sidebar.x + 1,
      "The fullscreen canvas stays within its reader column",
    );
    await page.screenshot({
      path: path.join(output, "layout-canvas-fullscreen.png"),
      scale: "css",
    });
    await page.keyboard.press("F11");
    await page.locator(".app-shell.is-canvas-fullscreen").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "阅读", exact: true }).click();
    await page.getByRole("tab").first().click({ button: "right" });
    await page.getByRole("button", { name: "📖 在右侧分屏对比查看", exact: true }).click();
    await page.locator(".app-shell.is-dual-split-mode").waitFor();
    await assertDockedLayout();
    await page.screenshot({ path: path.join(output, "layout-dual-split.png"), scale: "css" });
    await page.keyboard.press("Escape");
    await page.locator(".app-shell.is-dual-split-mode").waitFor({ state: "hidden" });
    checks.push(
      "Document fullscreen, canvas fullscreen and dual-document split keep the AI sidebar docked",
    );
    await page.evaluate(async () => {
      const result = await window.bookMDDesktop.system.setAppSettings({ autoSaveEnabled: true });
      if (!result.success) throw new Error("Cannot enable auto-save in isolated QA profile");
    });
    await page.keyboard.press("Control+e");
    await editor.waitFor();
    await editor.evaluate((node) => {
      const view = node.cmTile.root.view;
      view.dispatch({
        changes: { from: view.state.doc.length, insert: "\nAuto-save setting check." },
      });
    });
    await page.waitForFunction(() => Boolean(document.querySelector(".status-badge.saved")));
    const currentPath = await page.evaluate(async () => {
      const settings = await window.bookMDDesktop.system.getAppSettings();
      if (!settings.autoSaveEnabled) throw new Error("Auto-save setting was not applied");
      return true;
    });
    assert.ok(currentPath);
    assert.ok(
      fs
        .readdirSync(vault)
        .some(
          (name) =>
            name.endsWith(".md") &&
            fs.readFileSync(path.join(vault, name), "utf8").includes("Auto-save setting check."),
        ),
    );
    checks.push(
      "Auto-save setting is respected: explicit-save scenarios leave disk unchanged, enabling auto-save persists a subsequent edit",
    );
    assert.deepEqual(errors, []);
    for (const name of ["failure.json", "failure.png"])
      fs.rmSync(path.join(output, name), { force: true });
    fs.writeFileSync(
      path.join(output, "verification.json"),
      JSON.stringify(
        {
          passed: true,
          state,
          checks,
          errors,
          requests: requests.map((r) => ({ route: r.route, model: r.body.model })),
          modelValidation: "Local deterministic fixture; no real external model or account used.",
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ passed: true, checks, output }, null, 2));
  } catch (error) {
    let statuses = [];
    if (app) {
      const pages = app.windows();
      if (pages.length) {
        statuses = await pages[0]
          .locator('[role="status"]')
          .allTextContents()
          .catch(() => []);
        await pages[0].screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
      }
    }
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify(
        { checks, errors, statuses, requestCount: requests.length, error: String(error) },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    if (app) await app.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
