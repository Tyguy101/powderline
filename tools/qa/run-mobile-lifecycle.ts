import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface Viewport {
  width: number;
  height: number;
}

interface MobileProfile {
  name: string;
  viewport: Viewport;
  rotated: Viewport;
  dpr: number;
}

interface Snapshot {
  viewport: Viewport;
  canvas: {
    cssWidth: number;
    cssHeight: number;
    pixelWidth: number;
    pixelHeight: number;
    pixels: number;
  };
  worldY: number;
  paused: boolean;
  touchAction: string;
  overflow: string;
  inputSteer: number;
  inputBrake: boolean;
  inputTuck: boolean;
  mobileControlScheme: string;
  cameraComposition: string;
  skierScreenYPercent: number;
  effectiveCameraScale: number;
}

const profiles: MobileProfile[] = [
  {
    name: 'small-phone',
    viewport: { width: 320, height: 568 },
    rotated: { width: 568, height: 320 },
    dpr: 2,
  },
  {
    name: 'tall-phone',
    viewport: { width: 430, height: 932 },
    rotated: { width: 932, height: 430 },
    dpr: 3,
  },
  {
    name: 'tablet',
    viewport: { width: 820, height: 1180 },
    rotated: { width: 1180, height: 820 },
    dpr: 2,
  },
  {
    name: 'narrow-landscape',
    viewport: { width: 667, height: 375 },
    rotated: { width: 375, height: 667 },
    dpr: 2,
  },
];

const reportDirectory = path.resolve('tools/reports/mobile-lifecycle');
await mkdir(reportDirectory, { recursive: true });

const server = spawn(
  process.execPath,
  [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4175'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4175');
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Production preview did not start on port 4175.');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined;
  return chromium.launch({
    headless: true,
    executablePath,
    args: ['--enable-unsafe-webgpu'],
  });
}

async function readSnapshot(page: Page): Promise<Snapshot> {
  await page.waitForFunction(() => Boolean(Reflect.get(globalThis, '__POWDERLINE_METRICS__')));
  return page.evaluate(() => {
    const metrics = Reflect.get(globalThis, '__POWDERLINE_METRICS__') as Record<string, number | string>;
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    const pixelWidth = canvas?.width ?? 0;
    const pixelHeight = canvas?.height ?? 0;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      canvas: {
        cssWidth: canvas?.clientWidth ?? 0,
        cssHeight: canvas?.clientHeight ?? 0,
        pixelWidth,
        pixelHeight,
        pixels: pixelWidth * pixelHeight,
      },
      worldY: Number(metrics.worldY),
      paused: metrics.paused === 'true',
      touchAction: canvas ? getComputedStyle(canvas).touchAction : '',
      overflow: getComputedStyle(document.documentElement).overflow,
      inputSteer: Number(metrics.inputSteer),
      inputBrake: metrics.inputBrake === 'true',
      inputTuck: metrics.inputTuck === 'true',
      mobileControlScheme: String(metrics.mobileControlScheme),
      cameraComposition: String(metrics.cameraComposition),
      skierScreenYPercent: Number(metrics.skierScreenYPercent),
      effectiveCameraScale: Number(metrics.effectiveCameraScale),
    };
  });
}

function verifyLayout(snapshot: Snapshot, expected: Viewport, label: string): void {
  assert(snapshot.viewport.width === expected.width, `${label}: viewport width did not update.`);
  assert(snapshot.viewport.height === expected.height, `${label}: viewport height did not update.`);
  assert(snapshot.canvas.cssWidth === expected.width, `${label}: canvas CSS width does not fill viewport.`);
  assert(snapshot.canvas.cssHeight === expected.height, `${label}: canvas CSS height does not fill viewport.`);
  assert(snapshot.canvas.pixelWidth > 0 && snapshot.canvas.pixelHeight > 0, `${label}: canvas has no backing pixels.`);
  assert(snapshot.canvas.pixels <= 1_010_000, `${label}: canvas exceeded the 1 MP render budget.`);
  assert(snapshot.touchAction === 'none', `${label}: canvas must suppress browser touch gestures.`);
  assert(snapshot.overflow === 'hidden', `${label}: document can scroll during play.`);
}

async function verifyPausedState(page: Page): Promise<{ pausedY: number; resumedY: number }> {
  await page.keyboard.press('KeyP');
  await page.waitForFunction(
    () => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.paused === 'true',
  );
  assert(await page.locator('.pause-overlay').evaluate((node) => node.classList.contains('visible')),
    'Pause overlay is not visible while paused.');
  const pausedY = (await readSnapshot(page)).worldY;
  await page.waitForTimeout(500);
  const heldY = (await readSnapshot(page)).worldY;
  assert(Math.abs(heldY - pausedY) < 0.001, 'Simulation advanced while paused.');

  await page.keyboard.press('KeyP');
  await page.waitForFunction(
    () => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.paused === 'false',
  );
  await page.waitForTimeout(500);
  const resumedY = (await readSnapshot(page)).worldY;
  assert(resumedY > heldY, 'Simulation did not resume after pause.');
  return { pausedY, resumedY };
}

