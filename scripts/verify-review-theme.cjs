const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { documents, rootPath, installFixture } = require("./english-screenshot-fixture.cjs");

async function main() {
  const browser = await chromium.launch({ channel: "msedge" });
  const output = path.resolve(__dirname, "../output/playwright/review-theme");
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  try {
    const context = await browser.newContext({ colorScheme: "light" });
    await context.addInitScript(installFixture, {
      documents,
      rootPath,
      initialName: "03-Review cards.md",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5210/");
    await page.getByRole("button", { name: "Space timeline", exact: true }).click();
    await page.locator(".space-tab-btn").filter({ hasText: "Review" }).click();
    await page.getByRole("button", { name: "Current document", exact: true }).click();
    await page.locator(".dr-reveal-btn").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "system");
    // Check the default theme and live OS preference changes without changing app preferences.
    for (const scheme of ["light", "dark", "light"]) {
      await page.emulateMedia({ colorScheme: scheme });
      const expected = scheme === "light" ? "rgb(24, 24, 27)" : "rgb(231, 233, 234)";
      await page.waitForFunction(
        (color) =>
          [...document.querySelectorAll(".dr-question, .dr-rate-btn")].every(
            (element) => getComputedStyle(element).color === color,
          ),
        expected,
      );
      const question = await page
        .locator(".dr-question")
        .evaluate((el) => getComputedStyle(el).color);
      const rating = await page
        .locator(".dr-rate-btn")
        .first()
        .evaluate((el) => getComputedStyle(el).color);
      await page.screenshot({
        path: path.join(output, `system-${scheme}.png`),
        animations: "disabled",
      });
      assert.equal(question, expected, `Question foreground in system-${scheme}`);
      assert.equal(rating, expected, `Rating foreground in system-${scheme}`);
      results.push({ scheme, question, rating });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "verification.json"),
      JSON.stringify({ results, errors }, null, 2),
    );
    await context.close();
    console.log("System review theme: light, dark and live preference changes passed.");
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
