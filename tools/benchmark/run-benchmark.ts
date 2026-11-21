import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function argument(name: string, fallback: string): string {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
}

const quality = argument('quality', 'medium');
const viewportText = argument('viewport', '1440x900');
const [width = 1440, height = 900] = viewportText.split('x').map(Number);
const dpr = Number(argument('dpr', '1'));
const durationSeconds = Number(argument('duration', '10'));
const warmupSeconds = Number(argument('warmup', '3'));
const disable = argument('disable', '');
const renderScale = argument('renderScale', '');
const maxCanvasPixels = argument('maxCanvasPixels', '');
const scenario = argument('scenario', disable ? `without-${disable.replaceAll(',', '-')}` : 'normal');
const browserName = argument('browser', 'chrome');
const backend = argument('backend', 'default');
const seed = argument('seed', '424242');
const section = argument('section', '');
const start = argument('start', '');
const drive = argument('drive', 'carves');
const avalanche = argument('avalanche', '');
const lead = Number(argument('lead', 'Infinity'));
const wave = Number(argument('wave', '-1'));
const forkRange = Number(argument('fork-range', '0'));
const replayFile = argument('replay-file', '');
const crowd = Number(argument('crowd', '0'));
const combined = argument('combined', '') === 'true';
const externalPreview = argument('url', '');
const preview = externalPreview || 'http://127.0.0.1:4173';
const reportDirectory = path.resolve('tools/reports');
await mkdir(reportDirectory, { recursive: true });

const server = externalPreview ? null : spawn(
  process.execPath,
  [path.resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(preview);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Production preview did not start.');
}

async function scriptedInput(page: Page, durationMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < durationMs) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(260);
    await page.keyboard.up('KeyS');
  }
}

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function summarize(samples: number[]): Record<string, number> {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    samples: sorted.length,
    averageMs: sum / Math.max(1, sorted.length),
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    maxMs: sorted.at(-1) ?? 0,
    longFrames33ms: sorted.filter((value) => value > 33.34).length,
    longFrames50ms: sorted.filter((value) => value > 50).length,
  };
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = browserName === 'edge'
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined;
  const args = backend === 'vulkan'
    ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan']
    : ['--enable-unsafe-webgpu'];
  return chromium.launch({ headless: true, executablePath, args });
}

