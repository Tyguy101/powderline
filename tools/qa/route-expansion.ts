import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createSection, skiBand, type MountainScenario, type Trail } from '../../src/world/EndlessMountain';

const output = 'tools/reports/route-expansion';
const base = process.env.POWDERLINE_QA_URL ?? 'http://127.0.0.1:5173';
const seed = Number(process.argv.find((arg) => arg.startsWith('--seed='))?.split('=')[1] ?? 1729);
const mode = process.argv.includes('--tour') ? 'tour' : process.argv.includes('--replay') ? 'replay' : 'encounters';
const focus = process.argv.find((arg) => arg.startsWith('--focus='))?.split('=')[1];
const quality = process.argv.includes('--potato') ? 'potato' : 'medium';
const mobile = process.argv.includes('--mobile');
const headless = !process.argv.includes('--headed');
const rate = mode === 'tour' ? 2 : mode === 'replay' ? 7 : 1;
const width = mobile ? 667 : quality === 'potato' ? 1280 : 1440;
const height = mobile ? 375 : quality === 'potato' ? 720 : 900;
const browser = await chromium.launch({ channel: 'chrome', headless, args: ['--enable-unsafe-webgpu'] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1,
  hasTouch: mobile, isMobile: mobile });
const page = await context.newPage();
const errors: string[] = [];
const evidence: Array<Record<string, unknown>> = [];
const filename = [mode, focus, mobile ? 'mobile' : quality === 'potato' ? 'potato' : undefined].filter(Boolean).join('-');
await mkdir(output, { recursive: true });

type Metrics = Record<string, number | string>;
type Speed = 'coast' | 'brake' | 'tuck';
type Rider = { x: number; y: number; velocityY: number };
type Pilot = (m: Metrics) => [number, Speed];

if (rate > 1) await page.addInitScript((scale) => {
  const native = window.requestAnimationFrame.bind(window);
  let origin: number | undefined;
  window.requestAnimationFrame = (callback) => native((now) => {
    origin ??= now;
    callback(origin + (now - origin) * scale);
  });
}, rate);
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', (request) => {
  if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(base).origin) errors.push(request.url());
});

let ridersAhead: Rider[] = [];
async function metrics(): Promise<Metrics> {
  const result = await page.evaluate((trackTraffic) => ({
    state: Reflect.get(globalThis, '__POWDERLINE_METRICS__'),
    riders: trackTraffic ? Reflect.get(globalThis, '__POWDERLINE_RIDERS__')?.() : undefined,
  }), mode === 'tour');
  ridersAhead = result.riders ?? [];
  return result.state ?? {};
}

async function load(trail: Trail, scenario: MountainScenario = 'encounter'): Promise<void> {
  await page.goto(`${base}/?seed=${seed}&section=${trail}&scenario=${scenario}&dev=1&qaTelemetry&quality=${quality}`);
  await page.waitForFunction((expected) => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.section === expected, trail);
}

async function capture(name: string, m: Metrics, withReplay = true): Promise<void> {
  const suffix = mobile ? '-mobile' : quality === 'potato' ? '-potato' : '';
  const shot = name + suffix;
  if (mode !== 'tour' || name === 'tour-5-commit' || name.endsWith('failure')) {
    await page.screenshot({ path: `${output}/${shot}.png` });
  }
  const replay = withReplay && await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_REPLAY__')?.());
  if (replay) await writeFile(`${output}/${shot}.replay.txt`, replay);
  const heap = await page.evaluate(() => (Reflect.get(performance, 'memory')?.usedJSHeapSize ?? 0) / 1048576);
  evidence.push({ name, ...m, heapMiB: heap });
  console.log(shot, m.section, m.sectionIndex, Number(m.sectionDistance).toFixed(1), m.hazardImpact, m.timer);
}

async function startDrag(): Promise<void> {
  await page.mouse.move(width / 2, height * 0.52);
  await page.mouse.down();
}

