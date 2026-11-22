import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';

const base = process.env.POWDERLINE_QA_URL ?? 'http://127.0.0.1:5173';
const expectedBuild = process.env.POWDERLINE_BUILD;
const tag = process.env.POWDERLINE_UI_TAG ?? 'local';
const folder = 'tools/reports/interface';
const quick = process.argv.includes('--smoke');
const baseline = process.argv.includes('--baseline');
const seed = 1729;
const results: unknown[] = [];
const browser = await chromium.launch({ channel: 'chrome' });
const errors: string[] = [];
type Metrics = Record<string, string | number>;
await mkdir(folder, { recursive: true });

async function metrics(page: Page): Promise<Metrics> {
  return page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__'));
}

async function go(page: Page, trail = 'pine', scenario = 'summit', suffix = '') {
  const response = await page.goto(`${base}/?seed=${seed}&section=${trail}&scenario=${scenario}${suffix}`);
  assert.equal(response?.status(), 200);
  await page.waitForFunction((expected) => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.section === expected, trail);
  const m = await metrics(page);
  assert.equal(m.seed, seed);
  if (expectedBuild) assert.equal(m.build, expectedBuild);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${folder}/${tag}-${name}.png` });
}

function watch(page: Page) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('sentry.io')) errors.push(m.text()); });
}

async function sight(page: Page, phone: boolean) {
  for (const speed of ['coast', 'tuck']) {
    await go(page, 'sun', 'encounter');
    if (speed === 'tuck') await page.keyboard.down('KeyS');
    await page.waitForFunction((min) => Number(Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.velocityY) >= min,
      speed === 'tuck' ? 33.5 : 21.8);
    const m = await metrics(page);
    const meters = Number(m.effectiveCameraScale) * (1 - Number(m.skierScreenYPercent) / 100);
    results.push({ name: `${phone ? 'phone' : 'desktop'}-${speed}`, build: m.build,
      meters, speed: m.velocityY, seconds: meters / Number(m.velocityY), canvas: m.canvasPixels });
    await page.keyboard.up('KeyS');
  }
}

async function verifyQuietStart(page: Page) {
  const unsolicited = page.locator('.run-cue:visible, .pause-controls:visible');
  assert.equal(await unsolicited.count(), 0);
  await page.waitForFunction(() => Number(Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.worldY) > 3);
  assert.equal(await unsolicited.count(), 0);
}

async function phone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 650 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  watch(page);
  const session = await context.newCDPSession(page);
  type Point = { id: number; x: number; y: number };
  const emit = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: Point[]) =>
    session.send('Input.dispatchTouchEvent', { type, touchPoints });
  async function point(selector: string, id: number): Promise<Point> {
    const box = await page.locator(selector).boundingBox();
    assert(box && box.width >= 44 && box.height >= 44, selector + ' target');
    return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  const cue = page.locator('.run-cue');
  await go(page);
  await verifyQuietStart(page);
  await screenshot(page, 'phone-first-descent');
  const steer = { id: 1, x: 285, y: 420 };
  const brake = await point('.touch-action--brake', 2);
  const tuck = await point('.touch-action--tuck', 2);
  assert(brake.x === tuck.x && tuck.x < 85 && tuck.y > 570, 'Speed controls are not lower left.');
  await emit('touchStart', [steer]);
  await emit('touchStart', [steer, brake]);
  const shifted = { ...steer, x: 336 };
  await emit('touchMove', [shifted, brake]);
  await page.waitForFunction(() => {
    const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
    return m?.inputSteer > .25 && m.inputBrake === 'true' && m.inputTuck === 'false';
  });
  await cue.waitFor({ state: 'hidden' });
  await emit('touchMove', [{ ...steer, x: 248 }, tuck]);
  await page.waitForFunction(() => {
    const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
    return m?.inputSteer < -.25 && m.inputBrake === 'false' && m.inputTuck === 'true';
  });
  assert(await page.locator('.touch-action--tuck[data-held]').isVisible());
  await emit('touchCancel', []);
  await page.waitForFunction(() => {
    const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
    return m?.inputSteer === 0 && m.inputBrake === 'false' && m.inputTuck === 'false';
  });
  assert.equal(await page.evaluate(() => scrollY), 0);
  await page.getByRole('button', { name: 'Pause game' }).tap();
  const pause = page.getByRole('dialog', { name: 'Paused' });
  await pause.getByRole('button', { name: 'Resume' }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Resume');
  await pause.getByText('Pine Glades', { exact: true }).waitFor();
  const touchReference = pause.locator('[data-reference="touch"]');
  assert(await touchReference.isVisible());
  assert.match(await touchReference.innerText(), /right thumb[\s\S]*left thumb/);
  await pause.getByRole('button', { name: 'Copy seed 1729' }).tap();
  await pause.getByText('Link copied', { exact: true }).waitFor();
  assert.equal(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get('seed'), '1729');
  await screenshot(page, 'phone-pause');
  const paused = await metrics(page);
  await page.setViewportSize({ width: 390, height: 570 });
  await page.waitForTimeout(140);
  assert.equal((await metrics(page)).worldY, paused.worldY, 'Resize advanced paused run');
  await pause.getByRole('button', { name: 'Resume' }).tap();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const beforeBlur = Number((await metrics(page)).worldY);
  await page.waitForFunction((y) => Number(Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.worldY) > y + 2, beforeBlur);
  assert.equal((await metrics(page)).paused, 'false');
  assert.equal(await page.getByRole('dialog').count(), 0, 'Focus loss opened a dialog.');
  await go(page);
  await verifyQuietStart(page);
  results.push({ name: 'mobile-first-repeat-and-pause', build: paused.build, brake, tuck,
    nativeTouch: true, scrollTop: 0, cancelled: true, seedClipboard: true });

  const shortenedTuck = await point('.touch-action--tuck', 8);
  assert(tuck.y - shortenedTuck.y >= 70 && tuck.y - shortenedTuck.y <= 90, 'Tuck did not follow the shortened viewport.');
  await page.setViewportSize({ width: 390, height: 650 });
  if (!quick) await sight(page, true);
  await go(page, 'pine', 'fork', '&quality=potato');
  const signs = page.locator('.trail-destination:visible');
  await signs.getByText('Sun Bowl', { exact: true }).waitFor();
  const readings = await signs.evaluateAll((boards) => {
    const brake = document.querySelector('.touch-action--brake')!.getBoundingClientRect();
    const tuck = document.querySelector('.touch-action--tuck')!.getBoundingClientRect();
    return boards.map((board) => {
      const r = board.getBoundingClientRect();
      const covered = [brake, tuck].some((button) => r.left < button.right && r.right > button.left &&
        r.top < button.bottom && r.bottom > button.top);
      return { text: board.textContent, withinWidth: r.left >= 0 && r.right <= innerWidth, clear: !covered };
    });
  });
  assert(readings.length === 3 && readings.every((board) => board.withinWidth), JSON.stringify(readings));
  // The lower targets may cover a sign as it first enters the frame. It must
  // be completely visible before the junction requires a lane commitment.
  await page.waitForFunction(() => {
    const list = [...document.querySelectorAll('.trail-destination')].filter((node) => node.getClientRects().length);
    const left = list.find((board) => board.textContent?.includes('Gate Run'))?.getBoundingClientRect();
    return list.length === 3 && left && left.bottom < document.querySelector('.touch-action--brake')!.getBoundingClientRect().top;
  });
  await screenshot(page, 'phone-fork-potato');
  results.push({ name: 'phone-fork', signs: readings.map((board) => board.text) });
  await go(page, 'hazards', 'boulder', '&quality=potato');
  const hazardTuck = await point('.touch-action--tuck', 3);
  await emit('touchStart', [hazardTuck]);
  await cue.getByText(/Rolling boulder/).waitFor();
  assert.equal(await page.locator('.run-cue:visible').count(), 1);
  await screenshot(page, 'phone-warning-potato');
  const crash = page.getByRole('dialog', { name: /Caught by a rolling boulder/ });
  const recovery = page.getByRole('button', { name: 'Recovery options' });
  await recovery.waitFor();
  await emit('touchEnd', []);
  assert.equal(await page.getByRole('dialog').count(), 0, 'Wipeout opened a dialog automatically.');
  await recovery.tap();
  await cue.waitFor({ state: 'hidden' });
  await screenshot(page, 'phone-crash-potato');
  await crash.getByRole('button', { name: 'Copy replay link' }).tap();
  await crash.getByText('Replay link copied.', { exact: true }).waitFor();
  const replayLink = await page.evaluate(() => navigator.clipboard.readText());
  assert(new URLSearchParams(new URL(replayLink).hash.slice(1)).has('replay'));
  await writeFile(`${folder}/${tag}-phone-boulder-replay.txt`, new URLSearchParams(new URL(replayLink).hash.slice(1)).get('replay')!);
  await crash.getByRole('button', { name: /Retry Section/ }).tap();
  await page.waitForFunction(() => {
    const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
    return m?.section === 'hazards' && m.crashed === 'false' && m.boulderActive === 'false' && m.inputTuck === 'false';
  });
  await cue.waitFor({ state: 'hidden' });
  await emit('touchStart', [await point('.touch-action--tuck', 4)]);
  await recovery.waitFor();
  await emit('touchEnd', []);
  await recovery.tap();
  await crash.getByRole('button', { name: 'Restart at the Top' }).tap();
  await page.waitForFunction((original) => {
    const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
    return m?.section === 'pine' && Number(m.seed) !== original;
  }, seed);
  await cue.waitFor({ state: 'hidden' });
  results.push({ name: 'phone-warning-crash-retry-and-restart', newSeed: (await metrics(page)).seed, replay: true });
  if (!quick) {
    await go(page, 'speed', 'encounter');
    await cue.getByText(/Follow flag arrows/).waitFor();
    await emit('touchStart', [await point('.touch-action--tuck', 5)]);
    await page.waitForFunction(() => document.querySelector('.run-cue')?.getAttribute('data-tone') === 'clock');
    await screenshot(page, 'phone-clock');
    await cue.getByText(/No clean time/).waitFor({ timeout: 36_000 });
    await emit('touchEnd', []);
    await screenshot(page, 'phone-result');
    await cue.waitFor({ state: 'hidden', timeout: 7000 });
    await page.getByRole('button', { name: 'Pause game' }).tap();
    assert(await page.locator('[data-pause-race]').isVisible());
    results.push({ name: 'phone-race', time: (await metrics(page)).timedMs, misses: (await metrics(page)).timedMisses });
  }
  await context.close();
}

async function desktop() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  watch(page);
  await go(page);
  await verifyQuietStart(page);
  await go(page);
  await verifyQuietStart(page);
  assert(!await page.locator('.touch-actions').isVisible());
  await page.keyboard.press('Escape');
  const modal = page.getByRole('dialog', { name: 'Paused' });
  await modal.getByRole('button', { name: 'Resume' }).waitFor();
  await modal.locator('[data-reference="keyboard"]').waitFor();
  await modal.getByRole('button', { name: 'Controller' }).focus();
  await page.keyboard.press('Enter');
  await modal.locator('[data-reference="gamepad"]').waitFor();
  assert.equal((await metrics(page)).paused, 'true', 'Activating a controls button resumed the run.');
  await screenshot(page, 'desktop-pause');
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden' });
  await page.keyboard.press('F3');
  await page.getByText('FRAME METRICS', { exact: true }).waitFor();
  assert.equal(await page.locator('#debug').getAttribute('data-build'), String((await metrics(page)).build));
  await page.evaluate(`(() => {
    let menuHeld = false;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [{
      connected: true, index: 0, mapping: 'standard', axes: [0, 0],
      buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: index === 9 && menuHeld })),
    }] });
    window.addEventListener('qa-menu-down', () => { menuHeld = true; });
    window.addEventListener('qa-menu-up', () => { menuHeld = false; });
    window.dispatchEvent(new Event('qa-menu-down'));
  })()`);
  await modal.waitFor();
  await page.waitForTimeout(500);
  assert.equal((await metrics(page)).paused, 'true', 'Holding the controller Menu button toggled pause twice.');
  await page.evaluate(() => window.dispatchEvent(new Event('qa-menu-up')));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new Event('qa-menu-down')));
  await modal.waitFor({ state: 'hidden' });
  await page.evaluate(() => window.dispatchEvent(new Event('qa-menu-up')));
  results.push({ name: 'desktop-repeat-pause-and-debug', build: (await metrics(page)).build, controllerMenuHold: true });
  if (!quick) await sight(page, false);
  await context.close();
}

try {
  if (baseline) {
    for (const isMobile of [true, false]) {
      const context = await browser.newContext({ viewport: isMobile ? { width: 390, height: 650 } : { width: 1440, height: 900 },
        isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 2 : 1 });
      const page = await context.newPage();
      watch(page);
      await sight(page, isMobile);
      await context.close();
    }
  } else {
    await desktop();
    await phone();
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${folder}/${tag}-checks.json`, JSON.stringify({ base, results, errors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}
