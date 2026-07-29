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

Vite binds to `0.0.0.0:5173` and prints both URLs:

- Local: `http://localhost:5173/`
- LAN: `http://<this-computer-ip>:5173/`

Hot reload works at both addresses. If Windows asks, allow Node.js on **Private
networks** only. See [DEPLOYMENT.md](./DEPLOYMENT.md) for Windows Firewall,
LAN WebGPU, and local HTTPS details.

WebGPU requires a secure context. `http://localhost:5173` is treated as secure
on the same computer, but a phone opening `http://<LAN-IP>:5173` will normally
not receive WebGPU. For local HTTPS:

```bash
npm run dev:https
```

The generated certificate is self-signed and must be trusted on each test
device. Production is served over trusted HTTPS.

Use `?seed=424242`, `?quality=potato`, or `?debug=1` to configure a run.

## Production

Powderline is a static Vite application prepared for one persistent Vercel
project named `powderline`.

**Stable production:** [https://powderline-lake.vercel.app](https://powderline-lake.vercel.app)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the GitHub/Vercel workflow. Temporary
Cloudflare Workers are no longer part of development or deployment.

## Controls

- `A` / Left Arrow: carve left
- `D` / Right Arrow: carve right
- `W` / Up Arrow: brake
- `S` / Down Arrow: speed tuck
- Drag horizontally: farther displacement produces a sharper carve
- Drag upward: brake; combine with left/right for a braking turn
- Drag downward: speed tuck; combine with left/right for a slower tuck turn
- `R`: restart after a crash
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

The bottom-left status chip includes the eight-character Git build identifier.

## Status

Implemented: repository skeleton, WebGPU initialization and compatibility handling,
TSL procedural snow, a small pose-driven TSL skier, wide forward-looking camera,
60 Hz fixed simulation, basic carving, braking and tuck, camera-relative rebasing,
deterministic shader-drawn trees and rocks, CPU circle collisions, crash/restart,
replay-link serialization and playback, development pose/scale inspection, F3
metrics, deterministic tests, screenshot capture, and a JSON/Markdown benchmark
report.

Not implemented: clipmaps, GPU compute feature generation, tracks, jumping, gamepad
input, expanded scoring, dynamic quality selection, WebGL 2 fallback, or persistent
deformation. These are later milestones.