async function ride(until: (m: Metrics) => boolean, pilot?: Pilot, timeout = 105_000): Promise<Metrics> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const m = await metrics();
    if (!m.section) {
      await page.waitForTimeout(52);
      continue;
    }
    if (until(m)) return m;
    assert.equal(m.crashed, 'false', JSON.stringify(m));
    if (pilot) {
      const [x, speed] = pilot(m);
      const forkApproach = mode === 'tour' && Number(m.sectionEnd) - Number(m.worldY) < 212;
      const damping = forkApproach ? 1.35 : mobile ? 0.95 : 0.60;
      const gain = forkApproach ? 0.115 : mobile ? 0.16 : 0.14;
      const lateral = Math.max(-1, Math.min(1, (x - Number(m.worldX) - Number(m.velocityX) * damping) * gain));
      const range = Math.max(92, Math.min(180, width * 0.22));
      await page.mouse.move(width / 2 + lateral * range, height * 0.52 + (speed === 'coast' ? 0 : speed === 'brake' ? -76 : 76));
    }
    await page.waitForTimeout(52);
  }
  throw new Error('Ride timed out: ' + JSON.stringify(await metrics()));
}

function sectionFrom(m: Metrics) {
  return createSection({ lane: 0, id: Number(m.sectionId), trail: m.section as Trail, variant: Number(m.sectionVariant) },
    Number(m.sectionIndex), Number(m.sectionCenter), Number(m.sectionStart));
}

function road(m: Metrics, side: -1 | 1): [number, Speed] {
  const section = sectionFrom(m);
  const y = Number(m.worldY);
  const next = y + Math.min(13, Number(m.velocityY) * 0.54 + 2.2);
  const band = skiBand(section, section.center + side * 100, next);
  const split = section.expansion.patrol.find((item) => y >= item.entry - 34 && y < item.merge);
  return [(band.left + band.right) / 2, side < 0 && split ? 'brake' : 'coast'];
}

function slalom(m: Metrics): [number, Speed] {
  return [m.timer === 'running' ? Number(m.timedAim) : Number(m.sectionCenter), 'coast'];
}

function hazards(m: Metrics, tempting: boolean): [number, Speed] {
  const section = sectionFrom(m);
  const { ice, boulders } = section.expansion;
  const sign = Math.sign(ice[1]!.x - section.center);
  const y = Number(m.worldY);
  const side = y < boulders[2]!.start - 67 ? sign * (tempting ? 22 : -15) : 0;
  return [section.center + side, 'tuck'];
}

async function sun(): Promise<void> {
  await load('sun');
  const flat: Pilot = (m) => [Number(m.sectionCenter), 'coast'];
  await startDrag();
  await capture('sun-reveal', await ride((m) => Number(m.worldY) > Number(m.bowlReveal) - 11, flat));
  await capture('sun-open-snow', await ride((m) => Number(m.sectionDistance) >= 288, flat));
  const start = Number((await metrics()).worldY);
  await capture('sun-long-carve', await ride((m) => Number(m.worldY) > start + 108,
    (m) => [Number(m.sectionCenter) + 37, 'coast']));
  await page.mouse.up();
}

async function patrol(): Promise<void> {
  for (const side of [-1, 1] as const) {
    await load('patrol');
    await startDrag();
    const name = side < 0 ? 'patrol-tight' : 'patrol-wide';
    const pilot: Pilot = (m) => {
      const [x, speed] = road(m, side);
      return [x, mobile ? 'brake' : speed];
    };
    const first = await metrics();
    const gate = Number(first.patrolEntryY);
    await capture(name + '-approach', await ride((m) => Number(m.worldY) >= gate - 40, pilot));
    const interior = await ride((m) => Number(m.patrolLane) !== 0, pilot);
    assert.equal(interior.patrolLane, side);
    await capture(name + '-inside', interior);
    await capture(name + '-merge', await ride((m) => Number(m.patrolMerges) >= 1, pilot));
    await page.mouse.up();
  }
}

