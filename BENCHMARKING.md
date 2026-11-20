# Benchmarking

The benchmark accepts realistic resolution and browser controls:

```bash
npx tsx tools/benchmark/run-benchmark.ts --viewport=2560x1600 --dpr=1.5 --duration=30 --warmup=5
npx tsx tools/benchmark/run-benchmark.ts --browser=edge --backend=default
npx tsx tools/benchmark/run-benchmark.ts --disable=npcRender --scenario=without-npcs
npm run benchmark:matrix
npm run benchmark:matrix:full
```

Reports under `tools/reports/` include CSS and backing dimensions, physical
pixel count, DPR, browser/backend, median/P95/P99/max frame time, long-frame
counts, and in-game subsystem timings. See [OPTIMIZATION_REPORT.md](./OPTIMIZATION_REPORT.md)
for the current baseline, thresholds, and interpretation guidance.

`npm run benchmark` builds on a production preview, launches Chromium with WebGPU
enabled, opens a fixed seed and quality preset, plays a fixed input sequence,
records runtime metrics and browser errors, verifies canvas visibility, and saves
a named screenshot plus JSON.

Endless Mountain can target an authored encounter or fork while using the
same production preview and frame sampler. `--section` selects a trail and
`--start=fork` or `--start=encounter` selects its approach. `--drive=tuck` holds
the regular tuck key. To sample the moving avalanche during its visible chase,
use `--seed=1729 --section=avalanche --start=encounter --drive=tuck --avalanche=chasing
--lead=26 --duration=4`. The sampler waits until the phase and lead criteria
are satisfied before counting frames.

`npm run report` converts the latest JSON result into Markdown. Potato and mobile
scripts select fixed viewport and quality combinations. Generated PNG and report
files are development diagnostics and are not committed as game assets.

The matrix is the current regression gate for the web build. Treat the reported
P95/P99 and long-frame counts as pacing evidence, not as a direct GPU timer:
browser compositor and driver scheduling can still affect a real device. For a
release candidate, run the matrix plus at least one physical desktop and one
physical mobile browser session, record the device/browser/backend, and attach
the results to the corresponding Linear QA issue.
