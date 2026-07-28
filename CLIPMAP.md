# Clipmap plan

The clipmap is intentionally not implemented in this first execution.

The planned controller owns four configurable toroidal levels at 16, 32, 64, and
128 world-unit cells. Crossing a boundary will update only exposed rows and
columns. Level 0 will also maintain deterministic CPU collision descriptors.
GPU buffers will always use camera-relative positions while CPU logical positions
remain safe at extreme travel distances.

Instrumentation will report regenerated cells, dispatches, feature counts, and
estimated storage per level.