async function traffic(): Promise<void> {
  await load('busy');
  await startDrag();
  let peak = 0;
  let threaded = false;
  let passed = 0;
  const passedSlots = new Set<number>();
  const end = Date.now() + 33_000;
  while (Date.now() < end) {
    const m = await metrics();
    assert.equal(m.crashed, 'false', JSON.stringify(m));
    peak = Math.max(peak, Number(m.npcActive));
    const riders = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_RIDERS__')?.() ?? []);
    const x = Number(m.worldX);
    const y = Number(m.worldY);
    const near = riders.filter((npc: { x: number; y: number }) => Math.abs(npc.y - y) < 16 && Math.abs(npc.x - x) < 17);
    if (!threaded && near.some((npc: { x: number }) => npc.x < x - 1.5) &&
        near.some((npc: { x: number }) => npc.x > x + 1.5)) {
      threaded = true;
      await capture('busy-moving-gap', m);
    }
    const trails = [-18, -11, -4, 4, 10, 17, 25];
    const nearby = riders.filter((npc: { y: number }) => npc.y >= y - 3 && npc.y < y + 44);
    let bestTarget = 5;
    let best = -Infinity;
    for (const option of trails) {
      const candidate = Number(m.sectionCenter) + option;
      const clearance = Math.min(13, ...nearby.map((npc: { x: number; y: number }) =>
        Math.abs(npc.x - candidate) + Math.max(0, npc.y - y) * 0.044));
      const value = clearance - Math.abs(x - candidate) * 0.23 - Math.abs(option) * 0.18;
      if (value > best) { best = value; bestTarget = candidate; }
    }
    for (const npc of near) {
      if (npc.y < y && !passedSlots.has(npc.slot)) { passedSlots.add(npc.slot); passed += 1; }
    }
    if (threaded && passed >= 2 && y > 300) break;
    const approach = Math.max(-1, Math.min(1, (bestTarget - x - Number(m.velocityX) * 0.64) * 0.14));
    await page.mouse.move(width / 2 + approach * Math.min(180, width * 0.19), height * 0.52 + 76);
    await page.waitForTimeout(62);
  }
  await page.mouse.up();
  const gap = await metrics();
  await capture('busy-pass', gap);
  assert.ok(threaded && passed >= 2, `Moving gap proof only passed ${passed} riders.`);
  assert.equal(peak, quality === 'potato' ? 10 : 16);
  await load('busy');
  await startDrag();
  const shoulder: Pilot = (m) => [Number(m.sectionCenter) + (Number(m.sectionDistance) >= 125 ? 43 : 0), 'tuck'];
  await capture('busy-wide-bypass', await ride((m) => Number(m.sectionDistance) >= 348, shoulder));
  await page.mouse.up();
}

async function speed(): Promise<void> {
  await load('speed');
  await startDrag();
  await capture('speed-start', await ride((m) => Number(m.timedStartY) - Number(m.worldY) < 31, slalom));
  const clean = await ride((m) => m.timer === 'finished', slalom);
  assert.equal(clean.timedMisses, 0);
  assert.equal(clean.timedOutside, 'false');
  await capture('speed-clean-finish', clean);
  const replay = await page.evaluate(() => Reflect.get(globalThis, '__POWDERLINE_REPLAY__')?.());
  assert.ok(replay);
  const out = await ride((m) => Number(m.worldY) > Number(m.timedFinishY) + 104, slalom);
  assert.ok(Number(out.velocityY) < 22.5);
  await capture('speed-ordinary-exit', out);
  await page.mouse.up();
  await page.goto(`${base}/?quality=potato#replay=${replay}`);
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.section === 'speed');
  const replayed = await ride((m) => m.timer === 'finished');
  assert.equal(replayed.timedMs, clean.timedMs);
  assert.equal(replayed.timedMisses, 0);
  evidence.push({ name: 'timed-replay', ...replayed });
  await load('speed');
  await page.keyboard.down('KeyS');
  const dirty = await ride((m) => m.timer === 'finished');
  await page.keyboard.up('KeyS');
  assert.ok(Number(dirty.timedMisses) > 0);
  await capture('speed-missed-flags', dirty);
}

