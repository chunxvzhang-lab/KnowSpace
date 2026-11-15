const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { documents } = require("./english-screenshot-fixture.cjs");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "output", "english-desktop-qa");
const profile = path.join(output, `profile-${Date.now()}`);
const vault = path.join(output, "Demo vault");

async function main() {
  fs.mkdirSync(vault, { recursive: true });
  fs.mkdirSync(path.join(vault, "assets"), { recursive: true });
  fs.copyFileSync(path.join(root, "icon.png"), path.join(vault, "assets", "knowspace.png"));
  for (const [name, content] of Object.entries(documents))
    fs.writeFileSync(path.join(vault, name), content);
  const chineseText = "# 中文笔记\n\n用户内容应保持原样。\n";
  const chineseFile = path.join(vault, "Chinese content.md");
  fs.writeFileSync(chineseFile, chineseText);
  const app = await electron.launch({
    executablePath: path.join(root, "release", "english", "win-unpacked", "KnowSpace.exe"),
    args: [`--user-data-dir=${profile}`],
    env: { ...process.env, BOOKMD_DEV_SERVER_URL: "" },
    timeout: 30000,
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(10000);
    await page.emulateMedia({ colorScheme: "light" });
    page.on("pageerror", (error) => errors.push(error.message));
    const state = await app.evaluate(({ app, Menu }) => ({
      profile: app.getPath("userData"),
      version: app.getVersion(),
      locale: app.getLocale(),
      menu: Menu.getApplicationMenu()?.items.map((item) => ({
        label: item.label,
        submenu: item.submenu?.items.map((child) => child.label),
      })),
    }));
    assert.equal(path.resolve(state.profile), profile);
    assert.equal(state.version, "2.7.9");
    assert.equal(state.locale, "en-US");
    assert.ok(!/\p{Script=Han}/u.test(JSON.stringify(state.menu)));
    await page
      .getByRole("heading", { name: "Choose or create a Markdown document", exact: true })
      .waitFor();
    assert.ok(!/\p{Script=Han}/u.test(await page.locator("body").innerText()));
    await page.screenshot({ path: path.join(output, "welcome-en.png") });
    await app.evaluate(
      ({ BrowserWindow }, file) => {
        BrowserWindow.getAllWindows()
          .find((w) => !w.webContents.getURL().includes("mode=flash"))
          .webContents.send("bookmd:open-file-path", file);
      },
      path.join(vault, "01-Knowledge workspace.md"),
    );
    await page.locator(".reader-pane").waitFor();
    await page
      .getByText("Building a connected knowledge workspace", { exact: true })
      .first()
      .waitFor();
    await page.screenshot({ path: path.join(output, "workspace-en.png") });
    await page
      .locator(".view-mode-control")
      .getByTitle("Split mode (edit & preview)", { exact: true })
      .click();
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\nEnglish edition save verification.\n");
    await page.getByRole("button", { name: "Save current file", exact: true }).click();
    await page.locator(".status-badge.saved").waitFor();
    assert.ok(
      fs
        .readFileSync(path.join(vault, "01-Knowledge workspace.md"), "utf8")
        .includes("English edition save verification."),
    );
    await app.evaluate(({ BrowserWindow }, file) => {
      BrowserWindow.getAllWindows()
        .find((w) => !w.webContents.getURL().includes("mode=flash"))
        .webContents.send("bookmd:open-file-path", file);
    }, chineseFile);
    await page.getByText("用户内容应保持原样。", { exact: true }).first().waitFor();
    assert.equal(fs.readFileSync(chineseFile, "utf8"), chineseText);
    const target = await page.evaluate(() => window.knowSpaceDesktop.capture.getFlashTargetPath());
    const relativeTarget = path.relative(output, target.spaceDir);
    assert.ok(
      !path.isAbsolute(relativeTarget) &&
        relativeTarget !== ".." &&
        !relativeTarget.startsWith(`..${path.sep}`),
    );
    const archived = await page.evaluate(() =>
      window.knowSpaceDesktop.capture.saveFlashNote({
        content: "English timeline verification. #quality",
      }),
    );
    assert.equal(archived.success, true);
    await page.getByRole("button", { name: "Space timeline", exact: true }).click();
    await page.locator(".space-timeline-container").first().waitFor();
    await page
      .getByText("English timeline verification. #quality", { exact: false })
      .first()
      .waitFor();
    await page.screenshot({ path: path.join(output, "timeline-en.png") });
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await page.getByRole("button", { name: "Current vault", exact: true }).click();
    await page.locator(".dr-reveal-btn").waitFor();
    await page.locator(".dr-reveal-btn").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "system");
    assert.equal(
      await page.locator(".dr-question").evaluate((el) => getComputedStyle(el).color),
      "rgb(24, 24, 27)",
    );
    await page.screenshot({ path: path.join(output, "review-en.png") });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "verification.json"),
      JSON.stringify(
        {
          ...state,
          checks: [
            "English fresh-profile startup",
            "English native menus",
            "Isolated profile",
            "Packaged Markdown read and save",
            "Chinese user content preserved",
            "Flash Note archive and populated timeline",
            "FSRS review and answer reveal",
            "Readable default system-light review",
          ],
          errors,
        },
        null,
        2,
      ),
    );
    console.log("Packaged English desktop: 8 checks passed; no renderer errors.");
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
