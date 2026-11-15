const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const url = process.env.KNOWSPACE_WEB_URL || "http://127.0.0.1:5201/";
const output = path.resolve(__dirname, "../output/playwright/english-web");
const checks = [];
const errors = [];
const failures = [];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  const passed = (label) => {
    checks.push(label);
    console.log("PASS", label);
  };
  function observe(page) {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().startsWith(url) && response.status() >= 400)
        failures.push({ url: response.url(), status: response.status() });
    });
  }
  async function englishImages(page, selector) {
    for (const image of await page.locator(selector).all()) {
      assert.match(await image.getAttribute("src"), /\/images\/en\//);
      await image.scrollIntoViewIfNeeded();
      await image.evaluate((img) => {
        img.loading = "eager";
      });
      await image.evaluate((img) =>
        Promise.race([
          img.decode(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Image decode timed out: ${img.src}`)), 10000),
          ),
        ]),
      );
    }
  }
  async function withinViewport(locator) {
    const rect = await locator.boundingBox();
    assert.ok(
      rect && rect.x >= -1 && rect.x + rect.width <= locator.page().viewportSize().width + 1,
    );
  }
  async function footerQr(page) {
    const card = page.locator(".footer-contact-qr");
    assert.equal(
      await page.locator('.footer-contact-pill[href^="https://t.me/"]').getAttribute("href"),
      "https://t.me/moyuing_404",
    );
    const image = card.locator("img");
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const img = document.querySelector(".footer-contact-qr img");
      return img?.complete && img.naturalWidth === 480 && img.naturalHeight === 612;
    });
    await image.evaluate((img) => img.decode());
    await withinViewport(card);
  }
  async function downloads(page, lang) {
    const expected =
      lang === "en"
        ? [
            [
              "KnowSpace-2.7.9-en.msi",
              140537856,
              "19c2372453a5eeb61be3754d1b4e642be93bd8ffb0569a15766b308dabc34678",
            ],
            [
              "KnowSpace-Setup-2.7.9-en.exe",
              128849275,
              "754bf16cf486179b88a41c1e8fcc80417bd09b9a8f7fe65df3159e65a5ea097a",
            ],
          ]
        : [
            [
              "KnowSpace-2.7.9.msi",
              140431360,
              "4c7b27875bcb25cfe1579db225facbb416e0db6ad2a72c99b77a3359e62dd1c8",
            ],
            [
              "KnowSpace-Setup-2.7.9.exe",
              128694078,
              "875ea77e9b2a0fc540c3acf14d40523c2563e447c1fff5434240b0819680c089",
            ],
          ];
    const section = page.locator("#download");
    const rows = section.locator(".sha-asset-row");
    assert.equal(await rows.count(), expected.length);
    assert.equal(await page.locator('a[href$=".zip"]').count(), 0);
    assert.doesNotMatch(await section.innerText(), /zip|portable|便携|免安装/i);
    for (let index = 0; index < expected.length; index++) {
      const [name, bytes, sha256] = expected[index];
      const href = `https://github.com/chunxvzhang-lab/KnowSpace/releases/download/v2.7.9/${name}`;
      const size = `${(bytes / 1048576).toFixed(1)} MiB`;
      const button = section.locator(
        index === 0 ? "a.btn-primary" : 'a[href$=".exe"]:not(.sha-asset-name)',
      );
      assert.equal(await button.getAttribute("href"), href);
      assert.ok((await button.innerText()).includes(size));
      const row = rows.nth(index);
      assert.equal(await row.locator(".sha-asset-name").innerText(), name);
      assert.equal(await row.locator(".sha-asset-name").getAttribute("href"), href);
      assert.equal(await row.locator(".sha-asset-size").innerText(), size);
      assert.equal(await row.locator(".sha-hash").innerText(), sha256);
      await row.locator(".copy-btn").click();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), sha256);
    }
    const command = `Get-FileHash ".\\${expected[0][0]}" -Algorithm SHA256`;
    assert.equal(await section.locator(".sha-cmd-code").innerText(), command);
    await section.locator(".sha-cmd .copy-btn").click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), command);
    if (lang === "en") {
      assert.match(await section.innerText(), /Windows Installers \(English\)/);
    }
  }
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      reducedMotion: "reduce",
      locale: "zh-CN",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    observe(page);
    await page.goto(url, { waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    await page
      .getByRole("heading", { name: "Record · Read · Connect · Know", exact: true })
      .waitFor();
    await englishImages(page, 'main img[src*="/images/"]');
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: path.join(output, "landing-en.png"), animations: "disabled" });
    passed(
      "Fresh visit defaults to English even with Chinese browser locale; landing images decode",
    );
    await footerQr(page);
    await page.locator(".footer-contact").screenshot({
      path: path.join(output, "footer-contact-en.png"),
      animations: "disabled",
    });
    passed("English footer QR card loads, decodes, and links to the intended Telegram chat");
    await downloads(page, "en");
    await page.locator("#download").screenshot({
      path: path.join(output, "downloads-en.png"),
      animations: "disabled",
      style: ".sticky-nav { visibility: hidden; }",
    });
    passed("English downloads use published installers, matching sizes, hashes and copy commands");
    await page.getByTitle("切换为简体中文 (Switch to Chinese)", { exact: true }).click();
    await downloads(page, "zh");
    await page.locator("#download").screenshot({
      path: path.join(output, "downloads-zh.png"),
      animations: "disabled",
      style: ".sticky-nav { visibility: hidden; }",
    });
    await page.getByTitle("Switch to English (切换为英文)", { exact: true }).click();
    await downloads(page, "en");
    passed("Language switching immediately updates download buttons, hashes and copied commands");

    await page.getByRole("button", { name: "Docs & Manual", exact: true }).click();
    await page.locator(".docs-sidebar").waitFor();
    const modules = page.locator(".docs-sidebar button");
    assert.equal(await modules.count(), 35);
    for (let index = 0; index < 35; index++) {
      await modules.nth(index).click();
      assert.doesNotMatch(await page.locator(".docs-content").innerText(), /\p{Script=Han}/u);
      await englishImages(page, ".docs-content img");
    }
    passed("All 35 English guides render English text and load English screenshots");

    const search = page.getByRole("textbox", {
      name: "Search features, shortcuts or guides…",
      exact: true,
    });
    await search.fill("FSRS");
    await page
      .locator(".docs-sidebar")
      .getByRole("button", { name: /FSRS-5 flashcards/ })
      .click();
    assert.equal(await page.locator(".docs-content img").count(), 3);
    await page.screenshot({
      path: path.join(output, "docs-review-en.png"),
      animations: "disabled",
    });
    await page.locator("button.docs-image-zoom-button").first().click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await search.fill("no-such-feature-87325");
    await page.getByRole("status").filter({ hasText: "No matching modules" }).waitFor();
    await search.fill("");
    passed("Guide search, empty state and image lightbox work in English");

    await page.getByTitle("切换为简体中文 (Switch to Chinese)", { exact: true }).click();
    await page.getByRole("heading", { name: "FSRS-5 闪卡与每日复盘", exact: true }).waitFor();
    assert.ok(
      !(await page.locator(".docs-content img").first().getAttribute("src")).includes("/en/"),
    );
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("lang"), "zh");
    await downloads(page, "zh");
    await footerQr(page);
    passed("Chinese footer QR card loads and decodes");
    await page.getByTitle("Switch to English (切换为英文)", { exact: true }).click();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    await downloads(page, "en");
    passed("Explicit Chinese and English preferences persist; image language follows selection");

    for (const width of [390, 768, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await withinViewport(page.getByRole("button", { name: "Docs & Manual", exact: true }));
      await withinViewport(page.getByTitle("Warm Light", { exact: true }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      if (width === 390)
        await page.screenshot({
          path: path.join(output, "landing-mobile-en.png"),
          animations: "disabled",
        });
      await page.locator("#download").scrollIntoViewIfNeeded();
      await withinViewport(page.getByRole("link", { name: /^Download MSI/ }));
      await footerQr(page);
      await page.getByRole("button", { name: "Docs & Manual", exact: true }).click();
      await page.locator(".docs-sidebar").waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.getByRole("button", { name: "Back to Home", exact: true }).click();
      passed(
        `English layout at ${width}px: landing, navigation, downloads and guides have no page overflow`,
      );
    }
    await context.close();

    for (const storage of ["invalid", "unavailable"]) {
      const isolated = await browser.newContext();
      await isolated.addInitScript((mode) => {
        if (mode === "invalid") localStorage.setItem("knowspace_lang", "not-a-language");
        else
          Object.defineProperty(window, "localStorage", {
            get() {
              throw new DOMException("Storage blocked", "SecurityError");
            },
          });
      }, storage);
      const fallbackPage = await isolated.newPage();
      observe(fallbackPage);
      await fallbackPage.goto(url, { waitUntil: "networkidle" });
      assert.equal(await fallbackPage.locator("html").getAttribute("lang"), "en");
      await fallbackPage
        .getByRole("heading", { name: "Record · Read · Connect · Know", exact: true })
        .waitFor();
      await isolated.close();
      passed(`${storage} storage falls back to English without crashing`);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    passed("No browser runtime errors or missing local resources");
    fs.writeFileSync(
      path.join(output, "verification.json"),
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          url,
          checks,
          errors,
          resourceFailures: failures,
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