async function verifyTouchFoundation(page: Page): Promise<void> {
  const pause = page.locator('.mobile-pause');
  const box = await pause.boundingBox();
  assert(box && box.width >= 44 && box.height >= 44, 'Mobile pause target is smaller than 44px.');
  assert(await page.locator('[data-touch-help]').isVisible(), 'Touch-specific help is not visible.');
  const brake = page.locator('.touch-action--brake');
  const tuck = page.locator('.touch-action--tuck');
  const brakeBox = await brake.boundingBox();
  const tuckBox = await tuck.boundingBox();
  assert(brakeBox && brakeBox.width >= 70 && brakeBox.height >= 70,
    'BRAKE touch target is too small.');
  assert(tuckBox && tuckBox.width >= 70 && tuckBox.height >= 70,
    'TUCK touch target is too small.');
  await pause.click();
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.paused === 'true');
  const resume = page.locator('[data-resume]');
  const resumeBox = await resume.boundingBox();
  assert(resumeBox && resumeBox.width >= 44 && resumeBox.height >= 44, 'Resume target is smaller than 44px.');
  await resume.click();
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.paused === 'false');

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert(await page.locator('.pause-overlay').evaluate((node) => node.classList.contains('visible')),
    'Backgrounding did not show an explicit resume prompt.');
  const hiddenY = (await readSnapshot(page)).worldY;
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(250);
  const restored = await readSnapshot(page);
  assert(restored.paused, 'Returning from the background resumed gameplay automatically.');
  assert(Math.abs(restored.worldY - hiddenY) < 0.001, 'Background interval advanced simulation.');
  await page.locator('[data-resume]').click();
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.paused === 'false');

  assert(brakeBox && tuckBox, 'Touch action bounds are unavailable.');
  const canvasBox = await page.locator('#game-canvas').boundingBox();
  assert(canvasBox, 'Canvas bounds are unavailable for touch testing.');
  const emitPointer = async (
    selector: string,
    type: string,
    pointerId: number,
    clientX: number,
    clientY: number,
  ): Promise<void> => {
    await page.locator(selector).dispatchEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType: 'touch',
      isPrimary: pointerId === 41,
      clientX,
      clientY,
      buttons: type === 'pointerup' ? 0 : 1,
    });
  };
  const originX = canvasBox.x + Math.min(150, canvasBox.width * 0.28);
  const originY = canvasBox.y + canvasBox.height * 0.56;
  await emitPointer('#game-canvas', 'pointerdown', 41, originX, originY);
  await emitPointer('#game-canvas', 'pointermove', 41, originX + 62, originY + 90);
  await page.waitForFunction(() => Number(Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.inputSteer) > 0.3);
  let touch = await readSnapshot(page);
  assert(!touch.inputBrake && !touch.inputTuck,
    'Vertical steering-thumb drift changed speed mode.');

  await emitPointer(
    '.touch-action--brake',
    'pointerdown',
    42,
    brakeBox.x + brakeBox.width / 2,
    brakeBox.y + brakeBox.height / 2,
  );
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.inputBrake === 'true');
  touch = await readSnapshot(page);
  assert(touch.inputSteer > 0.3 && touch.inputBrake,
    'BRAKE did not remain active alongside steering.');

  await emitPointer('#game-canvas', 'pointermove', 41, originX - 70, originY - 80);
  await page.waitForFunction(() => Number(Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.inputSteer) < -0.3);
  touch = await readSnapshot(page);
  assert(touch.inputBrake, 'Changing carve direction stole the BRAKE touch.');

  await emitPointer(
    '.touch-action--brake',
    'pointermove',
    42,
    tuckBox.x + tuckBox.width / 2,
    tuckBox.y + tuckBox.height / 2,
  );
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.inputTuck === 'true');
  touch = await readSnapshot(page);
  assert(!touch.inputBrake && touch.inputTuck && touch.inputSteer < -0.3,
    'BRAKE to TUCK switching interrupted steering or left BRAKE active.');

  await emitPointer('#game-canvas', 'pointerup', 41, originX - 70, originY - 80);
  await page.waitForFunction(() => Math.abs(Number(Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.inputSteer)) < 0.01);
  touch = await readSnapshot(page);
  assert(touch.inputTuck, 'Releasing the steering thumb stole the TUCK touch.');
  await emitPointer(
    '.touch-action--brake',
    'pointerup',
    42,
    tuckBox.x + tuckBox.width / 2,
    tuckBox.y + tuckBox.height / 2,
  );
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.inputTuck === 'false');
}

