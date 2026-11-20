import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.POWDERLINE_QA_URL ?? 'http://127.0.0.1:5173';
const tag = process.argv.includes('--before') ? 'before' : 'after';
const output = 'tools/reports/trail-pass';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
const shots = [
  { name: 'fork-approach', width: 1440, height: 900, quality: 'medium', section: 'pine', scenario: 'fork', mark: 126 },
  { name: 'fork-mouths', width: 1440, height: 900, quality: 'medium', section: 'pine', scenario: 'fork', mark: 34 },
  { name: 'ramp-medium', width: 1440, height: 900, quality: 'medium', section: 'air', scenario: 'encounter', mark: 114 },
  { name: 'ramp-potato', width: 1280, height: 720, quality: 'potato', section: 'air', scenario: 'encounter', mark: 114 },
];
const evidence = [];
try {
  if (process.argv.includes('--mobile-chute')) {
    const recording = (await readFile(`${output}/chute-pinch.replay.txt`, 'utf8')).trim();
    const context = await browser.newContext({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 2,
      hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(`${base}/?quality=low#replay=${recording}`);
    await page.waitForFunction(() => {
      const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
      return m?.section === 'chute' && Number(m.sectionDistance) >= 175;
    });
    const metrics = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__'));
    assert.equal(metrics?.crashed, 'false');
    await page.screenshot({ path: `${output}/chute-narrow-landscape.png` });
    await writeFile(`${output}/chute-narrow-landscape.json`, JSON.stringify(metrics, null, 2));
    await context.close();
  } else {
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height }, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${base}/?seed=1729&section=${shot.section}&scenario=${shot.scenario}&quality=${shot.quality}`);
      await page.waitForFunction(() => !!Reflect.get(globalThis, '__POWDERLINE_METRICS__'));
      await page.keyboard.down('KeyS');
      await page.waitForFunction(({ scenario, mark }) => {
        const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
        return scenario === 'fork' ? Number(m?.sectionEnd) - Number(m?.worldY) <= mark : Number(m?.sectionDistance) >= mark;
      }, shot);
      const metrics = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__'));
      assert.ok(metrics);
      assert.equal(metrics.crashed, 'false');
      assert.ok(Number(metrics.sectionDistance) > 0);
      await page.screenshot({ path: `${output}/${tag}-${shot.name}.png` });
      assert.deepEqual(errors, []);
      evidence.push({ ...shot, metrics });
      await page.close();
    }
    await writeFile(`${output}/${tag}-matched.json`, JSON.stringify(evidence, null, 2));
  }
} finally {
  await browser.close();
}
