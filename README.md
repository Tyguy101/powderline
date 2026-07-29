# Powderline

Powderline is an original, shader-drawn downhill skiing playground and the first
slice of a reusable GPU procedural-world engine. The current build is deliberately
small: an endless mathematical snowfield, a procedural skier, fixed-step movement,
camera-relative coordinates, input, and measurement tooling.

No image, texture, model, font, or audio assets are used by the game.

## Run

Requires a current browser with WebGPU enabled and Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the displayed local address. Use `?seed=424242`, `?quality=potato`, or
`?debug=1` to configure a run.

## Controls

- `A` / Left Arrow: carve left
- `D` / Right Arrow: carve right
- `S` / Down Arrow: brake
- `W` / Up Arrow: speed tuck
- Drag horizontally: steer on pointer and touch devices
- Press or hold near the bottom of the screen: brake
- `F3`: metrics overlay
- Development builds or `?dev=1`: `G` opens the pose inspector
- `?dev=1&cameraTest=1`: procedural scale markers for camera evaluation

## Verification and measurement

```bash
npm run lint
npm run test
npm run build
npm run benchmark
npm run benchmark:potato
npm run benchmark:mobile
npm run report
```

Benchmark output is written to `tools/reports/` and intentionally ignored by Git.

## Status

Implemented: repository skeleton, WebGPU initialization and compatibility handling,
TSL procedural snow, a small pose-driven TSL skier, wide forward-looking camera,
60 Hz fixed simulation, basic carving, braking and tuck, camera-relative rebasing,
development pose/scale inspection, F3 metrics, deterministic tests, screenshot
capture, and a JSON/Markdown benchmark report.

Not implemented: obstacles, collisions, clipmaps, GPU compute feature generation,
tracks, jumping, gamepad input, scoring, dynamic quality selection, WebGL 2 fallback,
or persistent deformation. These are later milestones.