async function runProfile(browser: Browser, profile: MobileProfile): Promise<Record<string, unknown>> {
  const context: BrowserContext = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.dpr,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    // Synthetic PointerEvents used below are not entered into Chromium's native
    // pointer-capture registry. The app still executes its ownership logic.
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('http://127.0.0.1:4175/?seed=424242&quality=low&disable=collisions', {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => document.body.classList.contains('ready'), undefined, {
    timeout: 20_000,
  });
  await page.waitForTimeout(500);

  const portraitOrInitial = await readSnapshot(page);
  verifyLayout(portraitOrInitial, profile.viewport, `${profile.name} initial`);
  await verifyTouchFoundation(page);
  const pauseResume = await verifyPausedState(page);

  await page.setViewportSize(profile.rotated);
  await page.waitForTimeout(500);
  const rotated = await readSnapshot(page);
  verifyLayout(rotated, profile.rotated, `${profile.name} rotated`);
  if (profile.rotated.width > profile.rotated.height) {
    assert(rotated.mobileControlScheme === 'split', `${profile.name}: split touch scheme is not active.`);
    assert(rotated.cameraComposition === 'landscape-lookahead',
      `${profile.name}: landscape camera composition is not active.`);
    assert(rotated.skierScreenYPercent >= 14 && rotated.skierScreenYPercent <= 21,
      `${profile.name}: skier is outside the 15–20% landscape target region (${rotated.skierScreenYPercent.toFixed(2)}%).`);
    assert(rotated.effectiveCameraScale === 88,
      `${profile.name}: landscape camera scale was not applied.`);
  }

  // Exercise resize while paused, which approximates orientation changing while
  // a mobile browser or wrapper has suspended gameplay.
  await page.keyboard.press('KeyP');
  await page.waitForFunction(
    () => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.paused === 'true',
  );
  const rotatedPausedY = (await readSnapshot(page)).worldY;
  await page.setViewportSize(profile.viewport);
  await page.waitForTimeout(500);
  const restoredWhilePaused = await readSnapshot(page);
  verifyLayout(restoredWhilePaused, profile.viewport, `${profile.name} restored while paused`);
  assert(
    Math.abs(restoredWhilePaused.worldY - rotatedPausedY) < 0.001,
    `${profile.name}: orientation change advanced the paused simulation.`,
  );
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(300);

  await page.screenshot({
    path: path.join(reportDirectory, `${profile.name}.png`),
  });
  await page.goto('http://127.0.0.1:4175/?seed=1729&quality=low&scenario=fork');
  const fork = page.getByRole('region', { name: 'Upcoming trail choices' });
  await fork.waitFor({ state: 'visible' });
  assert(await fork.locator('.mountain-choices > div').count() === 3, 'Trail preview is missing a choice.');
  const forkLayouts = [];
  for (const [label, viewport] of [['initial', profile.viewport], ['rotated', profile.rotated]] as const) {
    await page.setViewportSize(viewport);
    const preview = await fork.boundingBox();
    const brake = await page.locator('.touch-action--brake').boundingBox();
    const tuck = await page.locator('.touch-action--tuck').boundingBox();
    assert(preview && preview.x >= 0 && preview.y >= 0 &&
      preview.x + preview.width <= viewport.width + 1 && preview.y + preview.height <= viewport.height + 1,
    `${profile.name}: trail preview is clipped in ${label} orientation.`);
    for (const control of [brake, tuck]) {
      assert(control && (
        preview.x + preview.width <= control.x || control.x + control.width <= preview.x ||
        preview.y + preview.height <= control.y || control.y + control.height <= preview.y
      ), `${profile.name}: trail preview covers a speed control in ${label} orientation.`);
    }
    forkLayouts.push({ label, viewport, preview });
    await page.screenshot({ path: path.join(reportDirectory, `${profile.name}-fork-${label}.png`) });
  }
  assert(errors.length === 0, `${profile.name}: browser errors: ${errors.join(' | ')}`);
  await context.close();
  return {
    profile,
    initial: portraitOrInitial,
    pauseResume,
    rotated,
    restoredWhilePaused,
    forkLayouts,
    errors,
    passed: true,
  };
}

async function verifyUnsupportedWebGpu(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, value: undefined });
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4175/', { waitUntil: 'networkidle' });
  const card = page.locator('.compat-card');
  await card.waitFor({ state: 'visible' });
  assert((await card.textContent())?.includes('does not currently expose WebGPU'),
    'Unsupported-WebGPU path did not provide useful player guidance.');
  assert(await page.evaluate(() => getComputedStyle(document.body).opacity === '1'),
    'Unsupported-WebGPU message is present but invisible.');
  await context.close();
}

try {
  await waitForServer();
  const browser = await launchBrowser();
  const results: Record<string, unknown>[] = [];
  try {
    await verifyUnsupportedWebGpu(browser);
    for (const profile of profiles) results.push(await runProfile(browser, profile));
  } finally {
    await browser.close();
  }
  const report = {
    generatedAt: new Date().toISOString(),
    seed: 424242,
    scope: 'Simulated Chromium mobile viewports; not physical-device or iOS validation.',
    results,
  };
  await writeFile(
    path.join(reportDirectory, 'results.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  server.kill();
}
