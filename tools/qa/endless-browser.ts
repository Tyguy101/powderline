import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { LANE_SPACING, type Lane, type Trail } from '../../src/world/EndlessMountain';

const base = process.env.POWDERLINE_QA_URL ?? 'http://127.0.0.1:5173';
const output = path.resolve('tools/reports/trail-pass');
const headless = !process.argv.includes('--headed');
const clockRate = process.argv.includes('--double') ? 2 : 1;
const mode = process.argv.includes('--tour') ? 'tour' :
  process.argv.includes('--replay-tour') ? 'replay-tour' :
    process.argv.includes('--chase-only') ? 'chase' : 'encounters';
const seed = Number(process.argv.find((argument) => argument.startsWith('--seed='))?.split('=')[1] ?? 1729);
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
async function accelerateFrames(rate: number): Promise<void> {
  await page.addInitScript((multiplier) => {
    const raf = requestAnimationFrame.bind(window);
    let firstFrame: number | undefined;
    window.requestAnimationFrame = (callback) => raf((actual) => {
      firstFrame ??= actual;
      callback(firstFrame + (actual - firstFrame) * multiplier);
    });
  }, rate);
}
if (clockRate > 1) await accelerateFrames(clockRate);
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
  return await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')) ?? {};
}

async function load(trail: Trail, scenario: 'summit' | 'fork' | 'encounter', quality = 'medium'): Promise<Metrics> {
  await page.goto(`${base}/?seed=${seed}&section=${trail}&scenario=${scenario}&dev=1&quality=${quality}`);
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
    assert.ok(metrics.section, 'Game state disappeared during the descent.');
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

function pineLine(m: Metrics, scenic: boolean): [number, 'coast' | 'brake' | 'tuck'] {
  const center = Number(m.sectionCenter);
  const approach = Number(m.worldY) - Number(m.gladeY);
  const side = Number(m.gladeSide);
  if (scenic && approach >= -49 && approach < 25) return [center - side * 26, approach < -9 ? 'brake' : 'coast'];
  if (!scenic && approach >= -70 && approach < 31) return [center + side * 12, 'coast'];
  return [center, 'coast'];
}

function chuteLine(m: Metrics): [number, 'coast' | 'brake'] {
  const x = Number(m.pisteGuideX);
  const corner = Number(m.pisteHalfWidth) < 11.3 || Number(m.pisteAheadWidth) < 11.5 ||
    Math.abs(x - Number(m.pisteCenter)) > 4.8;
  return [x, corner ? 'brake' : 'coast'];
}

function slideLine(m: Metrics): [number, 'coast'] {
  return [Number(m.sectionCenter) + Number(m.safeSide) * (Number(m.safeEdge) + 7) *
    Number(m.avalanche !== 'quiet'), 'coast'];
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
      if (remaining < 94) return [center + lane * LANE_SPACING, 'coast'];
      if (trail === 'pine' && Math.abs(Number(m.worldY) - Number(m.gladeY)) < 86) return pineLine(m, false);
      if (trail === 'gate' && Number(m.nextGateY) > 0) return [Number(m.nextGateX), 'coast'];
      if (trail === 'air') {
        const bypass = localY > 184;
        return [center + (bypass ? 26 : 0), localY < 182 ? 'tuck' : 'coast'];
      }
      if (trail === 'chute') {
        return chuteLine(m);
      }
      if (trail === 'avalanche' && Number(m.wavesCleared) < Number(m.waveCount) ||
        trail === 'avalanche' && Number(m.worldY) < Number(m.waveTrigger) + 135) {
        return slideLine(m);
      }
      return [Number(m.pisteAheadX), 'tuck'];
    };
    if (index < 5) {
      const signature = (m: Metrics) => {
        if (trail === 'pine') return Number(m.worldY) > Number(m.gladeY) - 14;
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
  for (const scenic of [false, true]) {
    await load('pine', 'encounter');
    await beginDrag();
    const name = scenic ? 'pine-scenic' : 'pine-relaxed';
    let point = await follow((m) => Number(m.worldY) > Number(m.gladeY) - 57, (m) => pineLine(m, scenic));
    await capture(name + '-approach', point);
    point = await follow((m) => Number(m.worldY) > Number(m.gladeY) - 7, (m) => pineLine(m, scenic));
    await capture(name + '-opening', point);
    point = await follow((m) => Number(m.worldY) > Number(m.gladeY) + 50, (m) => pineLine(m, scenic));
    await capture(name + '-rejoin', point);
    await page.mouse.up();
  }

  await load('pine', 'fork');
  await beginDrag();
  const rightGuide = (m: Metrics): [number, 'tuck'] => [
    Number(m.sectionCenter) + (Number(m.sectionEnd) - Number(m.worldY) < 132 ? LANE_SPACING : 0), 'tuck',
  ];
  await capture('fork-first-sight', await follow((m) => Number(m.sectionEnd) - Number(m.worldY) < 151, rightGuide));
  const approach = await follow((m) => Number(m.sectionEnd) - Number(m.worldY) < 35, rightGuide);
  assert.ok(Number(approach.velocityY) > 30);
  await capture('fork-entrances-tuck', approach);
  const right = await follow((m) => m.sectionIndex === 1, rightGuide, 16_000);
  assert.equal(right.lastLane, 1);
  await page.mouse.up();
  await capture('fork-right-tuck', right);

  const legacy = Buffer.from(JSON.stringify({ version: 6, seed, runs: [] })).toString('base64url');
  await page.goto(`${base}/#replay=${legacy}`);
  await page.getByText(/Version 6 replays play on the original Endless Mountain branch/).waitFor();

  await load('gate', 'encounter');
  await beginDrag();
  const slalom = (m: Metrics): [number, 'coast'] => [Number(m.nextGateX), 'coast'];
  let result = await follow((m) => Number(m.gateIndex) >= 4, slalom, 19_000);
  assert.ok(Number(result.gateStreak) >= 3);
  await capture('gate-first-combination', result);
  result = await follow((m) => Number(m.gateIndex) >= 5,
    (m) => [Number(m.sectionCenter) + 28, 'coast'], 12_000);
  assert.equal(result.gateOutcome, 'missed');
  await capture('gate-miss', result);
  result = await follow((m) => Number(m.gateStreak) >= 2 || Number(m.gateIndex) >= 10, slalom);
  assert.ok(Number(result.gateStreak) >= 2);
  await capture('gate-recovery', result);
  result = await follow((m) => Number(m.gateIndex) >= 12, slalom);
  await capture('gate-second-combination', result);
  await page.mouse.up();

  for (const quality of ['medium', 'potato']) {
    await load('air', 'encounter', quality);
    await page.keyboard.down('KeyS');
    result = await waitForMetrics((m) => Number(m.sectionDistance) >= 115);
    await capture('ramp-close-' + quality, result);
    result = await waitForMetrics((m) => Number(m.sectionDistance) >= 155 && m.airborne === 'true');
    await capture('air-clearance-' + quality, result);
    result = await waitForMetrics((m) => Number(m.completedJumpDistance) > 0 || m.crashed === 'true');
    assert.equal(result.crashed, 'false');
    assert.ok(Number(result.completedJumpDistance) > 40);
    await page.keyboard.up('KeyS');
    await capture('air-landing-' + quality, result);
  }

  await load('air', 'encounter');
  result = await waitForMetrics((m) => m.crashed === 'true');
  assert.equal(result.jumpSequence, 1);
  await capture('air-short', result);

  await load('air', 'encounter');
  await beginDrag();
  result = await follow((m) => Number(m.sectionDistance) > 175, (m) =>
    [Number(m.sectionCenter) + 21, 'coast'], 15_000);
  assert.equal(result.jumpSequence, 0);
  await page.mouse.up();
  await capture('air-bypass', result);

  await load('chute', 'encounter');
  await beginDrag();
  await capture('chute-bend-approach', await follow((m) => Number(m.sectionDistance) >= 127, chuteLine));
  await capture('chute-pinch', await follow((m) => Number(m.sectionDistance) >= 180, chuteLine));
  await capture('chute-recovery', await follow((m) => Number(m.sectionDistance) >= 305, chuteLine));
  await page.mouse.up();
  await load('chute', 'encounter');
  await page.keyboard.down('KeyS');
  result = await waitForMetrics((m) => m.crashed === 'true');
  await page.keyboard.up('KeyS');
  await capture('chute-charged-bend', result);
  await chaseEncounters();
}

async function chaseEncounters() {
  await load('avalanche', 'encounter');
  await beginDrag();
  let result = await follow((m) => m.avalanche === 'warning', slideLine);
  await capture('avalanche-warning', result);
  const count = Number(result.waveCount);
  let capturedNpc = false;
  for (let i = 0; i < count; i += 1) {
    result = await follow((m) => m.avalanche === 'chasing' && Number(m.wave) === i &&
      (Number(m.worldY) - Number(m.avalancheFront) < 13 || !capturedNpc && m.npcEngulfedVisible === 'true'),
    slideLine, 25_000);
    if (!capturedNpc && result.npcEngulfedVisible === 'true') {
      await capture('avalanche-npc-engulfed', result);
      capturedNpc = true;
    }
    await capture('avalanche-shift-' + (i + 1), result);
    result = await follow((m) => Number(m.wavesCleared) === i + 1, slideLine, 12_000);
  }
  assert.ok(Number(result.npcEngulfments) > 0, 'Expected NPC engulfment during the same chase');
  await capture('avalanche-all-crossings', result);
  await page.mouse.up();

  await load('avalanche', 'encounter');
  await beginDrag();
  let committed = false;
  result = await follow((m) => Number(m.wavesCleared) === 1, (m) => {
    committed ||= m.avalanche === 'chasing' && Number(m.worldY) - Number(m.avalancheFront) <= 49;
    return committed ? slideLine(m) : [Number(m.sectionCenter), 'coast'];
  }, 20_000);
  await capture('avalanche-late-crossing', result);
  const initialId = result.sectionId;
  const fixedSide = Number(result.worldX);
  await follow((m) => m.avalanche === 'caught', () => [fixedSide, 'coast'], 28_000);
  await page.mouse.up();
  await page.getByRole('button', { name: /Retry Section/ }).waitFor();
  await capture('avalanche-missed-shift', await state());
  await page.getByRole('button', { name: /Retry Section/ }).click();
  result = await waitForMetrics((m) => m.avalanche === 'quiet' && m.crashed === 'false');
  assert.equal(result.sectionId, initialId);
  assert.equal(result.wavesCleared, 0);
  assert.equal(result.npcEngulfments, 0);
  await capture('avalanche-retry', result);

  await page.keyboard.down('KeyS');
  result = await waitForMetrics((m) => m.avalanche === 'caught', 30_000);
  await page.keyboard.up('KeyS');
  assert.equal(result.wavesCleared, 0);
  await capture('avalanche-straight-tuck', result);
  await page.getByRole('button', { name: 'Restart at the Top' }).click();
  result = await waitForMetrics((m) => m.section === 'pine' && m.seed !== seed && m.crashed === 'false');
  await capture('restart-new-seed', result);
}

async function report(page: Page, completed: boolean) {
  const memory = await page.evaluate(() => {
    const heap = Reflect.get(performance, 'memory');
    return heap ? { usedJSHeapSize: heap.usedJSHeapSize, totalJSHeapSize: heap.totalJSHeapSize } : null;
  }).catch(() => null);
  await writeFile(path.join(output, mode + '.json'),
    JSON.stringify({ completed, headless, seed, clockRate: mode === 'replay-tour' ? 6 : clockRate,
      errors, memory, evidence }, null, 2));
}

async function replayTour() {
  const recording = (await readFile(path.join(output, 'tour-5-commit.replay.txt'), 'utf8')).trim();
  const tourReport = JSON.parse(await readFile(path.join(output, 'tour.json'), 'utf8')) as {
    completed: boolean;
    evidence: Metrics[];
  };
  const expected = tourReport.evidence.find((snapshot) => snapshot.name === 'tour-5-commit');
  assert.ok(tourReport.completed && expected, 'Run the complete tour before its replay check.');
  assert.ok(recording.length > 16_384, 'Full descent recording should exceed the server request limit.');
  await accelerateFrames(6);
  await page.goto(`${base}/?quality=potato&dev=1#replay=${recording}`);
  const final = await waitForMetrics((m) => m.crashed === 'true' || m.sectionIndex === 6, 130_000);
  assert.equal(final.crashed, 'false');
  for (const key of ['section', 'sectionId', 'sectionIndex', 'lastLane', 'cleanGates']) {
    assert.equal(final[key], expected[key], `Replay diverged on ${key}`);
  }
  await capture('replay-tour-end', final, false);
}

try {
  await (mode === 'tour' ? tour() : mode === 'replay-tour' ? replayTour() :
    mode === 'chase' ? chaseEncounters() : encounters());
  assert.deepEqual(errors, []);
  await report(page, true);
} catch (error) {
  await capture(mode + '-failure', await state()).catch(() => {});
  await report(page, false);
  throw error;
} finally {
  await browser.close();
}
