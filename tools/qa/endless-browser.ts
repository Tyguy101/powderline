import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { LANE_SPACING, type Lane, type Trail } from '../../src/world/EndlessMountain';

const base = process.env.POWDERLINE_QA_URL ?? 'http://127.0.0.1:5173';
const output = path.resolve('tools/reports/endless');
const headless = !process.argv.includes('--headed');
const mode = process.argv.includes('--tour') ? 'tour' :
  process.argv.includes('--replay-tour') ? 'replay-tour' : 'encounters';
const seed = 1729;
await mkdir(output, { recursive: true });

type Metrics = Record<string, string | number>;
const evidence: Array<Record<string, unknown>> = [];
const errors: string[] = [];
const browser = await chromium.launch({
  headless, channel: 'chrome',
  args: ['--enable-unsafe-webgpu', '--disable-backgrounding-occluded-windows'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('request', (request) => {
  if (!request.url().startsWith(new URL(base).origin) && /^https?:/.test(request.url())) {
    errors.push('Unexpected external request: ' + request.url());
  }
});

async function state(): Promise<Metrics> {
  return page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__'));
}

async function load(trail: Trail, scenario: 'summit' | 'fork' | 'encounter'): Promise<Metrics> {
  await page.goto(`${base}/?seed=${seed}&section=${trail}&scenario=${scenario}&dev=1`);
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.sectionId !== undefined);
  return state();
}

async function capture(name: string, metrics: Metrics, replay = true): Promise<void> {
  await page.screenshot({ path: path.join(output, name + '.png'), timeout: 12_000 });
  const input = replay ? await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_REPLAY__')?.()) : '';
  if (input) await writeFile(path.join(output, name + '.replay.txt'), input + '\n');
  evidence.push({ name, ...metrics });
  console.log(name, metrics.section, metrics.sectionIndex, Math.round(Number(metrics.sectionDistance)), metrics.avalanche);
}

async function steer(x: number, speed: 'coast' | 'brake' | 'tuck', metrics: Metrics) {
  const error = x - Number(metrics.worldX) - Number(metrics.velocityX) * 0.63;
  const steer = Math.max(-1, Math.min(1, error * 0.13));
  await page.mouse.move(720 + steer * 180, 460 + (speed === 'coast' ? 0 : speed === 'brake' ? -76 : 76));
}

async function beginDrag() {
  await page.mouse.move(720, 460);
  await page.mouse.down();
}

async function follow(
  until: (metrics: Metrics) => boolean,
  drive: (metrics: Metrics) => [number, 'coast' | 'brake' | 'tuck'],
  timeout = 110_000,
): Promise<Metrics> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const metrics = await state();
    if (until(metrics)) return metrics;
    assert.equal(metrics.crashed, 'false', JSON.stringify(metrics));
    const [x, speed] = drive(metrics);
    await steer(x, speed, metrics);
    await page.waitForTimeout(62);
  }
  throw new Error('Control sequence timed out: ' + JSON.stringify(await state()));
}

async function waitForMetrics(test: (metrics: Metrics) => boolean, timeout = 30_000): Promise<Metrics> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const metrics = await state();
    if (metrics && test(metrics)) return metrics;
    await page.waitForTimeout(70);
  }
  throw new Error('Metrics timed out: ' + JSON.stringify(await state()));
}

