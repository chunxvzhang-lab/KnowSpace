const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output/playwright/ai-real-diagrams", String(Date.now()));
const profile = path.join(output, "Data");
const config = path.join(process.env.APPDATA, "knowspace/ai/settings.json");
const localState = path.join(path.dirname(path.dirname(config)), "Local State");
const copiedConfig = path.join(profile, "ai/settings.json");
const copiedState = path.join(profile, "Local State");
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const checks = [],
  errors = [];
async function until(predicate, message, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
(async () => {
  assert.ok(process.env.KNOWSPACE_AI_PREVIEW_EXE, "A packaged executable is required");
  assert.ok(fs.existsSync(config), "No existing model settings were found");
  const before = hash(config);
  fs.mkdirSync(path.dirname(copiedConfig), { recursive: true });
  fs.copyFileSync(config, copiedConfig);
  if (fs.existsSync(localState)) fs.copyFileSync(localState, copiedState);
  const note = path.join(output, "虚构项目验收.md");
  const board = path.join(output, "虚构白板验收.canvas");
  const original =
    "# 虚构项目验收\n\n本文件仅用于测试。已确认预算10万元，周期两周。保留这段正文。\n";
  fs.writeFileSync(note, original);
  let app;
  try {
    app = await electron.launch({
      executablePath: process.env.KNOWSPACE_AI_PREVIEW_EXE,
      args: [note, `--user-data-dir=${profile}`],
      env: { ...process.env, BOOKMD_DEV_SERVER_URL: "" },
    });
    const state = await app.evaluate(({ app, BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("mode=flash"))
        .setContentSize(1540, 1040);
      return { packaged: app.isPackaged, appPath: app.getAppPath() };
    });
    assert.ok(state.packaged);
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.name));
    await page.locator(".reader-pane h1").filter({ hasText: "虚构项目验收" }).waitFor();
    assert.ok(
      await page.evaluate(async () => {
        const api = window.bookMDDesktop.ai;
        const result = await api.getSettings();
        if (!result.success || !result.value.model) return false;
        const { provider, baseUrl, model, dailyTokenLimit } = result.value;
        return (
          await api.saveSettings({
            settings: {
              provider,
              baseUrl,
              model,
              dailyTokenLimit,
              maxOutputTokens: 4096,
              saveHistory: false,
            },
          })
        ).success;
      }),
      "Existing model settings could not be used",
    );
    await page.getByRole("button", { name: "日光浅色", exact: true }).click();
    await page.getByRole("button", { name: "AI 助理", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "AI 工作台" });
    await panel.locator(".ai-brand span").filter({ hasNotText: "与你一起创作" }).waitFor();
    const run = async (prompt, predicate, savedAsNew = false) => {
      await panel.getByLabel("向 AI 助理发送消息").fill(prompt);
      await panel.getByRole("button", { name: "生成", exact: true }).click();
      await until(async () => {
        if (await predicate()) return true;
        if (await panel.getByRole("button", { name: "生成", exact: true }).count()) {
          const feedback = await panel
            .getByRole("status")
            .textContent()
            .catch(() => "");
          if (feedback && !/^(已写入|内容已写入|已按对话|已打开新文件)/.test(feedback)) {
            const diagnostic = {
              step: checks.length + 1,
              httpStatus: feedback.match(/\b[45]\d\d\b/)?.[0] || null,
              formatError: /格式|未返回可执行/.test(feedback),
              unmatchedTarget: /匹配|ID/.test(feedback),
              outputTruncated: /截断|输出达到/.test(feedback),
              budgetInsufficient: /预算不足/.test(feedback),
            };
            fs.writeFileSync(
              path.join(output, "failure-diagnostic.json"),
              JSON.stringify(diagnostic, null, 2),
            );
            await page.screenshot({ path: path.join(output, "failure.png"), scale: "css" });
            throw new Error("Real diagram verification failed: " + JSON.stringify(diagnostic));
          }
        }
        return false;
      }, "Real diagram response did not meet the requested result");
      await panel
        .getByRole("button", { name: savedAsNew ? "已发起保存" : "已写入", exact: true })
        .first()
        .waitFor();
    };
    const disk = () => fs.readFileSync(note, "utf8");
    await run(
      "生成思维导图：中心主题为项目验收，只包含两个一级分支：准备阶段、实施阶段。准备阶段下有资料调研，实施阶段下有开发验证。使用Markdown标题格式，不要重复已有正文。",
      () => /准备阶段/.test(disk()) && /开发验证/.test(disk()),
    );
    assert.ok(disk().startsWith(original));
    await page
      .locator(".mindmap-node-title-text")
      .filter({ hasText: /^资料调研$/ })
      .waitFor();
    const generatedMap = disk();
    checks.push(
      "Real model generated a map whose branches render and whose original prose remains unchanged",
    );
    await run(
      "将当前思维导图中的准备阶段重命名为需求分析，在它下面新增子节点访谈记录。保留资料调研、实施阶段及所有正文。",
      () => /需求分析/.test(disk()) && /访谈记录/.test(disk()) && !/准备阶段/.test(disk()),
    );
    assert.ok(disk().startsWith(original));
    assert.ok(disk().includes("开发验证"));
    await page
      .locator(".mindmap-node-title-text")
      .filter({ hasText: /^访谈记录$/ })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "思维导图模式", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.screenshot({ path: path.join(output, "real-mindmap-edit.png"), scale: "css" });
    await panel.getByRole("button", { name: "撤销本次写入" }).click();
    await until(() => disk() === generatedMap, "Real map undo failed", 10000);
    checks.push(
      "Real model renamed an existing branch and inserted a child without duplicating the map; exact undo passed",
    );
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, board);
    await run(
      "生成两张白板卡片，标题分别严格为预算、周期。预算卡片正文为10万元，周期卡片正文为两周。",
      () => fs.existsSync(board),
      true,
    );
    await page.locator(".status-filename").filter({ hasText: "虚构白板验收" }).waitFor();
    const boardDisk = () => JSON.parse(fs.readFileSync(board, "utf8"));
    const generatedBoard = boardDisk();
    assert.equal(generatedBoard.nodes.length, 2);
    const target = generatedBoard.nodes.find((n) => n.text.includes("预算"));
    assert.ok(target);
    checks.push("Real model generated two editable cards saved to a new canvas");
    await run(
      "把当前白板中预算卡片的10万元修改为20万元，卡片标题仍为预算，周期卡片完全不变。",
      () => boardDisk().nodes.some((n) => n.id === target.id && n.text.includes("20万元")),
    );
    assert.deepEqual(boardDisk(), {
      ...generatedBoard,
      nodes: generatedBoard.nodes.map((n) =>
        n.id === target.id ? { ...n, text: n.text.replace("10万元", "20万元") } : n,
      ),
    });
    await page.locator(".canvas-node").filter({ hasText: "20万元" }).waitFor();
    await page.screenshot({ path: path.join(output, "real-card-edit.png"), scale: "css" });
    await panel.getByRole("button", { name: "撤销本次写入" }).click();
    await until(
      () => JSON.stringify(boardDisk()) === JSON.stringify(generatedBoard),
      "Real card undo failed",
      10000,
    );
    checks.push(
      "Real model modified the identified existing card while preserving IDs, geometry and the other card; exact undo passed",
    );
    assert.deepEqual(errors, []);
    const report = {
      passed: true,
      realConfiguredModel: true,
      temporaryDocumentsOnly: true,
      state,
      checks,
      requestCount: 4,
      errors,
      output,
    };
    fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(
      path.join(root, "output/playwright/ai-real-diagrams/latest.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (app) await app.close();
    assert.equal(hash(config), before, "Existing model settings were modified");
    for (const file of [copiedConfig, copiedState]) {
      assert.ok(file.startsWith(output + path.sep));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
