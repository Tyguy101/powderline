import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('tools/reports/crashes');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan'],
});

async function setRange(page: Page, field: string, value: number): Promise<void> {
  await page.locator(`[data-field="${field}"]`).evaluate(
    (element, nextValue) => {
      const input = element as HTMLInputElement;
      input.value = String(nextValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    value,
  );
}

const scenarios = [
  { name: 'tree-slam', obstacle: 'tree', speed: 27, angle: 0, offset: 0, delay: 220 },
  { name: 'side-spin', obstacle: 'tree', speed: 24, angle: 58, offset: 82, delay: 450 },
  { name: 'rock-tumble', obstacle: 'rock', speed: 34, angle: -12, offset: -18, delay: 620 },
] as const;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/?dev=1&crashLab=1&seed=424242', {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => document.body.classList.contains('ready'));
  for (const scenario of scenarios) {
    await page.locator('[data-field="obstacleType"]').selectOption(scenario.obstacle);
    await setRange(page, 'speed', scenario.speed);
    await setRange(page, 'angle', scenario.angle);
    await setRange(page, 'contactOffset', scenario.offset);
    await page.getByRole('button', { name: 'Replay same' }).click();
    await page.waitForTimeout(scenario.delay);
    await page.screenshot({ path: path.join(output, `${scenario.name}.png`) });
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