async function tour() {
  await load('pine', 'summit');
  const plan: Array<[Trail, Lane, Trail]> = [
    ['pine', -1, 'gate'], ['gate', -1, 'air'], ['air', 1, 'chute'],
    ['chute', -1, 'avalanche'], ['avalanche', 1, 'gate'], ['gate', 0, 'gate'],
  ];
  await capture('tour-summit', await state());
  await beginDrag();
  for (const [index, [trail, lane, destination]] of plan.entries()) {
    assert.equal((await state()).section, trail);
    const guide = (m: Metrics): [number, 'coast' | 'brake' | 'tuck'] => {
      const center = Number(m.sectionCenter);
      const localY = Number(m.sectionDistance);
      const remaining = Number(m.sectionEnd) - Number(m.worldY);
      if (remaining < 76) return [center + lane * LANE_SPACING, 'coast'];
      if (trail === 'gate' && Number(m.nextGateY) > 0) return [Number(m.nextGateX), 'coast'];
      if (trail === 'air') {
        const bypass = localY > 164;
        return [center + (bypass ? 28 : 0), localY < 179 ? 'tuck' : 'coast'];
      }
      if (trail === 'chute') {
        return [Number(m.pisteAheadX), Number(m.pisteHalfWidth) < 10.8 ? 'brake' : 'coast'];
      }
      if (trail === 'avalanche' && (m.avalanche === 'warning' || m.avalanche === 'chasing')) {
        return [center + Number(m.shelterEdge) + 6, 'coast'];
      }
      if (trail === 'avalanche' && m.avalanche === 'escaped' && Number(m.worldY) < Number(m.shelterEnd) + 20) {
        return [center + Number(m.shelterEdge) + 6, 'tuck'];
      }
      return [Number(m.pisteAheadX), 'tuck'];
    };
    if (index < 5) {
      const signature = (m: Metrics) => {
        if (trail === 'pine') return Number(m.sectionDistance) > 368;
        if (trail === 'gate') return Number(m.gateIndex) >= 2;
        if (trail === 'air') return m.airborne === 'true';
        if (trail === 'chute') return Number(m.sectionDistance) > 241;
        return m.avalanche === 'escaped';
      };
      await capture('tour-' + trail, await follow(signature, guide, 36_000));
    }
    await capture(`tour-${index}-fork-approach`, await follow(
      (m) => Number(m.sectionEnd) - Number(m.worldY) < 112, guide,
    ));
    const committed = await follow((m) => Number(m.sectionIndex) === index + 1, guide, 18_000);
    assert.equal(committed.section, destination);
    assert.equal(committed.lastLane, lane);
    assert.equal(committed.retainedSections, 2);
    await capture(`tour-${index}-commit`, committed);
  }
  await page.mouse.up();
}

async function encounters() {
  await load('pine', 'encounter');
  await capture('pine-clearing', await waitForMetrics((m) => Number(m.sectionDistance) > 369));
  await load('pine', 'fork');
  await capture('pine-fork-preview', await waitForMetrics((m) => Number(m.sectionEnd) - Number(m.worldY) < 108));
  await beginDrag();
  const right = await follow((m) => m.sectionIndex === 1, (m) =>
    [Number(m.sectionCenter) + LANE_SPACING, 'coast'], 15_000);
  assert.equal(right.lastLane, 1);
  await page.mouse.up();
  await capture('pine-fork-right', right);
  const replayAtFork = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_REPLAY__')?.());
  assert.ok(replayAtFork);
  await page.goto(`${base}/?quality=potato#replay=${replayAtFork}`);
  const repeated = await waitForMetrics((m) => m.sectionIndex === 1);
  assert.equal(repeated.sectionId, right.sectionId);
  assert.equal(repeated.lastLane, 1);
  assert.equal(repeated.seed, seed);
  evidence.push({ name: 'replay-fork-right-potato', ...repeated });

  const legacy = Buffer.from(JSON.stringify({ version: 5, seed: 424242,
    runs: [{ frames: 180, steer: 0, flags: 0 }] })).toString('base64url');
  await page.goto(`${base}/?replay=${legacy}`);
  const classic = await waitForMetrics((m) => Number(m.worldY) > 6);
  assert.equal(classic.seed, 424242);
  assert.equal(classic.section, undefined);
  evidence.push({ name: 'classic-v5-replay', ...classic });
  await page.goto(`${base}/?replay=invalid`);
  await page.getByText('This replay is invalid or from an unsupported Powderline version.').waitFor();

  await load('gate', 'encounter');
  await beginDrag();
  let result = await follow((m) => Number(m.gateIndex) === 1,
    (m) => [Number(m.nextGateX), 'brake'], 14_000);
  assert.equal(result.gateOutcome, 'clean');
  await capture('gate-clean', result);
  const cleanTotal = result.cleanGates;
  result = await follow((m) => Number(m.gateIndex) === 2,
    (m) => [Number(m.sectionCenter) + 26, 'coast'], 10_000);
  assert.equal(result.gateStreak, 0);
  assert.equal(result.gateOutcome, 'missed');
  assert.equal(result.cleanGates, cleanTotal);
  await page.mouse.up();
  await capture('gate-missed', result);

  await load('air', 'encounter');
  await page.keyboard.down('KeyS');
  result = await waitForMetrics((m) => m.airborne === 'true');
  await capture('air-tuck', result);
  result = await waitForMetrics((m) => Number(m.completedJumpDistance) > 0);
  assert.ok(Number(result.completedJumpDistance) < 57);
  await page.keyboard.up('KeyS');
  await capture('air-landing', result);

  await load('air', 'encounter');
  await beginDrag();
  result = await follow((m) => Number(m.sectionDistance) > 345, (m) =>
    [Number(m.sectionCenter) + 28, 'coast'], 22_000);
  assert.equal(result.jumpSequence, 0);
  await page.mouse.up();
  await capture('air-bypass', result);

  for (const reaction of ['early', 'late', 'missed']) {
    const initial = await load('avalanche', 'encounter');
    const startId = initial.sectionId;
    if (reaction === 'missed') {
      result = await waitForMetrics((m) => m.avalanche === 'chasing' && Number(m.worldY) - Number(m.avalancheFront) < 15);
      await capture('avalanche-front', result);
      result = await waitForMetrics((m) => m.avalanche === 'caught');
      assert.equal(result.crashed, 'true');
      await page.getByRole('button', { name: /Retry Section/ }).waitFor();
      await capture('avalanche-caught', result);
      await page.getByRole('button', { name: /Retry Section/ }).click();
      result = await waitForMetrics((m) => m.avalanche === 'quiet' && m.crashed === 'false');
      assert.equal(result.sectionId, startId);
      assert.ok(Math.abs(Number(result.worldY) - Number(initial.worldY)) <= 5);
      await capture('avalanche-retry', result);
      const replay = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_REPLAY__')?.());
      assert.ok(replay);
      await page.keyboard.down('KeyS');
      await waitForMetrics((m) => m.avalanche === 'caught', 36_000);
      await page.keyboard.up('KeyS');
      await page.getByRole('button', { name: 'Restart at the Top' }).click();
      result = await waitForMetrics((m) => m.section === 'pine' && m.seed !== seed && m.crashed === 'false');
      await capture('restart-new-seed', result);
    } else {
      await beginDrag();
      result = await follow((m) => m.avalanche === 'escaped', (m) => {
        const early = reaction === 'early' && m.avalanche === 'warning';
        const late = reaction === 'late' && m.avalanche === 'chasing' &&
          Number(m.worldY) - Number(m.avalancheFront) <= 45;
        return [Number(m.sectionCenter) + (early || late || Math.abs(Number(m.worldX)) >= 3 ? Number(m.shelterEdge) + 7 : 0), 'coast'];
      }, 24_000);
      assert.equal(result.crashed, 'false');
      await page.mouse.up();
      await capture('avalanche-' + reaction, result);
    }
  }
}

