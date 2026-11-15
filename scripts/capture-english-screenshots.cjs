const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { documents, rootPath, installFixture } = require("./english-screenshot-fixture.cjs");

const base = process.env.KNOWSPACE_SCREENSHOT_URL || "http://127.0.0.1:5210/";
const output = path.resolve(__dirname, "../web/public/images/en");
const reportPath = path.resolve(__dirname, "../output/english-screenshots.json");
const errors = [];
const captured = [];
fs.mkdirSync(output, { recursive: true });

async function save(page, name, required) {
  await page.locator(".status-bar, .flash-capsule-container").first().waitFor({ state: "visible" });
  if (required) await page.locator(required).first().waitFor({ state: "visible" });
  const text = await page.locator("body").innerText();
  assert.ok(
    !/\p{Script=Han}/u.test(text),
    `Non-English UI in ${name}: ${text.match(/.{0,25}\p{Script=Han}.{0,25}/u)?.[0]}`,
  );
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: "disabled" });
  captured.push(name);
  console.log(`Captured ${name}`);
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge" });
  async function scene(initialName = Object.keys(documents)[0], query = "") {
    const context = await browser.newContext({
      viewport: query ? { width: 1000, height: 620 } : { width: 1680, height: 1050 },
      locale: "en-US",
      colorScheme: "light",
    });
    await context.addInitScript(installFixture, { documents, rootPath, initialName });
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Renderer error:", e.message);
    });
    await page.goto(base + query);
    await page
      .locator(query ? ".flash-capsule-container" : ".status-bar")
      .waitFor({ state: "visible" });
    if (!query) await page.getByRole("button", { name: "Light", exact: true }).click();
    await page.waitForTimeout(600);
    return { context, page };
  }
  try {
    {
      const { context, page } = await scene();
      await save(page, "01-overview-workbench", ".reader-pane");
      for (const [label, name] of [
        ["Light", "02-theme-light"],
        ["E-ink", "03-theme-eink"],
        ["Dark", "04-theme-dark"],
      ]) {
        await page.getByRole("button", { name: label, exact: true }).click();
        await save(page, name);
      }
      await page.getByRole("button", { name: "Light", exact: true }).click();
      for (const [mode, name] of [
        ["Split mode (edit & preview)", "05-mode-split"],
        ["Source mode", "06-mode-source"],
        ["Read mode", "07-mode-read"],
      ]) {
        await page.locator(".view-mode-control").getByTitle(mode, { exact: true }).click();
        await save(page, name);
      }
      await page.locator(".reader-pane").evaluate((el) => {
        el.scrollTop = 850;
      });
      await page.locator(".code-copy-btn").first().waitFor();
      await save(page, "08-rich-markdown");
      await page.locator(".code-copy-btn").first().click();
      await save(page, "20-code-copied");
      await page.locator(".mermaid svg").first().click();
      await save(page, "14-media-lightbox", ".media-lightbox-overlay");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Add bookmark", exact: true }).click();
      await page.getByRole("tab", { name: "Bookmarks", exact: true }).click();
      await save(page, "13-bookmarks", ".bookmark-panel");
      await page.getByRole("button", { name: "Outline", exact: true }).first().click();
      await save(page, "11-navigation-toc");
      await page.getByRole("button", { name: "Search", exact: true }).first().click();
      await page.locator(".search-box input").fill("local");
      await save(page, "12-fulltext-search");
      await page.getByRole("tab", { name: /^Entire vault/ }).click();
      await save(page, "35-hybrid-vault-search");
      await page.getByRole("button", { name: "Backlinks & references", exact: true }).click();
      await save(page, "22-backlinks-panel");
      await page.getByRole("button", { name: "Knowledge graph", exact: true }).first().click();
      await save(page, "21-global-graph", ".graph-view-pane");
      await page.getByRole("button", { name: "Filters", exact: true }).click();
      await save(page, "31-graph-depth-clustering");
      await page.getByTitle("Close graph pane (Ctrl+G)", { exact: true }).click();
      await page.getByRole("button", { name: "About", exact: true }).click();
      await save(page, "16-about-dialog", ".about-dialog-card");
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Version history & comparison (Ctrl+Shift+H)", exact: true })
        .click();
      await save(page, "34-version-history", ".version-history-container");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Command palette", exact: true }).click();
      await page.locator(".command-palette-input").fill("canvas");
      await save(page, "27-command-palette", ".command-palette-container");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Outline", exact: true }).first().click();
      await page.locator(".reader-pane").evaluate((el) => {
        el.scrollTop = 1450;
      });
      await save(page, "26-block-reference", ".wikilink-embed-card");
      await page.getByRole("button", { name: "Toggle full screen", exact: true }).first().click();
      await save(page, "19-mode-zen");
      await page.getByRole("button", { name: "Toggle full screen", exact: true }).first().click();
      await context.close();
    }
    {
      const { context, page } = await scene();
      await page.locator(".tree-row").filter({ hasText: "02-Project plan.md" }).click();
      await page.locator(".tab-item").first().click();
      await page.locator(".tab-item").last().click({ button: "right" });
      await save(page, "09-multi-tabs", ".tab-context-menu");
      await page.getByRole("button", { name: "📖 Compare in right pane", exact: true }).click();
      await save(page, "10-dual-split-compare", ".dual-document-workspace");
      await context.close();
    }
    {
      const { context, page } = await scene("02-Project plan.md");
      await page
        .locator(".view-mode-control")
        .getByTitle("Mind map mode (Ctrl+M)", { exact: true })
        .click();
      await save(page, "24-mindmap-view", ".mindmap-node-interactive");
      await page.locator(".mindmap-node-interactive").first().click({ button: "right" });
      await save(page, "25-mindmap-customization");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Export ▾", exact: true }).click();
      await save(page, "30-mindmap-export-modal");
      await context.close();
    }
    {
      const { context, page } = await scene("04-Connected workflow.canvas");
      await page.getByRole("button", { name: "Fit to view", exact: true }).click();
      await save(page, "32-infinite-canvas", ".knowspace-canvas-view");
      await save(page, "40-canvas-media-cards");
      await page.screenshot({
        path: path.resolve(output, "../../social-card.jpg"),
        type: "jpeg",
        quality: 86,
      });
      await page
        .locator(".knowspace-canvas-view")
        .click({ button: "right", position: { x: 12, y: 80 } });
      await save(page, "33-canvas-card-creation");
      await page.keyboard.press("Escape");
      await page.locator(".knowspace-canvas-view").click({ position: { x: 200, y: 600 } });
      await page.keyboard.press("Control+a");
      await page.getByRole("button", { name: "Align ▾", exact: true }).click();
      await save(page, "42-canvas-multi-select-toolbar");
      await page.getByText("Circular layout", { exact: true }).click();
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Fit to view", exact: true }).click();
      await save(page, "41-canvas-ring-layout");
      await context.close();
    }
    {
      const { context, page } = await scene("03-Review cards.md");
      await page
        .locator(".view-mode-control")
        .getByTitle("Split mode (edit & preview)", { exact: true })
        .click();
      await save(page, "36-fsrs-card-syntax");
      await page.getByRole("button", { name: "Space timeline", exact: true }).click();
      await save(page, "23-timeline-panel");
      await page.locator(".space-tab-btn").filter({ hasText: "Review" }).click();
      await page.getByRole("button", { name: "Current document", exact: true }).click();
      await save(page, "37-fsrs-review-question", ".dr-reveal-btn");
      await page.locator(".dr-reveal-btn").click();
      await save(page, "38-fsrs-review-answer");
      await context.close();
    }
    {
      const { context, page } = await scene(Object.keys(documents)[0], "?mode=flash");
      await page
        .locator("textarea")
        .first()
        .fill(
          "An idea worth keeping: connect today's project outline to a visual canvas. #project\n- [ ] Review the proposal",
        );
      await save(page, "15-flash-capsule");
      await page.getByRole("button", { name: "Shortcut & storage settings", exact: true }).click();
      await save(page, "15-flash-capsule-settings");
      await context.close();
    }
    {
      const { context, page } = await scene();
      await page
        .locator(".view-mode-control")
        .getByTitle("Split mode (edit & preview)", { exact: true })
        .click();
      await page.locator(".cm-content").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("\n/");
      await save(page, "28-slash-commands", ".cm-tooltip-autocomplete");
      await page.keyboard.press("Escape");
      await page.locator(".cm-content").click({ button: "right" });
      await save(page, "29-editor-context-menu");
      await page.keyboard.press("Escape");
      await page.locator(".tree-row").filter({ hasText: "02-Project plan.md" }).click();
      await save(page, "17-dialog-unsaved", "#unsaved-title");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.evaluate(() => {
        window.__conflict = true;
      });
      await page.getByRole("button", { name: "Save current file", exact: true }).click();
      await save(page, "18-dialog-conflict", ".modal-conflict");
      await context.close();
    }
    assert.deepEqual(errors, [], `Renderer errors: ${errors.join(" | ")}`);
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          captured,
          count: captured.length,
          errors,
          fixture: "Synthetic English demo vault; rendered by production application",
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
