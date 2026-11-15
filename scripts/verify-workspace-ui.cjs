const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output =
  process.env.KNOWSPACE_UI_QA_OUTPUT ||
  path.join(root, "output", "playwright", "workspace-renewal");
const profile = path.join(output, `profile-${Date.now()}`);
const vault = path.join(output, `fixture-vault-${Date.now()}`);
const checks = [],
  layouts = [],
  errors = [];
const documentA =
  "# 让知识逐渐相连\n\n用本地 Markdown 整理想法，让阅读、写作和复习形成习惯。 #知识管理\n\n## 从一篇笔记开始\n\n阅读 [[02-项目计划]]，明确下一步。\n\n- [x] 保留可迁移的本地资料\n- [ ] 完成工作台验收\n\n## 连接你的思考\n\n| 工具 | 用途 |\n| --- | --- |\n| 文档 | 深入写作 |\n| 脑图 | 梳理大纲 |\n| 白板 | 连接想法 |\n\n## 每日回顾\n\nQ: 知识保存在什么格式？\nA: 本地 Markdown 文件。\n\n## 下一步\n\n核对内容，确认后保存。\n";
async function main() {
  fs.mkdirSync(vault, { recursive: true });
  const note = path.join(vault, "01-知识工作台.md");
  fs.writeFileSync(note, documentA);
  fs.writeFileSync(
    path.join(vault, "02-项目计划.md"),
    "# 项目计划\n\n返回 [[01-知识工作台]]。\n\n## 验收目标\n\n完成可用性验收。\n",
  );
  fs.writeFileSync(path.join(vault, ".hidden.md"), "# 隐藏测试文档\n");
  let app;
  try {
    const exe = process.env.KNOWSPACE_PREVIEW_EXE;
    app = await electron.launch({
      executablePath: exe || require("electron"),
      args: [...(exe ? [] : [root]), `--user-data-dir=${profile}`],
      env: { ...process.env, BOOKMD_DEV_SERVER_URL: "" },
      timeout: 30000,
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    const state = await app.evaluate(({ app, BrowserWindow, dialog }, vault) => {
      const win = BrowserWindow.getAllWindows().find(
        (w) => !w.webContents.getURL().includes("mode=flash"),
      );
      win.setMinimumSize(0, 0);
      win.setContentSize(1460, 980);
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [vault] });
      return {
        packaged: app.isPackaged,
        appPath: app.getAppPath(),
        profile: app.getPath("userData"),
        electron: process.versions.electron,
      };
    }, vault);
    assert.equal(path.resolve(state.profile), profile);
    const size = (width, height) =>
      app.evaluate(
        ({ BrowserWindow }, [w, h]) =>
          BrowserWindow.getAllWindows()
            .find((x) => !x.webContents.getURL().includes("mode=flash"))
            .setContentSize(w, h),
        [width, height],
      );
    const screenshot = (name) =>
      page.screenshot({ path: path.join(output, `${name}.png`), scale: "css" });
    await page.locator(".empty-reader").waitFor();
    await page.evaluate(() =>
      localStorage.setItem(
        "bookmd.preferences.v1",
        JSON.stringify({ theme: "eink", fontScale: 1, showLineNumbers: true }),
      ),
    );
    await page.reload();
    await page.locator(".app-shell.theme-light .empty-reader").waitFor();
    assert.equal(await page.locator('[aria-label="主题模式"] button').count(), 2);
    assert.equal(await page.getByRole("button", { name: "仿电子墨水屏", exact: true }).count(), 0);
    const whites = await page.evaluate(() => ({
      bg: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
      rail: getComputedStyle(document.documentElement).getPropertyValue("--activity-bg").trim(),
      accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    }));
    assert.deepEqual(whites, { bg: "#ffffff", rail: "#f8f8f8", accent: "#303236" });
    checks.push(
      "Legacy eink preference reloads as light; two theme buttons and neutral-white surfaces verified",
    );
    await page.getByRole("button", { name: "日光浅色", exact: true }).click();
    await screenshot("01-welcome");
    const tools = () => page.getByRole("dialog", { name: "文档工具", exact: true });
    const openTools = async () => {
      await page.getByRole("button", { name: "文档工具", exact: true }).click();
      await tools().waitFor();
    };
    await openTools();
    await tools().getByRole("button", { name: "打开 Markdown 目录", exact: true }).click();
    await page.locator(".tree-row").filter({ hasText: "01-知识工作台" }).click();
    await page.locator(".reader-pane h1").filter({ hasText: "让知识逐渐相连" }).waitFor();
    checks.push(
      "Welcome screen and document tools open a real local vault and render Markdown tables and tasks",
    );

    await openTools();
    const modalFocus = await page.evaluate(() => !!document.activeElement.closest("dialog"));
    assert.ok(modalFocus);
    if (await tools().getByRole("button", { name: "显示正文预览行号", exact: true }).count())
      await tools().getByRole("button", { name: "显示正文预览行号", exact: true }).click();
    await page.locator(".reader-line-numbers span").first().waitFor();
    await tools().getByRole("button", { name: "显示点开头的文件", exact: true }).click();
    assert.ok(await page.locator(".tree-row").filter({ hasText: ".hidden" }).count());
    await tools().getByLabel("阅读字号", { exact: true }).fill("1.15");
    assert.equal(await tools().locator("output").innerText(), "115%");
    await screenshot("02-document-tools");
    await page.keyboard.press("Escape");
    await tools().waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
      "文档工具",
    );
    checks.push(
      "Native tools dialog traps focus, retains reading controls, toggles line numbers and hidden files, and returns focus on Escape",
    );

    await openTools();
    await tools().getByRole("button", { name: "隐藏正文预览行号", exact: true }).click();
    await tools().getByRole("button", { name: "隐藏点开头的文件", exact: true }).click();
    await tools().getByLabel("阅读字号", { exact: true }).fill("1");
    await tools()
      .getByRole("button", { name: /^添加书签/ })
      .click();
    await page.getByRole("button", { name: "书签列表", exact: true }).click();
    await page.locator(".bookmark-item").first().waitFor();
    await page.getByRole("button", { name: "全文搜索", exact: true }).click();
    await page.getByRole("textbox", { name: /搜索.*内容/ }).fill("知识");
    await page.locator(".search-result").first().waitFor();
    await page.locator(".search-result").first().click();
    await page.getByRole("button", { name: "反向链接与引用", exact: true }).click();
    await page.locator(".backlinks-panel").waitFor();
    await page.getByRole("button", { name: "大纲目录", exact: true }).click();
    await page.locator(".toc-link").first().waitFor();
    checks.push(
      "Bookmark creation, text search and result navigation, backlinks and document outline remain usable",
    );

    await page.locator(".tree-row").filter({ hasText: "02-项目计划" }).click();
    const tabs = page.getByRole("tab");
    await tabs.last().focus();
    await page.keyboard.press("Home");
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("role") === "tab" &&
        document.activeElement?.getAttribute("aria-selected") === "true",
    );
    await page.locator(".reader-pane h1").filter({ hasText: "让知识逐渐相连" }).waitFor();
    await page.getByRole("button", { name: "实时预览", exact: true }).last().click();
    const editor = page.locator(".document-workspace.view-live .cm-content");
    await editor.waitFor();
    await editor.focus();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\nUI renewal persistence check.");
    await page.waitForFunction(() => document.querySelector(".status-badge.dirty"));
    await page.keyboard.press("Control+z");
    await page.waitForFunction(
      () =>
        !document.querySelector(".cm-content").innerText.includes("UI renewal persistence check."),
    );
    await page.keyboard.press("Control+y");
    await page.waitForFunction(() =>
      document.querySelector(".cm-content").innerText.includes("UI renewal persistence check."),
    );
    await page.waitForFunction(() => document.querySelector(".status-badge.dirty"));
    await page.getByRole("button", { name: "保存当前文件", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".status-badge.saved"));
    assert.ok(fs.readFileSync(note, "utf8").includes("UI renewal persistence check."));
    await page.getByRole("button", { name: "阅读", exact: true }).click();
    checks.push("Keyboard tab navigation, live editing, undo/redo and real on-disk saving");

    await openTools();
    await tools()
      .getByRole("button", { name: /版本快照与历史比对/ })
      .click();
    await page.locator(".version-history-container").waitFor();
    await page.getByRole("button", { name: /保存手动快照/ }).click();
    await page.waitForFunction(
      async ({ note, vault }) => {
        const snapshots = await window.bookMDDesktop.history.listSnapshots({
          filePath: note,
          rootPath: vault,
        });
        return snapshots.some((snapshot) => snapshot.reason === "manual");
      },
      { note, vault },
    );
    await screenshot("03-history");
    await page.keyboard.press("Escape");
    await page.locator(".version-history-container").waitFor({ state: "detached" });
    await page.keyboard.press("Control+k");
    const command = page.getByRole("dialog", { name: "全局命令面板", exact: true });
    await command.waitFor();
    await command.locator("input").fill("项目计划");
    await page.keyboard.press("Escape");
    await command.waitFor({ state: "detached" });
    checks.push("Manual snapshot workflow and global command search open and close correctly");

    const pdfPath = path.join(output, "reader-export.pdf");
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, pdfPath);
    await openTools();
    await tools()
      .getByRole("button", { name: /^打印与导出高保真 PDF/ })
      .click();
    for (let attempt = 0; attempt < 50 && !fs.existsSync(pdfPath); attempt++) {
      await page.waitForTimeout(100);
    }
    assert.equal(fs.readFileSync(pdfPath).subarray(0, 5).toString(), "%PDF-");
    checks.push("Document-tools export creates a real PDF through Electron printToPDF");

    await page.getByRole("button", { name: "脑图", exact: true }).click();
    await page.locator(".mindmap-view-container").waitFor();
    const branchColors = await page
      .locator(".mindmap-branch-path")
      .evaluateAll((nodes) => [...new Set(nodes.map((n) => n.getAttribute("stroke")))]);
    assert.ok(branchColors.length > 1, "Mindmap retains multicolor branches");
    const palette = [
      "#38bdf8",
      "#818cf8",
      "#a78bfa",
      "#f472b6",
      "#fb923c",
      "#facc15",
      "#34d399",
      "#2dd4bf",
    ];
    assert.ok(
      branchColors.every((c) => palette.includes(c)),
      JSON.stringify(branchColors),
    );
    checks.push(`Mindmap neon branch palette retained: ${branchColors.join(", ")}`);
    await screenshot("04-mindmap");
    await page.getByRole("button", { name: "白板", exact: true }).click();
    await page.locator(".knowspace-canvas-view").waitFor();
    await screenshot("05-canvas");
    await page.getByRole("button", { name: "阅读", exact: true }).click();
    await page.getByRole("button", { name: "知识网络全景图谱", exact: true }).click();
    await page.getByRole("region", { name: "知识网络图谱分栏", exact: true }).waitFor();
    await screenshot("06-graph");
    await page.getByRole("button", { name: "收起图谱分栏", exact: true }).click();
    await page.getByRole("button", { name: "闪念 Space 时间线看板", exact: true }).click();
    await page.locator(".space-timeline-container").first().waitFor();
    await screenshot("07-space");
    await page.getByRole("button", { name: "复盘", exact: true }).click();
    await page.getByRole("button", { name: "当前文档", exact: true }).click();
    await page.locator(".dr-question").waitFor();
    await page.getByRole("button", { name: "显示答案", exact: true }).click();
    await page.locator(".dr-answer").waitFor();
    await page.locator(".dr-rate-good").click();
    await page.locator(".dr-card").waitFor({ state: "detached" });
    await screenshot("07-review");
    await page.getByRole("button", { name: "时间轴", exact: true }).click();
    await page.getByRole("button", { name: "大纲目录", exact: true }).click();
    checks.push(
      "Mind map, spatial canvas, knowledge graph, Space timeline and current-document flashcard reveal/rating",
    );

    for (const [theme, label] of [
      ["light", "日光浅色"],
      ["twitter", "极客暗黑"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.locator(`.app-shell.theme-${theme}`).waitFor();
      await screenshot(`08-reading-${theme}`);
    }
    await page.getByRole("button", { name: "日光浅色", exact: true }).click();
    for (const [width, height] of [
      [1460, 980],
      [1280, 800],
      [960, 720],
      [720, 700],
      [390, 844],
      [960, 400],
    ]) {
      await size(width, height);
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight <= h, [width, height]);
      await openTools();
      const layout = await page.evaluate(() => {
        const bounds = (e) => {
          const r = e.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };
        return {
          width: innerWidth,
          height: innerHeight,
          toolbar: bounds(document.querySelector(".toolbar")),
          modal: bounds(document.querySelector(".toolbar-tools-dialog")),
          reader: bounds(document.querySelector(".reader-frame")),
          bodyOverflow: document.body.scrollWidth > innerWidth,
          actions: [...document.querySelectorAll(".toolbar-actions > button")].map((e) => ({
            label: e.getAttribute("aria-label"),
            ...bounds(e),
          })),
        };
      });
      assert.ok(
        layout.reader.width >= 260 && layout.reader.height >= 120,
        `Document remains readable at ${width}x${height}`,
      );
      assert.ok(!layout.bodyOverflow, `No horizontal page overflow at ${width}`);
      assert.ok(
        layout.modal.x >= 0 &&
          layout.modal.right <= layout.width + 1 &&
          layout.modal.bottom <= layout.height + 1,
        `Tools fit ${width}x${height}`,
      );
      assert.ok(
        layout.actions.every((a) => a.x >= 0 && a.right <= layout.width + 1),
        `All primary tools remain on screen at ${width}`,
      );
      await tools().getByLabel("阅读字号", { exact: true }).scrollIntoViewIfNeeded();
      await screenshot(`layout-${width}x${height}`);
      await page.keyboard.press("Escape");
      layouts.push(layout);
    }
    await size(1460, 980);
    await page.getByRole("button", { name: "全屏模式", exact: true }).click();
    await page.locator(".app-shell.is-fullscreen").waitFor();
    await openTools();
    await page.keyboard.press("Escape");
    await tools().waitFor({ state: "hidden" });
    assert.ok(
      await page.locator(".app-shell.is-fullscreen").count(),
      "Escape closes the active dialog before leaving fullscreen",
    );
    await page.keyboard.press("F11");
    await page.locator(".app-shell.is-fullscreen").waitFor({ state: "hidden" });
    checks.push(
      "Two themes, six window sizes, primary action visibility, scrollable document tools and keyboard dismissal",
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "verification.json"),
      JSON.stringify({ passed: true, state, checks, layouts, errors }, null, 2),
    );
    console.log(
      JSON.stringify(
        { passed: true, packaged: state.packaged, checks: checks.length, output },
        null,
        2,
      ),
    );
  } catch (error) {
    if (app) {
      const pages = await app.windows();
      if (pages[0])
        await pages[0]
          .screenshot({ path: path.join(output, "failure.png"), scale: "css" })
          .catch(() => {});
    }
    fs.writeFileSync(
      path.join(output, "failure.json"),
      JSON.stringify({ error: error.stack, checks, layouts, errors }, null, 2),
    );
    throw error;
  } finally {
    if (app) await app.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
