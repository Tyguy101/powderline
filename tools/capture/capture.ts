import { chromium } from '@playwright/test';
import path from 'node:path';

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined,
  args: ['--enable-unsafe-webgpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5173/?seed=424242&debug=1');
await page.waitForFunction(() => document.body.classList.contains('ready'));
await page.screenshot({ path: path.resolve('tools/reports/capture.png') });
await browser.close();