async function report(page: Page, completed: boolean) {
  const memory = await page.evaluate(() => {
    const heap = Reflect.get(performance, 'memory');
    return heap ? { usedJSHeapSize: heap.usedJSHeapSize, totalJSHeapSize: heap.totalJSHeapSize } : null;
  }).catch(() => null);
  await writeFile(path.join(output, mode + '.json'),
    JSON.stringify({ completed, headless, seed, errors, memory, evidence }, null, 2));
}

async function replayTour() {
  const recording = (await readFile(path.join(output, 'tour-5-commit.replay.txt'), 'utf8')).trim();
  assert.ok(recording.length > 16_384, 'Full descent recording should exceed the server request limit.');
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    let firstFrame: number | undefined;
    window.requestAnimationFrame = (callback) => raf((actual) => {
      firstFrame ??= actual;
      callback(firstFrame + (actual - firstFrame) * 6);
    });
  });
  await page.goto(`${base}/?quality=potato&dev=1#replay=${recording}`);
  const final = await waitForMetrics((m) => m.crashed === 'true' || m.sectionIndex === 6, 130_000);
  assert.equal(final.crashed, 'false');
  assert.equal(final.section, 'gate');
  assert.equal(final.sectionIndex, 6);
  assert.equal(final.lastLane, 0);
  assert.equal(final.cleanGates, 58);
  await capture('replay-tour-end', final, false);
}

try {
  await (mode === 'tour' ? tour() : mode === 'replay-tour' ? replayTour() : encounters());
  assert.deepEqual(errors, []);
  await report(page, true);
} catch (error) {
  await capture(mode + '-failure', await state()).catch(() => {});
  await report(page, false);
  throw error;
} finally {
  await browser.close();
}
