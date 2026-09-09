const { chromium } = require('playwright');
const path = require('path');

async function testLanding() {
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

  // Take fullpage screenshot of landing page
  const screenshotPath = path.resolve(__dirname, '../web/preview-landing.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('Saved preview to', screenshotPath);

  // Test theme switch to Warm Light
  console.log('Testing theme switch to Warm Light...');
  await page.click('button:has-text("日光浅色")');
  await page.waitForTimeout(400);

  // Test theme switch to E-ink
  console.log('Testing theme switch to E-ink...');
  await page.click('button:has-text("仿电子墨水屏")');
  await page.waitForTimeout(400);

  // Test theme switch back to Dark
  console.log('Testing theme switch to Geek Dark...');
  await page.click('button:has-text("极客暗黑")');
  await page.waitForTimeout(400);

  // Test navigating to Docs
  console.log('Testing navigation to Online Docs...');
  await page.click('button:has-text("在线画册与文档")');
  await page.waitForTimeout(500);

  const docsScreenshotPath = path.resolve(__dirname, '../web/preview-docs.png');
  await page.screenshot({ path: docsScreenshotPath, fullPage: false });
  console.log('Saved docs preview to', docsScreenshotPath);

  await browser.close();
  console.log('All tests passed successfully!');
}

testLanding().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