async function dangerous(): Promise<void> {
  await load('hazards');
  await startDrag();
  const pilot: Pilot = (m) => hazards(m, true);
  await capture('hazards-shadow-and-rock', await ride((m) => m.iceActive === 'true' && m.boulderActive === 'true' &&
    Number(m.iceY) - Number(m.worldY) < 43 && Number(m.iceTime) > 0.8, pilot));
  await capture('hazards-combined-impact-dodge', await ride((m) => m.iceActive === 'true' && Number(m.iceTime) < -0.05, pilot));
  await capture('hazards-three-clear', await ride((m) => Number(m.boulderPasses) >= 3 && Number(m.icePasses) >= 3, pilot));
  await page.mouse.up();

  await load('hazards');
  await page.keyboard.down('KeyS');
  const crashed = await ride((m) => m.crashed === 'true');
  assert.equal(crashed.hazardImpact, 'boulder');
  await page.keyboard.up('KeyS');
  await page.getByRole('button', { name: /Retry Section/ }).waitFor();
  await capture('hazards-straight-tuck-caught', await metrics());

  await load('hazards');
  await startDrag();
  const combinedCrash = await ride((m) => m.crashed === 'true', (m) => [Number(m.iceX), 'tuck']);
  await page.mouse.up();
  assert.equal(combinedCrash.hazardImpact, 'ice');
  assert.equal(combinedCrash.boulderActive, 'true');
  await page.getByRole('button', { name: /Retry Section/ }).waitFor();
  await capture('hazards-combined-crash', await metrics());
  await page.getByRole('button', { name: /Retry Section/ }).click();
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.crashed === 'false');
  const reset = await metrics();
  assert.equal(reset.sectionId, combinedCrash.sectionId);
  assert.equal(reset.iceActive, 'false');
  assert.equal(reset.boulderActive, 'false');
  await startDrag();
  const recovered = await ride((m) => Number(m.boulderPasses) >= 1 && Number(m.icePasses) >= 1,
    (m) => hazards(m, false));
  await capture('hazards-successful-retry', recovered);
  await page.mouse.up();

  await load('hazards', 'ice');
  await startDrag();
  const tooLate = await ride((m) => m.crashed === 'true', (m) =>
    [Number(m.sectionCenter) + (m.iceActive === 'true' && Number(m.iceTime) < 0.12 ? 12 : 0), 'tuck']);
  assert.equal(tooLate.hazardImpact, 'ice');
  await page.mouse.up();
  await capture('hazards-late-ice-hit', tooLate);
  await page.getByRole('button', { name: 'Restart at the Top' }).click();
  await page.waitForFunction((original) => {
    const m = Reflect.get(globalThis, '__POWDERLINE_METRICS__');
    return m?.section === 'pine' && m.seed !== original;
  }, seed);
  await capture('hazards-new-descent', await metrics());
}

const route = [
  ['pine', 1, 'sun'], ['sun', -1, 'patrol'], ['patrol', -1, 'speed'],
  ['speed', -1, 'hazards'], ['hazards', 1, 'busy'], ['busy', 1, 'sun'],
] as const;

function trafficAware(m: Metrics, target: number, speed: Speed, lane: number, narrow: boolean): [number, Speed] {
  const y = Number(m.worldY);
  const x = Number(m.worldX);
  const center = Number(m.sectionCenter);
  const vx = Number(m.velocityX);
  const vy = Number(m.velocityY);
  const distance = Number(m.sectionEnd) - y;
  const conflict = ridersAhead.find((npc) => {
    const closing = vy - npc.velocityY;
    const separation = npc.y - y;
    if (closing <= 1.5 || separation <= 0 || separation > 30) return false;
    const horizon = Math.min(1.6, separation / closing);
    const expectedX = x + (target - x) * Math.min(0.60, horizon * 0.4) + vx * horizon * 0.26;
    return separation < closing * 1.8 && Math.abs(npc.x - expectedX) < 5;
  });
  if (!conflict) return [target, speed];
  if (narrow) return [target, 'brake'];
  const alternate = target + (conflict.x > target ? -4 : 4);
  const laneSafe = distance >= 45 || (alternate - center) * lane > 13;
  return [laneSafe ? alternate : target, 'brake'];
}

