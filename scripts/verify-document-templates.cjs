const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const MarkdownIt = require("markdown-it");

const root = path.resolve(__dirname, "..");
const output =
  process.env.KNOWSPACE_TEMPLATE_QA_OUTPUT ||
  path.join(root, "output", "playwright", "template-validation");
const profile = path.join(output, `profile-${Date.now()}`);
const vault = path.join(output, `test-vault-${Date.now()}`);
const templateRoot = path.join(root, "docs", "markdown-templates");
const templates = fs
  .readdirSync(templateRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))
  .flatMap((category) =>
    fs
      .readdirSync(path.join(templateRoot, category.name))
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map((name) => ({
        id: name.replace(/\.md$/, ""),
        title: name.replace(/^\d+-/, "").replace(/\.md$/, ""),
        content: fs.readFileSync(path.join(templateRoot, category.name, name), "utf8"),
      })),
  );

async function main() {
  fs.mkdirSync(vault, { recursive: true });
  const app = await electron.launch({
    executablePath:
      process.env.KNOWSPACE_PREVIEW_EXE ||
      path.join(root, "release", "KnowSpace-win-x64", "KnowSpace.exe"),
    args: [`--user-data-dir=${profile}`, "--force-renderer-accessibility"],
    env: { ...process.env, BOOKMD_DEV_SERVER_URL: "" },
    timeout: 30000,
  });
  const results = [],
    checks = [],
    errors = [];
  const md = new MarkdownIt();
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    const state = await app.evaluate(({ app, BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(
        (item) => !item.webContents.getURL().includes("mode=flash"),
      );
      win.setSize(1440, 1000);
      return {
        profile: app.getPath("userData"),
        version: app.getVersion(),
        electron: process.versions.electron,
      };
    });
    assert.equal(path.resolve(state.profile), profile);
    await page.getByRole("heading", { name: "选择或新建 Markdown 文档", exact: true }).waitFor();
    await page.getByRole("button", { name: "日光浅色", exact: true }).click();
    await page.screenshot({ path: path.join(output, "welcome.png") });

    // Only the native path chooser is substituted; IPC handlers, file writes,
    // manifest refresh, sessions, editor and reader are the packaged production code.
    await app.evaluate(({ dialog, ipcMain }) => {
      globalThis.templateSaveQueue = [];
      globalThis.templateSaveCalls = [];
      globalThis.documentSaveResults = [];
      const saveHandler = ipcMain._invokeHandlers.get("bookmd:save-markdown-file");
      ipcMain.removeHandler("bookmd:save-markdown-file");
      ipcMain.handle("bookmd:save-markdown-file", async (event, request) => {
        const entry = { started: Date.now(), expectedVersion: request.expectedVersion };
        globalThis.documentSaveResults.push(entry);
        const result = await saveHandler(event, request);
        entry.success = result.success;
        entry.errorCode = result.errorCode;
        return result;
      });
      dialog.showSaveDialog = async (...args) => {
        globalThis.templateSaveCalls.push(args.at(-1));
        const next = globalThis.templateSaveQueue.shift();
        if (!next) throw new Error("No QA save destination queued");
        return next === "cancel" ? { canceled: true } : { canceled: false, filePath: next };
      };
    });
    const queueSave = (file) =>
      app.evaluate((_electron, file) => globalThis.templateSaveQueue.push(file), file);
    const openPicker = () =>
      page.locator(".toolbar").getByRole("button", { name: "从模板新建", exact: true }).click();

    await page
      .locator(".empty-reader")
      .getByRole("button", { name: "从模板新建", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "从模板新建", exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.locator(".template-option").count(), 20);
    await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.activeElement.closest("dialog") !== null));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    checks.push("Welcome entry, modal focus and Escape cancellation");

    await page
      .locator(".activity-bar")
      .getByRole("button", { name: "从模板新建", exact: true })
      .click();
    await dialog.waitFor();
    await page.getByLabel("模板分类", { exact: true }).selectOption("协作与推进");
    assert.equal(await dialog.locator(".template-option").count(), 4);
    await page.getByLabel("搜索模板", { exact: true }).fill("  会议  ");
    assert.equal(await dialog.locator(".template-option").count(), 1);
    await page.getByLabel("搜索模板", { exact: true }).fill("不存在的模板");
    assert.equal(await dialog.getByRole("button", { name: "使用模板新建" }).isEnabled(), false);
    await page.screenshot({ path: path.join(output, "empty-search.png") });
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    checks.push("Activity entry, category and trimmed search, empty results, cancel");

    for (const [index, template] of templates.entries()) {
      const target = path.join(vault, `${template.id}.md`);
      await openPicker();
      await dialog.waitFor();
      await dialog
        .locator(".template-option")
        .filter({ has: page.locator("strong", { hasText: new RegExp(`^${template.title}$`) }) })
        .click();
      const preview = dialog.locator(".template-preview");
      assert.equal(
        await preview.locator("h1").innerText(),
        template.content.split(/\r?\n/)[0].slice(2),
      );
      await page.screenshot({ path: path.join(output, `${template.id}-picker.png`) });
      await queueSave(target);
      await dialog.getByRole("button", { name: "使用模板新建", exact: true }).click();
      await page.locator(".document-workspace.view-live .cm-content").waitFor();
      await page.waitForFunction(
        (name) =>
          document.querySelector(".statusbar")?.textContent.includes(name) ||
          document.querySelector(".toolbar .chapter-title-row")?.textContent.includes(name),
        template.id,
      );
      assert.equal(fs.readFileSync(target, "utf8"), template.content);
      await page.screenshot({ path: path.join(output, `${template.id}-live.png`) });
      await page.keyboard.press("Control+e");
      await page.locator(".document-workspace.view-read").waitFor();
      const article = page.locator(".reader-pane article.markdown-body").first();
      await article.locator("h1").waitFor();
      const expectedTables = md
        .parse(template.content, {})
        .filter((token) => token.type === "table_open").length;
      assert.equal(await article.locator("table").count(), expectedTables);
      assert.equal(
        await article.locator('input[type="checkbox"]').count(),
        (template.content.match(/^- \[ \]/gm) || []).length,
      );
      assert.equal(
        await article.locator("h1").innerText(),
        template.content.split(/\r?\n/)[0].slice(2),
      );
      const geometry = await article.evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        bodyOverflow: document.documentElement.scrollWidth - window.innerWidth,
        headings: element.querySelectorAll("h2,h3").length,
      }));
      assert.ok(geometry.bodyOverflow <= 1, `Window overflow: ${template.id}`);
      const heights = await article.evaluate((element) => {
        const pane = element.closest(".reader-pane");
        return { content: pane.scrollHeight, viewport: pane.clientHeight };
      });
      const positions = [
        0,
        Math.max(0, (heights.content - heights.viewport) / 2),
        Math.max(0, heights.content - heights.viewport),
      ];
      for (const [positionIndex, position] of positions.entries()) {
        await page
          .locator(".reader-pane")
          .first()
          .evaluate((pane, position) => {
            pane.scrollTop = position;
          }, position);
        await page.screenshot({
          path: path.join(output, `${template.id}-read-${positionIndex + 1}.png`),
        });
      }
      results.push({
        id: template.id,
        title: template.title,
        created: true,
        savedBytesMatch: true,
        preview: true,
        live: true,
        read: true,
        tables: expectedTables,
        ...geometry,
        screenshots: 5,
      });
      console.log(`PASS ${template.id}: created, live, read, tables, tasks, 5 screenshots`);

      if (index === 0) {
        await app.evaluate(({ dialog }, vault) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [vault] });
        }, vault);
        await page.getByRole("button", { name: "文档工具", exact: true }).click();
        await page
          .getByRole("dialog", { name: "文档工具", exact: true })
          .getByRole("button", { name: "打开 Markdown 目录", exact: true })
          .click();
        await page.locator(".chapter-list-container").waitFor();
        checks.push("Create with no vault, then open an isolated vault for remaining templates");
      }
    }

    const beforeCancel = fs.readdirSync(vault).filter((name) => name.endsWith(".md")).length;
    await openPicker();
    await queueSave("cancel");
    await dialog.getByRole("button", { name: "使用模板新建", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(fs.readdirSync(vault).filter((name) => name.endsWith(".md")).length, beforeCancel);
    checks.push("Cancelled native path chooser creates no file");

    await page.keyboard.press("Control+k");
    await page.locator(".command-palette-input").fill(">从模板新建");
    await page.getByText("从模板新建", { exact: true }).last().click();
    await dialog.waitFor();
    await page.keyboard.press("Escape");
    checks.push("Command palette entry");

    const beforeSaveCount = await app.evaluate(() => globalThis.documentSaveResults.length);
    await page.keyboard.press("Control+e");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText("\n模板验收保存验证\n");
    await page.keyboard.press("Control+s");
    await page.locator(".status-badge.saved").waitFor();
    assert.ok(
      fs
        .readFileSync(path.join(vault, `${templates.at(-1).id}.md`), "utf8")
        .includes("模板验收保存验证"),
    );
    const actualSaves = await app.evaluate(() => globalThis.documentSaveResults);
    assert.equal(actualSaves.length - beforeSaveCount, 1, "One Ctrl+S must dispatch one save");
    assert.equal(await page.locator(".modal-conflict").count(), 0);
    checks.push("Created note remains editable and saves to disk");
    checks.push("One Ctrl+S dispatches one disk save without a false conflict");

    for (const theme of ["极客暗黑", "日光浅色"]) {
      await page.getByRole("button", { name: theme, exact: true }).click();
      await openPicker();
      await page.screenshot({ path: path.join(output, `picker-theme-${theme}.png`) });
      await page.keyboard.press("Escape");
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => !item.webContents.getURL().includes("mode=flash"))
        .setSize(900, 720),
    );
    await openPicker();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.width <= 900 && bounds.height <= 720);
    await page.screenshot({ path: path.join(output, "picker-small-window.png") });
    await page.keyboard.press("Escape");
    checks.push("Light, dark, e-ink and small window");

    const saveCalls = await app.evaluate(() => globalThis.templateSaveCalls);
    assert.equal(saveCalls[0].defaultPath.endsWith("快速记录.md"), true);
    assert.equal(path.dirname(saveCalls[1].defaultPath), vault);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "desktop-verification.json"),
      JSON.stringify(
        {
          ...state,
          executable:
            process.env.KNOWSPACE_PREVIEW_EXE ||
            path.join(root, "release", "KnowSpace-win-x64", "KnowSpace.exe"),
          vault,
          results,
          checks,
          errors,
          pathChooserSubstituted: true,
        },
        null,
        2,
      ),
    );
    console.log(
      `Packaged desktop: ${results.length}/20 templates and ${checks.length} checks passed; renderer errors: ${errors.length}`,
    );
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
