# Benchmarking

`npm run benchmark` builds on a production preview, launches Chromium with WebGPU
enabled, opens a fixed seed and quality preset, plays a fixed input sequence,
records runtime metrics and browser errors, verifies canvas visibility, and saves
a named screenshot plus JSON.

`npm run report` converts the latest JSON result into Markdown. Potato and mobile
scripts select fixed viewport and quality combinations. Generated PNG and report
files are development diagnostics and are not committed as game assets.

This initial harness is a measurement skeleton. Baseline comparison thresholds,
long-task observation, blank-frame pixel analysis, and the full scenario matrix
remain future work.
