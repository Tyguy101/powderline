import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('tools/reports');
const report = JSON.parse(await readFile(path.join(directory, 'benchmark.json'), 'utf8')) as {
  scenario: string;
  quality: string;
  viewport: { width: number; height: number };
  canvasVisible: boolean;
  errors: string[];
  metrics?: { averageMs?: number; fps?: number; onePercentLowFps?: number };
};
const metrics = report.metrics ?? {};
const markdown = `# Powderline benchmark

- Scenario: ${report.scenario}
- Quality: ${report.quality}
- Viewport: ${report.viewport.width} × ${report.viewport.height}
- Canvas visible: ${report.canvasVisible ? 'yes' : 'no'}
- Average frame: ${(metrics.averageMs ?? 0).toFixed(2)} ms
- Average FPS: ${(metrics.fps ?? 0).toFixed(1)}
- Approximate 1% low: ${(metrics.onePercentLowFps ?? 0).toFixed(1)} FPS
- Browser errors: ${report.errors.length}
`;
await writeFile(path.join(directory, 'BENCHMARK.md'), markdown);
console.log(markdown);
