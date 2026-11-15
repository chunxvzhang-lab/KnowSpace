const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output =
  process.env.KNOWSPACE_WELCOME_QA_OUTPUT ||
  path.join(root, "output/playwright/welcome", String(Date.now()));
fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, "Data");
const checks = [],
  layouts = [],
  errors = [];
let state;

async function main() {
  const executablePath =
    process.env.KNOWSPACE_PREVIEW_EXE || path.join(root, "release/KnowSpace-win-x64/KnowSpace.exe");
  const app = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${profile}`],
    env: { ...process.env, BOOKMD_DEV_SERVER_URL: "" },
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => errors.push(error.message));
    state = await app.evaluate(({ app, BrowserWindow, dialog }) => {
      const win = BrowserWindow.getAllWindows().find(
        (item) => !item.webContents.getURL().includes("mode=flash"),
      );
      win.setMinimumSize(0, 0);
      globalThis.welcomeDialogCalls = [];
      dialog.showSaveDialog = async (...args) => {
        globalThis.welcomeDialogCalls.push({ kind: "save", options: args.at(-1) });
        return { canceled: true };
      };
      dialog.showOpenDialog = async (...args) => {
        globalThis.welcomeDialogCalls.push({ kind: "open", options: args.at(-1) });
        return { canceled: true, filePaths: [] };
      };
      return {
        packaged: app.isPackaged,
        appPath: app.getAppPath(),
        version: app.getVersion(),
        profile: app.getPath("userData"),
      };
    });
    assert.equal(path.resolve(state.profile), profile);
    const home = page.locator(".empty-reader");
    await home.waitFor();
    for (const [theme, width, height] of [
      ["light", 1460, 980],
      ["twitter", 1460, 980],
      ["light", 800, 640],
      ["light", 440, 600],
      ["twitter", 440, 600],
      ["light", 800, 300],
    ]) {
      await app.evaluate(
        ({ BrowserWindow }, [width, height]) =>
          BrowserWindow.getAllWindows()
            .find((item) => !item.webContents.getURL().includes("mode=flash"))
            .setContentSize(width, height),
        [width, height],
      );
      await page
        .getByRole("button", {
          name: theme === "light" ? "日光浅色" : "极客暗黑",
          exact: true,
        })
        .click();
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme,
      );
      await page.screenshot({
        path: path.join(output, `${theme}-${width}x${height}.png`),
        scale: "css",
      });
      const layout = await home.evaluate((element) => {
        const grid = element.querySelector(".empty-actions-grid");
        const button = element.querySelector(".empty-action-card");
        const rect = (node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right };
        };
        return {
          display: getComputedStyle(element).display,
          gridDisplay: getComputedStyle(grid).display,
          buttonDisplay: getComputedStyle(button).display,
          buttonRadius: getComputedStyle(button).borderRadius,
          foreground: getComputedStyle(button).color,
          background: getComputedStyle(button).backgroundColor,
          home: rect(element),
          grid: rect(grid),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          buttons: [...grid.querySelectorAll("button")].map(rect),
        };
      });
      layouts.push({ theme, width, height, ...layout });
      fs.writeFileSync(path.join(output, "layouts.json"), JSON.stringify(layouts, null, 2));
      assert.equal(layout.display, "flex", "Welcome layout styles must load");
      assert.equal(layout.gridDisplay, "grid", "Actions must use a responsive grid");
      assert.equal(layout.buttonDisplay, "flex", "Actions must not use native unstyled buttons");
      assert.ok(parseFloat(layout.buttonRadius) >= 6);
      assert.equal(layout.buttons.length, 6);
      assert.ok(
        layout.scrollWidth <= layout.clientWidth + 1,
        "Welcome must not scroll horizontally",
      );
      for (const button of layout.buttons) {
        assert.ok(button.height >= 44, "Action hit target must remain usable");
        assert.ok(button.x >= layout.home.x && button.right <= layout.home.right + 1);
      }
      for (const button of await home.getByRole("button").all()) {
        await button.scrollIntoViewIfNeeded();
        await button.click({ trial: true });
      }
      checks.push(
        `${theme}/${width}x${height}: styled, no horizontal overflow, all six actions reachable`,
      );
    }
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("mode=flash"))
        .setContentSize(1460, 980),
    );
    const first = home.getByRole("button", { name: "新建 Markdown", exact: true });
    await first.focus();
    await page.keyboard.press("Tab");
    const focus = await home
      .getByRole("button", { name: "从模板新建", exact: true })
      .evaluate((node) => ({
        focused: document.activeElement === node,
        width: parseFloat(getComputedStyle(node).outlineWidth),
        style: getComputedStyle(node).outlineStyle,
      }));
    assert.ok(focus.focused && focus.width >= 2 && focus.style !== "none");
    await page.keyboard.press("Enter");
    const picker = page.getByRole("dialog", { name: "从模板新建", exact: true });
    await picker.waitFor();
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "hidden" });
    for (const name of ["新建 Markdown", "新建思维导图", "新建空间白板", "打开文档目录"]) {
      const before = await app.evaluate(() => globalThis.welcomeDialogCalls.length);
      await home.getByRole("button", { name, exact: true }).click();
      const deadline = Date.now() + 10000;
      while ((await app.evaluate(() => globalThis.welcomeDialogCalls.length)) === before) {
        assert.ok(Date.now() < deadline, `${name} must open its native dialog`);
        await page.waitForTimeout(50);
      }
      await home.waitFor();
    }
    checks.push(
      "Keyboard focus is visible; template picker works; all native create/directory actions cancel safely",
    );
    const note = path.join(output, "欢迎页打开验证.md");
    fs.writeFileSync(note, "# 欢迎页打开验证\n\n通过首页打开单文件。\n");
    const chooser = page.waitForEvent("filechooser");
    await home.getByRole("button", { name: "打开单文件", exact: true }).click();
    await (await chooser).setFiles(note);
    await page.locator(".reader-pane h1").filter({ hasText: "欢迎页打开验证" }).waitFor();
    assert.equal(fs.readFileSync(note, "utf8"), "# 欢迎页打开验证\n\n通过首页打开单文件。\n");
    checks.push("Open-file action renders the actual Markdown without changing it");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "verification.json"),
      JSON.stringify(
        {
          passed: true,
          output,
          state,
          layouts,
          checks,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ passed: true, output, state, checks }, null, 2));
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  fs.writeFileSync(
    path.join(output, "failure.json"),
    JSON.stringify(
      {
        passed: false,
        state,
        layouts,
        checks,
        errors,
        error: error.stack,
      },
      null,
      2,
    ),
  );
  console.error(error);
  process.exitCode = 1;
});
