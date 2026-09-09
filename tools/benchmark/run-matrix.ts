import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

interface Profile {
  name: string;
  viewport: string;
  dpr: number;
  quality?: string;
  disable?: string;
  medianBudgetMs: number;
  p95BudgetMs: number;
}

interface BenchmarkResult {
  scenario: string;
  canvas: { pixels: number };
  frameTime: {
    samples: number;
    medianMs: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
    longFrames50ms: number;
  };
  errors: string[];
}

const duration = process.argv.includes('--full') ? 30 : 10;
const profiles: Profile[] = [
  { name: 'desktop', viewport: '1440x900', dpr: 1, medianBudgetMs: 18.5, p95BudgetMs: 25 },
  { name: 'high-dpi-laptop', viewport: '2560x1600', dpr: 1.5, medianBudgetMs: 18.5, p95BudgetMs: 25 },
  { name: 'mobile-portrait', viewport: '390x844', dpr: 2, quality: 'low', medianBudgetMs: 18.5, p95BudgetMs: 25 },
  { name: 'mobile-landscape', viewport: '844x390', dpr: 2, quality: 'low', medianBudgetMs: 18.5, p95BudgetMs: 25 },
  { name: 'empty-snow', viewport: '1920x1080', dpr: 1.5, disable: 'obstacles,npcRender,npcSim,trails,collisions', medianBudgetMs: 18.5, p95BudgetMs: 25 },
  { name: 'five-npcs', viewport: '1920x1080', dpr: 1.5, quality: 'medium', disable: 'collisions', medianBudgetMs: 18.5, p95BudgetMs: 25 },
  { name: 'three-npcs', viewport: '1920x1080', dpr: 1.5, quality: 'low', disable: 'collisions', medianBudgetMs: 18.5, p95BudgetMs: 25 },
  { name: 'heavy-trails', viewport: '1920x1080', dpr: 1.5, disable: 'collisions', medianBudgetMs: 18.5, p95BudgetMs: 25 },
];

const reportDirectory = path.resolve('tools/reports');
await mkdir(reportDirectory, { recursive: true });
const build = spawnSync('npm run build', { stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

const results: Array<BenchmarkResult & { profile: Profile; passed: boolean }> = [];
for (const profile of profiles) {
  const args = [
    'tsx', 'tools/benchmark/run-benchmark.ts',
    `--scenario=${profile.name}`,
    `--viewport=${profile.viewport}`,
    `--dpr=${profile.dpr}`,
    `--duration=${duration}`,
    '--warmup=4',
  ];
  if (profile.quality) args.push(`--quality=${profile.quality}`);
  if (profile.disable) args.push(`--disable=${profile.disable}`);
  const run = spawnSync(`npx ${args.join(' ')}`, { stdio: 'inherit', shell: true });
  if (run.status !== 0) process.exit(run.status ?? 1);
  const fileStem = `${profile.name}-${profile.viewport}-dpr${profile.dpr}`.replaceAll('.', '_');
  const result = JSON.parse(
    await readFile(path.join(reportDirectory, `${fileStem}.json`), 'utf8'),
  ) as BenchmarkResult;
  const longFrameRate = result.frameTime.longFrames50ms / Math.max(1, result.frameTime.samples);
  const passed = result.errors.length === 0 &&
    result.frameTime.medianMs <= profile.medianBudgetMs &&
    result.frameTime.p95Ms <= profile.p95BudgetMs &&
    longFrameRate <= 0.01;
  results.push({ ...result, profile, passed });
}

const summary = {
  generatedAt: new Date().toISOString(),
  durationSeconds: duration,
  thresholds: {
    medianRegression: '10%',
    percentileRegression: '15%',
    absoluteBudgets: 'median <= 18.5 ms, p95 <= 25 ms, >50 ms frames <= 1%',
  },
  profiles: results.map((result) => ({
    name: result.profile.name,
    pixels: result.canvas.pixels,
    medianMs: result.frameTime.medianMs,
    p95Ms: result.frameTime.p95Ms,
    p99Ms: result.frameTime.p99Ms,
    maxMs: result.frameTime.maxMs,
    longFrames50ms: result.frameTime.longFrames50ms,
    passed: result.passed,
  })),
};
await writeFile(
  path.join(reportDirectory, 'performance-matrix.json'),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
