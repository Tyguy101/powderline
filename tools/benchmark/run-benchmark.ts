import { chromium, type Browser, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
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
const section = argument('section', '');
const start = argument('start', '');
const drive = argument('drive', 'carves');
const avalanche = argument('avalanche', '');
const lead = Number(argument('lead', 'Infinity'));
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
  const query = new URLSearchParams({ seed: '424242', quality });
  if (section) query.set('section', section);
  if (start) query.set('scenario', start);
  if (disable) query.set('disable', disable);
  if (renderScale) query.set('renderScale', renderScale);
  if (maxCanvasPixels) query.set('maxCanvasPixels', maxCanvasPixels);
  await page.goto(`http://127.0.0.1:4173/?${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!Reflect.get(globalThis, '__POWDERLINE_METRICS__'), undefined, { timeout: 20_000 });
  if (drive === 'tuck') await page.keyboard.down('KeyS');
  await page.waitForTimeout(warmupSeconds * 1000);
  if (avalanche) {
    await page.waitForFunction(({ phase, maxLead }) => {
      const metrics = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
      return metrics?.avalanche === phase && metrics.worldY - metrics.avalancheFront <= maxLead;
    }, { phase: avalanche, maxLead: lead }, { timeout: 25_000 });
  }
  await page.evaluate(`(() => {
    const samples = [];
    let previous = performance.now();
    const sample = (now) => {
      samples.push(now - previous);
      previous = now;
      globalThis.__POWDERLINE_BENCHMARK_SAMPLES__ = samples;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })()`);
  if (drive === 'coast' || drive === 'tuck') await page.waitForTimeout(durationSeconds * 1000);
  else await scriptedInput(page, durationSeconds * 1000);
  const captureName = `${scenario}-${width}x${height}-dpr${dpr}`.replaceAll('.', '_');
  // Read the measured interval before capture. High-resolution screenshots can
  // briefly stall presentation and must not be counted as gameplay frame time.
  const pageData = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
    return {
      metrics: Reflect.get(globalThis, '__POWDERLINE_METRICS__') as unknown,
      samples: Reflect.get(globalThis, '__POWDERLINE_BENCHMARK_SAMPLES__') as number[],
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
  if (drive === 'tuck') await page.keyboard.up('KeyS');
  await page.screenshot({ path: path.join(reportDirectory, `${captureName}.png`) });
  const canvasPixels = pageData.canvas.pixelWidth * pageData.canvas.pixelHeight;
  const result = {
    generatedAt: new Date().toISOString(),
    scenario,
    quality,
    browser: browserName,
    backend,
    route: { section, start, drive, avalanche, lead: Number.isFinite(lead) ? lead : null },
    durationSeconds,
    viewport: { width, height, dpr },
    canvas: { ...pageData.canvas, pixels: canvasPixels },
    environment: pageData.environment,
    frameTime: summarize(pageData.samples.slice(1)),
    canvasVisible: await page.locator('#game-canvas').isVisible(),
    errors,
    metrics: pageData.metrics,
  };
  const fileName = `${captureName}.json`;
  await writeFile(path.join(reportDirectory, fileName), JSON.stringify(result, null, 2));
  await writeFile(path.join(reportDirectory, 'benchmark.json'), JSON.stringify(result, null, 2));
  if (!result.canvasVisible || errors.length > 0) process.exitCode = 1;
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  server.kill();
}

declare global {
  var __POWDERLINE_BENCHMARK_SAMPLES__: number[] | undefined;
}
