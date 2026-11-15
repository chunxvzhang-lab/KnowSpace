const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output/playwright/ai-authoring", String(Date.now()));
fs.mkdirSync(output, { recursive: true });
const vault = path.join(output, "中文 创作验收");
fs.mkdirSync(vault);
const note = path.join(vault, "项目计划.md");
const blank = path.join(vault, "空白.md");
const boardFile = path.join(vault, "AI-白板.canvas");
const original = "# 项目计划\n\n已确认预算 10 万元。\n";
fs.writeFileSync(note, original);
fs.writeFileSync(blank, "");
const checks = [],
  errors = [],
  requests = [];
let held;
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    try {
      const body = JSON.parse(raw);
      const system = body.messages[0]?.content || "";
      const last = body.messages.at(-1).content;
      const testing = last === "Reply with OK.";
      const task = testing ? "" : JSON.parse(last).task;
      const kind = system.includes('"edits"')
        ? "edit"
        : system.includes("生成白板卡片")
          ? "canvas"
          : system.includes("可编辑的思维导图")
            ? "mindmap"
            : "create";
      const sources = testing ? [] : JSON.parse(last).sources;
      const card =
        task.includes("card-edit") || task.includes("card-delete")
          ? JSON.parse(sources[0].text).nodes.find((node) => node.text?.includes("准备工作"))
          : null;
      requests.push({ kind, messages: body.messages });
      const text = testing
        ? "OK"
        : kind === "edit"
          ? task.includes("delete-document")
            ? JSON.stringify({ edits: [{ before: sources[0].text, after: "" }] })
            : task.includes("delete-all")
              ? JSON.stringify({
                  edits: JSON.parse(sources[0].text)
                    .nodes.filter((node) => node.type === "text")
                    .map((node) => ({ nodeId: node.id, before: node.text, after: "" })),
                })
              : task.includes("diagram-edit")
                ? JSON.stringify({
                    edits: [
                      {
                        before: "## 准备阶段\n### 资料调研",
                        after: "## 需求分析\n### 资料调研\n### 访谈",
                      },
                    ],
                  })
                : task.includes("diagram-delete")
                  ? JSON.stringify({ edits: [{ before: "## 实施阶段\n### 开发验证", after: "" }] })
                  : task.includes("card-edit")
                    ? JSON.stringify({
                        edits: [
                          {
                            nodeId: card.id,
                            before: "完成资料调研。",
                            after: "完成需求访谈并复核资料。",
                          },
                        ],
                      })
                    : task.includes("card-delete")
                      ? JSON.stringify({
                          edits: [{ nodeId: card.id, before: card.text, after: "" }],
                        })
                      : task.includes("invalid-id")
                        ? JSON.stringify({
                            edits: [{ nodeId: "missing", before: "资料", after: "需求" }],
                          })
                        : task.includes("revision-notes")
                          ? "## 修订说明\n一级标题应改为测试。"
                          : JSON.stringify({ edits: [{ before: "# 项目计划", after: "# 测试" }] })
          : task.includes("malformed")
            ? '{"cards":['
            : kind === "canvas"
              ? '{"cards":[{"title":"准备工作","content":"完成资料调研。"},{"title":"执行验收","content":"逐项核对交付结果。"}]}'
              : kind === "mindmap"
                ? "# 项目实施脑图\n\n- 准备阶段\n  - 资料调研\n- 实施阶段\n  - 开发验证\n- 验收阶段\n  - 结果核对"
                : "## AI 补充内容\n\n先明确目标，再制定实施步骤。";
      const send = () => {
        if (res.destroyed) return;
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        const finishReason = task.includes("truncated") ? "length" : "stop";
        res.end(
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }], usage: { prompt_tokens: 100, completion_tokens: 50 } })}\n\ndata: [DONE]\n\n`,
        );
      };
      if (task.includes("held-response")) held = send;
      else send();
    } catch (error) {
      res.writeHead(500);
      res.end(error.message);
    }
  });
});
async function waitUntil(predicate, message) {
  const limit = Date.now() + 12000;
  while (Date.now() < limit) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
async function main() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const profile = path.join(output, "Data");
  const executablePath = process.env.KNOWSPACE_AI_PREVIEW_EXE || require("electron");
  const app = await electron.launch({
    executablePath,
    args: [
      ...(process.env.KNOWSPACE_AI_PREVIEW_EXE ? [] : [root]),
      note,
      `--user-data-dir=${profile}`,
    ],
    env: { ...process.env, BOOKMD_DEV_SERVER_URL: "" },
  });
  try {
    const state = await app.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("mode=flash"))
        .setContentSize(1540, 1040);
      return {
        packaged: app.isPackaged,
        version: app.getVersion(),
        appPath: app.getAppPath(),
        userData: app.getPath("userData"),
      };
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.locator(".reader-pane h1").filter({ hasText: "项目计划" }).waitFor();
    await page.getByRole("button", { name: "日光浅色", exact: true }).click();
    for (const label of ["闪念胶囊速记", "知识网络全景图谱", "思维导图模式"]) {
      const button = page.getByRole("button", { name: label, exact: true });
      for (const theme of ["light", "twitter"]) {
        await page
          .getByRole("button", { name: theme === "light" ? "日光浅色" : "极客暗黑", exact: true })
          .click();
        for (const hover of [false, true]) {
          if (hover) await button.hover();
          else await page.mouse.move(1200, 20);
          const filter = await button.locator("svg").evaluate((el) => getComputedStyle(el).filter);
          assert.ok(filter.includes("drop-shadow"), `${label}/${theme}/${hover}`);
        }
      }
    }
    checks.push(
      "Both screenshot icons and mindmap mode retain neon in light/dark and hover states",
    );
    await page.getByRole("button", { name: "日光浅色", exact: true }).click();
    await page.getByRole("button", { name: "AI 助理", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "AI 工作台" });
    await panel.getByRole("button", { name: "模型接口", exact: true }).click();
    const about = page.getByRole("dialog");
    await about.getByLabel("服务地址").fill(`http://127.0.0.1:${server.address().port}/v1`);
    await about.getByLabel("模型名称").fill("local-authoring-fixture");
    await about.getByRole("button", { name: "保存并测试连接" }).click();
    await about.getByRole("status").filter({ hasText: "连接成功" }).waitFor();
    assert.equal(await panel.getByLabel("API Key").count(), 0);
    await page.screenshot({ path: path.join(output, "00-model-settings.png"), scale: "css" });
    await about.getByRole("button", { name: "关于软件", exact: true }).click();
    assert.equal(await about.locator(".about-changelog-card").count(), 0);
    await page.screenshot({ path: path.join(output, "00-about.png"), scale: "css" });
    await about.getByTitle("关闭 (Esc)").click();
    await about.waitFor({ state: "hidden" });
    await panel.locator("details.ai-context > summary").click();
    await panel.getByRole("button", { name: "工作台", exact: true }).click();
    await panel.getByRole("button", { name: "对话创作", exact: true }).waitFor();
    const run = async (prompt) => {
      await panel.getByLabel("向 AI 助理发送消息").fill(prompt);
      await panel.getByRole("button", { name: "生成", exact: true }).click();
    };
    const disk = () => fs.readFileSync(note, "utf8");
    await run("文件一级标题改为测试");
    await waitUntil(
      () => disk() === original.replace("# 项目计划", "# 测试"),
      "Heading must change in the original file",
    );
    assert.ok(!disk().includes("修订说明"));
    await panel.getByRole("button", { name: "已写入", exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, "00-direct-edit.png"), scale: "css" });
    await panel.getByRole("button", { name: "撤销本次写入", exact: true }).click();
    await waitUntil(() => disk() === original, "Edit undo must restore the exact original");
    await run("文件一级标题改为测试 revision-notes");
    await panel.getByRole("status").filter({ hasText: "原文未变" }).waitFor();
    assert.equal(disk(), original);
    checks.push(
      "Conversation changes the existing heading directly, exact undo works, and model revision notes cannot write",
    );

    await run("补充具体的实施步骤");
    await panel.getByRole("button", { name: "已写入", exact: true }).waitFor();
    await waitUntil(
      () => disk().includes("AI 补充内容"),
      "Auto-save did not write document content",
    );
    assert.ok(disk().startsWith(original));
    await panel.locator(".ai-chat-body").evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({
      path: path.join(output, "01-conversation-document.png"),
      scale: "css",
    });
    await panel.getByRole("button", { name: "撤销本次写入" }).click();
    await waitUntil(() => disk() === original, "Undo did not restore original document");
    checks.push(
      "Conversation writes real Markdown through auto-save and exact undo restores original",
    );

    await run("整理成思维导图");
    await panel.getByText("已写入并打开思维导图，原文保留。", { exact: true }).waitFor();
    await waitUntil(() => disk().includes("资料调研"), "Mind map Markdown was not saved");
    assert.ok(disk().startsWith(original));
    assert.equal(
      await page
        .getByRole("button", { name: "思维导图模式", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await panel.locator(".ai-chat-body").evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({ path: path.join(output, "02-conversation-mindmap.png"), scale: "css" });
    const mapLabels = page.locator(".mindmap-node-title-text");
    for (const label of ["准备阶段", "资料调研", "实施阶段", "开发验证", "验收阶段"]) {
      await mapLabels.filter({ hasText: new RegExp(`^${label}$`) }).waitFor();
    }
    const followUp = requests.at(-1).messages;
    assert.ok(followUp.some((m) => m.role === "assistant" && m.content.includes("AI 补充内容")));
    checks.push("Follow-up context is sent and editable mind map opens from generated Markdown");
    const generatedMap = disk();
    await run("把思维导图的准备阶段改为需求分析，在其下添加访谈节点 diagram-edit");
    await waitUntil(() => disk().includes("### 访谈"), "Mindmap edit was not saved");
    assert.equal(
      disk(),
      generatedMap.replace("## 准备阶段\n### 资料调研", "## 需求分析\n### 资料调研\n### 访谈"),
    );
    await mapLabels.filter({ hasText: /^访谈$/ }).waitFor();
    assert.equal(await mapLabels.filter({ hasText: /^准备阶段$/ }).count(), 0);
    assert.equal(
      await page
        .getByRole("button", { name: "思维导图模式", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.screenshot({ path: path.join(output, "02-mindmap-edit.png"), scale: "css" });
    await panel.getByRole("button", { name: "撤销本次写入" }).click();
    await waitUntil(() => disk() === generatedMap, "Mindmap edit undo failed");
    await mapLabels.filter({ hasText: /^准备阶段$/ }).waitFor();
    await run("删除思维导图的实施阶段分支及其子节点 diagram-delete");
    await waitUntil(() => !disk().includes("开发验证"), "Mindmap branch deletion failed");
    assert.ok(disk().startsWith(original));
    await waitUntil(
      async () => (await mapLabels.filter({ hasText: /^开发验证$/ }).count()) === 0,
      "Deleted map node stayed visible",
    );
    await panel.getByRole("button", { name: "撤销本次写入" }).click();
    await waitUntil(() => disk() === generatedMap, "Mindmap deletion undo failed");
    checks.push(
      "Generated branches render; conversational rename, child insertion and branch deletion modify the original, preserve body and mindmap view, with exact undo",
    );
    await page
      .locator(".mindmap-node-interactive")
      .filter({ has: mapLabels.filter({ hasText: /^资料调研$/ }) })
      .locator(".mindmap-node-rect")
      .dblclick();
    await page.locator(".mindmap-inline-edit-input").fill("人工调研");
    await panel.getByLabel("向 AI 助理发送消息").fill("修改脑图的准备阶段");
    const requestCountBeforePending = requests.length;
    await panel.getByRole("button", { name: "生成", exact: true }).click();
    await panel.getByRole("status").filter({ hasText: "还有未提交的修改" }).waitFor();
    assert.equal(requests.length, requestCountBeforePending);
    assert.equal(disk(), generatedMap);
    await page.locator(".mindmap-sync-doc-btn").click();
    await waitUntil(() => disk().includes("人工调研"), "Manual mindmap edit was not synced");
    checks.push(
      "Unsynced manual mindmap edits block AI requests; explicit sync preserves the local edit",
    );

    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, boardFile);
    await run("生成两张白板卡片");
    await waitUntil(() => fs.existsSync(boardFile), "Canvas file was not created");
    await page.locator(".status-filename").filter({ hasText: "AI-白板" }).waitFor();
    const firstBoard = JSON.parse(fs.readFileSync(boardFile, "utf8"));
    assert.equal(firstBoard.nodes.length, 2);
    assert.ok(firstBoard.nodes.every((n) => n.type === "text"));
    const before = disk();
    await panel.getByRole("button", { name: "对话创作", exact: true }).click();
    await run("继续生成白板卡片");
    await panel.getByText("白板卡片已追加，原卡片保留。", { exact: true }).waitFor();
    await waitUntil(
      () => JSON.parse(fs.readFileSync(boardFile, "utf8")).nodes.length === 4,
      "Canvas additions were not saved",
    );
    assert.deepEqual(
      JSON.parse(fs.readFileSync(boardFile, "utf8")).nodes.slice(0, 2),
      firstBoard.nodes,
    );
    assert.equal(disk(), before);
    await panel.locator(".ai-chat-body").evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({ path: path.join(output, "03-conversation-canvas.png"), scale: "css" });
    await panel.getByRole("button", { name: "撤销本次写入" }).click();
    await waitUntil(
      () => JSON.parse(fs.readFileSync(boardFile, "utf8")).nodes.length === 2,
      "Canvas undo failed",
    );
    checks.push(
      "Native save creates .canvas, subsequent cards append without changing originals or Markdown, and undo works",
    );
    const boardDisk = () => JSON.parse(fs.readFileSync(boardFile, "utf8"));
    await run("修改准备工作卡片内容为完成需求访谈并复核资料 card-edit");
    await waitUntil(
      () => boardDisk().nodes[0].text.includes("需求访谈"),
      "Card modification failed",
    );
    assert.deepEqual(boardDisk(), {
      ...firstBoard,
      nodes: firstBoard.nodes.map((node, i) =>
        i === 0 ? { ...node, text: "## 准备工作\n\n完成需求访谈并复核资料。" } : node,
      ),
    });
    await page.locator(".canvas-node").filter({ hasText: "完成需求访谈并复核资料。" }).waitFor();
    await page.screenshot({ path: path.join(output, "03-card-edit.png"), scale: "css" });
    const editedBoard = fs.readFileSync(boardFile, "utf8");
    await page.reload();
    await page.locator(".app-shell").waitFor();
    await app.evaluate(({ BrowserWindow }, target) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("mode=flash"))
        .webContents.send("bookmd:open-file-path", target);
    }, boardFile);
    await page.locator(".status-filename").filter({ hasText: "AI-白板" }).waitFor();
    await page.locator(".canvas-node").filter({ hasText: "完成需求访谈并复核资料。" }).waitFor();
    assert.equal(fs.readFileSync(boardFile, "utf8"), editedBoard);
    if (!(await panel.isVisible()))
      await page.getByRole("button", { name: "AI 助理", exact: true }).click();
    if ((await panel.locator("details.ai-context").getAttribute("open")) === null)
      await panel.locator("details.ai-context > summary").click();
    await run("删除准备工作白板卡片 card-delete");
    await waitUntil(() => boardDisk().nodes.length === 1, "Card deletion failed");
    assert.equal(boardDisk().nodes[0].id, firstBoard.nodes[1].id);
    await panel.getByRole("button", { name: "撤销本次写入" }).click();
    await waitUntil(
      () => fs.readFileSync(boardFile, "utf8") === editedBoard,
      "Card deletion undo failed",
    );
    await run("修改白板卡片 invalid-id");
    await panel.getByRole("status").filter({ hasText: "未找到唯一的白板文本卡片 ID" }).waitFor();
    assert.equal(fs.readFileSync(boardFile, "utf8"), editedBoard);
    checks.push(
      "Card modification preserves IDs, positions and other cards, survives reload; card deletion and exact undo work; invalid target IDs cannot write",
    );

    await run("白板卡片 malformed");
    await panel.getByRole("status").filter({ hasText: "白板卡片格式无效" }).waitFor();
    assert.equal(JSON.parse(fs.readFileSync(boardFile, "utf8")).nodes.length, 2);
    await run("白板卡片 truncated");
    await panel.getByText("未完成草稿", { exact: true }).waitFor();
    assert.equal(JSON.parse(fs.readFileSync(boardFile, "utf8")).nodes.length, 2);
    checks.push("Malformed and length-truncated model output cannot write cards");

    await run("白板卡片 held-response");
    await waitUntil(() => !!held, "Deferred model response was not captured");
    await app.evaluate(({ BrowserWindow }, target) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("mode=flash"))
        .webContents.send("bookmd:open-file-path", target);
    }, note);
    await page.locator(".status-filename").filter({ hasText: "项目计划" }).waitFor();
    held();
    held = null;
    await panel.getByRole("status").filter({ hasText: "文档已变化或已切换" }).waitFor();
    assert.equal(disk(), before);
    assert.equal(JSON.parse(fs.readFileSync(boardFile, "utf8")).nodes.length, 2);
    checks.push(
      "Switching documents before completion keeps the draft and blocks automatic writing",
    );

    await app.evaluate(({ BrowserWindow }, target) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("mode=flash"))
        .webContents.send("bookmd:open-file-path", target);
    }, blank);
    await page.locator(".status-filename").filter({ hasText: "空白" }).waitFor();
    await panel.getByRole("combobox", { name: "生成内容", exact: true }).selectOption("create");
    await run("写一份简短的简介");
    await panel.getByRole("button", { name: "已写入", exact: true }).waitFor();
    await waitUntil(
      () => fs.readFileSync(blank, "utf8").includes("AI 补充内容"),
      "Empty document writing failed",
    );
    checks.push("Empty Markdown documents can be created from conversation without evidence");
    const beforeClearMap = fs.readFileSync(blank, "utf8");
    await panel.getByRole("combobox", { name: "生成内容", exact: true }).selectOption("auto");
    await page.getByRole("button", { name: "思维导图模式", exact: true }).click();
    await page
      .locator(".mindmap-node-title-text")
      .filter({ hasText: /^AI 补充内容$/ })
      .waitFor();
    await run("删除脑图的全部内容 delete-document");
    await waitUntil(() => fs.readFileSync(blank, "utf8") === "", "Clearing the map source failed");
    await waitUntil(
      async () =>
        (await page
          .locator(".mindmap-node-title-text")
          .filter({ hasText: /^AI 补充内容$/ })
          .count()) === 0,
      "Cleared map retained old branches",
    );
    await panel.getByRole("button", { name: "撤销本次写入" }).click();
    await waitUntil(
      () => fs.readFileSync(blank, "utf8") === beforeClearMap,
      "Empty map undo failed",
    );
    await page
      .locator(".mindmap-node-title-text")
      .filter({ hasText: /^AI 补充内容$/ })
      .waitFor();
    checks.push(
      "Clearing a mindmap removes its visible old branches immediately; undo restores both Markdown and nodes",
    );
    await app.evaluate(({ BrowserWindow }, target) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("mode=flash"))
        .webContents.send("bookmd:open-file-path", target);
    }, boardFile);
    await page.locator(".status-filename").filter({ hasText: "AI-白板" }).waitFor();
    if ((await panel.locator("details.ai-context").getAttribute("open")) === null)
      await panel.locator("details.ai-context > summary").click();
    await panel.getByRole("combobox", { name: "生成内容", exact: true }).selectOption("auto");
    const beforeEmpty = fs.readFileSync(boardFile, "utf8");
    await run("删除白板中的全部卡片 delete-all");
    await waitUntil(() => boardDisk().nodes.length === 0, "Deleting all cards failed");
    await waitUntil(
      async () => (await page.locator(".canvas-node").count()) === 0,
      "Empty canvas did not render",
    );
    await panel.getByRole("button", { name: "撤销本次写入" }).click();
    await waitUntil(
      () => fs.readFileSync(boardFile, "utf8") === beforeEmpty,
      "Empty canvas undo failed",
    );
    await run("删除白板中的全部卡片 delete-all");
    await waitUntil(() => boardDisk().nodes.length === 0, "Deleting all cards again failed");
    await page.reload();
    await page.locator(".app-shell").waitFor();
    await app.evaluate(({ BrowserWindow }, target) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("mode=flash"))
        .webContents.send("bookmd:open-file-path", target);
    }, boardFile);
    await page.locator(".status-filename").filter({ hasText: "AI-白板" }).waitFor();
    await page.locator(".knowspace-canvas-view").waitFor();
    assert.equal(await page.locator(".canvas-node").count(), 0);
    assert.equal(boardDisk().nodes.length, 0);
    checks.push(
      "Deleting the last card produces an empty canvas, supports exact undo and stays empty after reload",
    );
    assert.deepEqual(errors, []);
    const result = {
      passed: true,
      state,
      checks,
      requestCount: requests.length,
      errors,
      service: "deterministic local SSE fixture; no external model quality claim",
      output,
    };
    fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify(result, null, 2));
    fs.writeFileSync(
      path.join(root, "output/playwright/ai-authoring/latest.json"),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const page = await app.firstWindow();
    await page.screenshot({ path: path.join(output, "failure.png"), scale: "css" }).catch(() => {});
    fs.writeFileSync(
      path.join(output, "failure-state.json"),
      JSON.stringify(
        {
          file: await page
            .locator(".status-filename")
            .textContent()
            .catch(() => ""),
          boardVisible: await page
            .locator(".knowspace-canvas-view")
            .isVisible()
            .catch(() => false),
          cardCount: await page.locator(".canvas-node").count(),
          checks,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  server.close();
});
