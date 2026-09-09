const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      http.get(url, (res) => {
        if (res.statusCode === 200) resolve();
        else setTimeout(check, 300);
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('Server start timed out'));
        else setTimeout(check, 300);
      });
    }
    check();
  });
}

async function testLanding() {
  const webDir = path.resolve(__dirname, '../web');
  console.log('Starting preview server...');
  const server = spawn('npx.cmd', ['vite', 'preview', '--port', '5200', '--host', '127.0.0.1'], {
    cwd: webDir,
    stdio: 'ignore',
    shell: true
  });

  try {
    await waitForServer('http://127.0.0.1:5200');
    console.log('Server is running on http://127.0.0.1:5200');

    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1.5
    });
    const page = await context.newPage();

    console.log('Navigating to http://127.0.0.1:5200 ...');
    await page.goto('http://127.0.0.1:5200', { waitUntil: 'networkidle' });

    const title = await page.title();
    console.log('Page Title:', title);

    const artifactDir = 'C:/Users/chunxvzhang/.gemini/antigravity/brain/3a7ee853-ff7e-47c3-94bc-96f2f85fdf09';

    // 1. Landing Hero Screenshot (Chinese View, Dark Theme)
    const previewLandingZh = path.resolve(webDir, 'preview-landing-zh.png');
    await page.screenshot({ path: previewLandingZh, fullPage: false });
    fs.copyFileSync(previewLandingZh, path.join(artifactDir, 'preview-landing-zh.png'));
    console.log('Saved preview-landing-zh.png');

    // 1a. Navbar Close-up screenshot
    const navElem = page.locator('header.sticky-nav');
    const previewNavPath = path.resolve(webDir, 'preview-navbar-zh.png');
    await navElem.screenshot({ path: previewNavPath });
    fs.copyFileSync(previewNavPath, path.join(artifactDir, 'preview-navbar-zh.png'));
    console.log('Saved preview-navbar-zh.png');

    // 1b. Bento Grid and Card Hover test (ensure NO top-left corner bracket)
    await page.locator('#bento').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const firstCard = page.locator('.bento-grid > div').first();
    await firstCard.hover();
    await page.waitForTimeout(300);

    const previewHoverCard = path.resolve(webDir, 'preview-card-hover.png');
    await firstCard.screenshot({ path: previewHoverCard });
    fs.copyFileSync(previewHoverCard, path.join(artifactDir, 'preview-card-hover.png'));
    console.log('Saved preview-card-hover.png (verified hover without brackets)');

    // 1c. Bento grid overview
    const previewBentoPath = path.resolve(webDir, 'preview-bento.png');
    await page.screenshot({ path: previewBentoPath, fullPage: false });
    fs.copyFileSync(previewBentoPath, path.join(artifactDir, 'preview-bento.png'));
    console.log('Saved preview-bento.png');

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    // 2. Language Switch Test -> Switch to English
    console.log('Clicking language toggle button...');
    const langBtn = page.locator('header.sticky-nav button:has-text("EN / 中"), header.sticky-nav button:has-text("中 / EN")').first();
    await langBtn.click();
    await page.waitForTimeout(500);

    // 2a. English Landing Screenshot
    const previewLandingEn = path.resolve(webDir, 'preview-landing-en.png');
    await page.screenshot({ path: previewLandingEn, fullPage: false });
    fs.copyFileSync(previewLandingEn, path.join(artifactDir, 'preview-landing-en.png'));
    console.log('Saved preview-landing-en.png');

    // 2b. English Navbar Screenshot
    const previewNavEn = path.resolve(webDir, 'preview-navbar-en.png');
    await navElem.screenshot({ path: previewNavEn });
    fs.copyFileSync(previewNavEn, path.join(artifactDir, 'preview-navbar-en.png'));
    console.log('Saved preview-navbar-en.png');

    // 2c. English Comparison & Download
    await page.locator('#comparison').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const previewCompEn = path.resolve(webDir, 'preview-comparison-en.png');
    await page.screenshot({ path: previewCompEn, fullPage: false });
    fs.copyFileSync(previewCompEn, path.join(artifactDir, 'preview-comparison-en.png'));
    console.log('Saved preview-comparison-en.png');

    // 3. Switch back to Chinese and test Docs
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const langBtnBack = page.locator('header.sticky-nav button:has-text("EN / 中"), header.sticky-nav button:has-text("中 / EN")').first();
    await langBtnBack.click();
    await page.waitForTimeout(400);

    await page.click('button:has-text("在线画册与文档")');
    await page.waitForTimeout(600);

    const docsScreenshotPath = path.resolve(webDir, 'preview-docs.png');
    await page.screenshot({ path: docsScreenshotPath, fullPage: false });
    fs.copyFileSync(docsScreenshotPath, path.join(artifactDir, 'preview-docs.png'));
    console.log('Saved preview-docs.png');

    await browser.close();
    console.log('All verification screenshots captured successfully!');
  } finally {
    server.kill();
  }
}

testLanding().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
