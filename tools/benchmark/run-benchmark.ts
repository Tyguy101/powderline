import { chromium, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const quality = process.argv.find((arg) => arg.startsWith('--quality='))?.split('=')[1] ?? 'medium';
const viewportText = process.argv.find((arg) => arg.startsWith('--viewport='))?.split('=')[1] ?? '1440x900';
const [width = 1440, height = 900] = viewportText.split('x').map(Number);
const reportDirectory = path.resolve('tools/reports');
await mkdir(reportDirectory, { recursive: true });

const server = spawn(
  process.execPath,
  [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4173');
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Production preview did not start.');
}

async function scriptedInput(page: Page): Promise<void> {
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyS');
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : undefined,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:4173/?seed=424242&quality=${quality}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.classList.contains('ready'), undefined, { timeout: 20_000 });
  await scriptedInput(page);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(reportDirectory, `checkpoint-${quality}.png`) });
  const metrics = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__') as unknown);
  const canvasVisible = await page.locator('#game-canvas').isVisible();
  const result = {
    generatedAt: new Date().toISOString(),
    scenario: 'minimal-skiing-slice',
    quality,
    viewport: { width, height },
    canvasVisible,
    errors,
    metrics,
  };
  await writeFile(path.join(reportDirectory, 'benchmark.json'), JSON.stringify(result, null, 2));
  await browser.close();
  if (!canvasVisible || errors.length > 0) process.exitCode = 1;
  console.log(JSON.stringify(result, null, 2));
} finally {
  server.kill();
}