async function tour(): Promise<void> {
  await load('pine', 'summit');
  await startDrag();
  for (const [i, [trail, lane, destination]] of route.entries()) {
    const routeLine: Pilot = (m) => {
      const center = Number(m.sectionCenter);
      const y = Number(m.worldY);
      const distance = Number(m.sectionEnd) - y;
      if (distance < (trail === 'patrol' ? 101 : trail === 'busy' ? 220 : 177)) {
        return [center + lane * 18, 'coast'];
      }
      if (trail === 'patrol') return road(m, 1);
      if (trail === 'speed') return slalom(m);
      if (trail === 'hazards') return hazards(m, false);
      if (trail === 'busy') return [center + (Number(m.sectionDistance) > 127 ? 43 : 0), 'tuck'];
      if (trail === 'pine' && Math.abs(y - Number(m.gladeY)) < 55) return [center + Number(m.gladeSide) * 12, 'coast'];
      return [center, trail === 'sun' ? 'coast' : 'tuck'];
    };
    const pilot: Pilot = (m) => {
      const [target, speed] = routeLine(m);
      if (trail === 'hazards') return [target, speed];
      const narrow = trail === 'patrol' || trail === 'speed' && m.timer === 'running';
      return trafficAware(m, target, speed, lane, narrow);
    };
    const approach = await ride((m) => Number(m.sectionEnd) - Number(m.worldY) <= 47, pilot);
    await capture(`tour-${i}-approach`, approach);
    const next = await ride((m) => Number(m.sectionIndex) === i + 1, pilot, 16_000);
    assert.equal(next.section, destination);
    assert.equal(next.lastLane, lane);
    assert.equal(next.retainedSections, 2);
    await capture(`tour-${i}-commit`, next);
  }
  await page.mouse.up();
}

async function replayTour(): Promise<void> {
  const record = (await readFile(`${output}/tour-5-commit.replay.txt`, 'utf8')).trim();
  const prior = JSON.parse(await readFile(`${output}/tour.json`, 'utf8')) as { evidence: Metrics[]; completed: boolean };
  const expected = prior.evidence.find((m) => m.name === 'tour-5-commit');
  assert.ok(expected && prior.completed);
  await page.goto(`${base}/?quality=potato#replay=${record}`);
  await page.waitForFunction(() => Reflect.get(globalThis, '__POWDERLINE_METRICS__')?.section === 'pine');
  const result = await ride((m) => Number(m.sectionIndex) === 6, undefined, 140_000);
  for (const key of ['sectionId', 'sectionIndex', 'lastLane', 'cleanGates']) assert.equal(result[key], expected[key], key);
  await capture('tour-reproduced', result, false);
}

let completed = false;
try {
  if (mode === 'tour') await tour();
  else if (mode === 'replay') await replayTour();
  else {
    for (const [scene, check] of Object.entries({ sun, patrol, busy: traffic, speed, hazards: dangerous })) {
      if (!focus || focus === scene) await check();
    }
  }
  assert.deepEqual(errors, []);
  completed = true;
} catch (error) {
  await capture(filename + '-failure', await metrics()).catch(() => {});
  throw error;
} finally {
  await writeFile(`${output}/${filename}.json`, JSON.stringify({
    seed, completed, rate, headless, mobile, quality: mode === 'replay' ? 'potato' : quality, errors, evidence,
  }, null, 2));
  await browser.close();
}
