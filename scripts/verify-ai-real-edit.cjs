const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "output/playwright/ai-real-edit", String(Date.now()));
const profile = path.join(output, "Data");
const config = path.join(process.env.APPDATA, "knowspace/ai/settings.json");
const copiedConfig = path.join(profile, "ai/settings.json");
const localState = path.join(path.dirname(path.dirname(config)), "Local State");
const copiedLocalState = path.join(profile, "Local State");
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const original = "# 未命名\n\n这是临时验收文档。请保留这句话。\n";
const expected = original.replace("# 未命名", "# 测试");
const errors = [];
async function until(predicate, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The real model edit did not pass within the verification timeout");
}
(async () => {
  assert.ok(process.env.KNOWSPACE_AI_PREVIEW_EXE, "A packaged executable is required");
  assert.ok(fs.existsSync(config), "No existing desktop model settings were found");
  const beforeConfigHash = hash(config);
  fs.mkdirSync(path.dirname(copiedConfig), { recursive: true });
  fs.copyFileSync(config, copiedConfig);
  if (fs.existsSync(localState)) fs.copyFileSync(localState, copiedLocalState);
  const note = path.join(output, "标题修改验收.md");
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
        .setContentSize(1440, 960);
      return { packaged: app.isPackaged, appPath: app.getAppPath() };
    });
    assert.ok(state.packaged);
    const page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.name));
    await page.locator(".reader-pane h1").filter({ hasText: "未命名" }).waitFor();
    const configured = await page.evaluate(async () => {
      const api = window.bookMDDesktop.ai;
      const result = await api.getSettings();
      if (!result.success || !result.value.model) return false;
      const { provider, baseUrl, model, dailyTokenLimit } = result.value;
      const saved = await api.saveSettings({
        settings: {
          provider,
          baseUrl,
          model,
          dailyTokenLimit,
          maxOutputTokens: 2048,
          saveHistory: false,
        },
      });
      return saved.success;
    });
    assert.ok(configured, "The existing model configuration could not be used");
    await page.getByRole("button", { name: "日光浅色", exact: true }).click();
    await page.getByRole("button", { name: "AI 助理", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "AI 工作台" });
    await panel.locator(".ai-brand span").filter({ hasNotText: "与你一起创作" }).waitFor();
    await panel.getByLabel("向 AI 助理发送消息").fill("文件一级标题改为测试");
    await panel.getByRole("button", { name: "生成", exact: true }).click();
    await until(async () => {
      if (fs.readFileSync(note, "utf8") === expected) return true;
      if (await panel.getByRole("button", { name: "生成", exact: true }).count()) {
        const feedback = await panel
          .getByRole("status")
          .textContent()
          .catch(() => "");
        if (feedback && !feedback.includes("已按对话修改")) {
          const diagnostic = {
            httpStatus: feedback.match(/\b[45]\d\d\b/)?.[0] || null,
            malformedEdit: feedback.includes("未返回可执行") || feedback.includes("修改格式无效"),
            unmatchedEdit: feedback.includes("未唯一匹配"),
            decryptionFailed: feedback.includes("解密"),
            budgetInsufficient: feedback.includes("预算不足"),
            outputTruncated: feedback.includes("截断") || feedback.includes("输出达到"),
            providerFailure: feedback.includes("服务") || feedback.includes("连接"),
          };
          fs.writeFileSync(
            path.join(output, "failure-diagnostic.json"),
            JSON.stringify(diagnostic, null, 2),
          );
          throw new Error("Real model verification failed: " + JSON.stringify(diagnostic));
        }
      }
      return false;
    });
    assert.equal(fs.readFileSync(note, "utf8"), expected);
    await page.screenshot({ path: path.join(output, "real-model-heading-edit.png"), scale: "css" });
    await panel.getByRole("button", { name: "撤销本次写入", exact: true }).click();
    await until(() => fs.readFileSync(note, "utf8") === original, 10000);
    assert.deepEqual(errors, []);
    const report = {
      passed: true,
      realConfiguredModel: true,
      temporaryDocumentOnly: true,
      state,
      headingUpdatedInOriginalFile: true,
      bodyUnchanged: true,
      exactUndoPassed: true,
      rendererErrors: errors,
      output,
    };
    fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify(report, null, 2));
    fs.writeFileSync(
      path.join(root, "output/playwright/ai-real-edit/latest.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (app) await app.close();
    assert.equal(hash(config), beforeConfigHash, "Existing model settings were modified");
    assert.ok(copiedConfig.startsWith(output + path.sep));
    if (fs.existsSync(copiedConfig)) fs.unlinkSync(copiedConfig);
    if (fs.existsSync(copiedLocalState)) fs.unlinkSync(copiedLocalState);
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