let browser: Browser | undefined;
let guideActive = false;
let guideTask: Promise<void> | undefined;
try {
  await waitForServer();
  browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const query = new URLSearchParams({ seed, quality });
  if (section) query.set('section', section);
  if (start) query.set('scenario', start);
  if (disable) query.set('disable', disable);
  if (renderScale) query.set('renderScale', renderScale);
  if (maxCanvasPixels) query.set('maxCanvasPixels', maxCanvasPixels);
  const replay = replayFile ? `#replay=${(await readFile(replayFile, 'utf8')).trim()}` : '';
  await page.goto(`${preview}/?${query}${replay}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!Reflect.get(globalThis, '__POWDERLINE_METRICS__'), undefined, { timeout: 20_000 });
  if (drive === 'tuck') await page.keyboard.down('KeyS');
  if (drive === 'chute') {
    const centerX = width / 2;
    const centerY = height / 2;
    const range = Math.max(92, Math.min(180, width * 0.19));
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    guideActive = true;
    guideTask = (async () => {
      while (guideActive) {
        const m = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__'));
        const target = Number(m?.pisteGuideX ?? m?.pisteAheadX);
        const steer = Math.max(-1, Math.min(1, (target - Number(m?.worldX) - Number(m?.velocityX) * 0.63) * 0.13));
        const corner = Number(m?.pisteHalfWidth) < 11.3 || Number(m?.pisteAheadWidth) < 11.5 ||
          Math.abs(target - Number(m?.pisteCenter)) > 4.8;
        await page.mouse.move(centerX + steer * range, centerY + (corner ? -76 : 0));
        await page.waitForTimeout(65);
      }
    })().catch((error: Error) => { errors.push(error.message); });
  }
  await page.waitForTimeout(warmupSeconds * 1000);
  if (forkRange > 0) await page.waitForFunction((distance) => {
    const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
    return Number(m?.sectionEnd) - Number(m?.worldY) <= distance;
  }, forkRange);
  if (avalanche) {
    try {
      await page.waitForFunction(({ phase, maxLead, wave }) => {
        const metrics = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
        return metrics?.crashed === 'true' ||
          (metrics?.avalanche === phase && Number(metrics.worldY) - Number(metrics.avalancheFront) <= maxLead &&
          (wave < 0 || metrics.wave === wave));
      }, { phase: avalanche, maxLead: lead, wave }, { timeout: 45_000 });
      const current = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__'));
      if (current?.crashed === 'true') throw new Error('Skier crashed before the benchmark window.');
    } catch (cause) {
      const current = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__'));
      throw new Error(`Avalanche benchmark did not reach the requested window: ${JSON.stringify(current)}`, { cause });
    }
  }
  if (crowd || combined) {
    const windowReached = await page.waitForFunction(({ count, overlap }) => {
      const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
      if (m?.crashed === 'true') return 'crashed';
      if (count && m?.section === 'busy' && m.npcActive >= count && m.npcVisible >= Math.ceil(count * 0.45)) return 'crowd';
      if (overlap && m?.boulderActive === 'true' && m.iceActive === 'true' &&
        m.iceTime < 1.3 && m.iceTime > 0.75 && m.sectionDistance > 920) return 'combined';
      return false;
    }, { count: crowd, overlap: combined }, { timeout: 48_000 });
    if (await windowReached.jsonValue() === 'crashed') throw new Error('Skier crashed before the expansion benchmark window.');
  }
  const metricsStart = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__'));
  await page.evaluate(`(() => {
    const samples = [];
    const peak = { npcActive: 0, npcVisible: 0, simultaneousHazardFrames: 0 };
    globalThis.__POWDERLINE_WINDOW_PEAK__ = peak;
    let previous = performance.now();
    const sample = (now) => {
      samples.push(now - previous);
      previous = now;
      const metrics = globalThis.__POWDERLINE_METRICS__;
      if (metrics) {
        peak.npcActive = Math.max(peak.npcActive, metrics.npcActive);
        peak.npcVisible = Math.max(peak.npcVisible, metrics.npcVisible);
        if (metrics.boulderActive === 'true' && metrics.iceActive === 'true') peak.simultaneousHazardFrames++;
      }
      globalThis.__POWDERLINE_BENCHMARK_SAMPLES__ = samples;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })()`);
  if (drive === 'coast' || drive === 'tuck' || guideTask) await page.waitForTimeout(durationSeconds * 1000);
  else await scriptedInput(page, durationSeconds * 1000);
  const captureName = `${scenario}-${width}x${height}-dpr${dpr}`.replaceAll('.', '_');
  // Read the measured interval before capture. High-resolution screenshots can
  // briefly stall presentation and must not be counted as gameplay frame time.
  const pageData = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    return {
      metrics: Reflect.get(globalThis, '__POWDERLINE_METRICS__') as unknown,
      samples: Reflect.get(globalThis, '__POWDERLINE_BENCHMARK_SAMPLES__') as number[],
      windowPeak: Reflect.get(globalThis, '__POWDERLINE_WINDOW_PEAK__') as unknown,
      canvas: {
        cssWidth: canvas?.clientWidth ?? 0,
        cssHeight: canvas?.clientHeight ?? 0,
        pixelWidth: canvas?.width ?? 0,
        pixelHeight: canvas?.height ?? 0,
      },
      environment: {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: Reflect.get(navigator, 'deviceMemory') ?? 'unavailable',
        devicePixelRatio,
      },
    };
  });
  guideActive = false;
  if (guideTask) {
    await guideTask;
    await page.mouse.up();
  }
  if (drive === 'tuck') await page.keyboard.up('KeyS');
  await page.screenshot({ path: path.join(reportDirectory, `${captureName}.png`) });
  const canvasPixels = pageData.canvas.pixelWidth * pageData.canvas.pixelHeight;
  const result = {
    generatedAt: new Date().toISOString(),
    scenario,
    quality,
    browser: browserName,
    backend,
    route: { seed, section, start, drive, avalanche, lead: Number.isFinite(lead) ? lead : null,
      wave, forkRange, replayFile: replayFile || null, crowd, combined },
    durationSeconds,
    viewport: { width, height, dpr },
    canvas: { ...pageData.canvas, pixels: canvasPixels },
    environment: pageData.environment,
    frameTime: summarize(pageData.samples.slice(1)),
    canvasVisible: await page.locator('#game-canvas').isVisible(),
    errors,
    metrics: pageData.metrics,
    metricsStart,
    windowPeak: pageData.windowPeak,
  };
  const fileName = `${captureName}.json`;
  await writeFile(path.join(reportDirectory, fileName), JSON.stringify(result, null, 2));
  await writeFile(path.join(reportDirectory, 'benchmark.json'), JSON.stringify(result, null, 2));
  if (!result.canvasVisible || errors.length > 0) process.exitCode = 1;
  console.log(JSON.stringify(result, null, 2));
} finally {
  guideActive = false;
  await guideTask?.catch(() => undefined);
  await browser?.close();
  server?.kill();
}

declare global {
  var __POWDERLINE_BENCHMARK_SAMPLES__: number[] | undefined;
}
