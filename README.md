# Powderline

Powderline is an original, shader-drawn downhill skiing game and the first slice
of a reusable GPU procedural-world engine. The current prototype includes an
endless deterministic mountain, responsive skiing, obstacles and collisions,
procedural crashes, ramps and jumping, persistent-looking lightweight ski tracks,
replay links, and development/measurement tooling.

No image, texture, model, font, or audio assets are used by the game.

## Run

Requires a current browser with WebGPU enabled and Node.js 22 or newer.

The active local checkout is:

```text
C:\Users\tyler\Procedural Games
```

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
- `P` / Escape: pause or resume
- Enter / Space: menu confirmation
- Controller left stick: analog steering; up brakes and down tucks
- Controller triggers or shoulder buttons: brake and tuck
- Controller Menu button: pause or resume
- Controller primary face button: menu confirmation
- Controller top face button: restart after a crash
- `F3`: metrics overlay
- `F4`: development crash laboratory
- Development builds or `?dev=1`: `G` opens the pose inspector
- `?dev=1&cameraTest=1`: procedural scale markers for camera evaluation
- `?dev=1&crashLab=1`: collision visualization and controlled impact testing

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

The default production build currently includes:

- WebGPU and Three.js TSL rendering with no imported game art
- A shader-drawn skier with interpolated neutral, carve, traverse, brake, tuck,
  airborne, landing, crash, and idle poses
- A wide, camera-relative downhill view with smooth look-ahead and origin rebasing
- Deterministic fixed-step simulation at 60 Hz
- Keyboard, pointer, mouse-drag, touch, and standard-layout gamepad controls
  with eight-direction input
- Standing, braking, and manually controlled tuck speeds
- Turn sharpness that builds while steering is held
- Deterministically generated shader-drawn trees, rocks, and red launch ramps
- CPU circle collisions with minor impacts, stumbles, and full crashes
- Four condition-driven crash families with tree/rock-specific variations,
  impact snow, sliding marks, equipment motion, camera shake, and quick restart
- Speed- and direction-based ramp launches, an arcing airborne path, limited
  aerial steering, a ski-jumper pose, guaranteed landing, and landing slowdown
- A fixed-size GPU instanced circular trail buffer with twin ski grooves,
  carve-strength marks, fading spray, powder shading, and landing bursts
- Deterministic replay serialization and playback
- Pose, camera-scale, collision, and crash-laboratory development tools
- F3 metrics, automated tests, screenshot/capture tools, and desktop/mobile
  Playwright benchmarks

The lightweight trail buffer is the production track implementation. A toroidal
persistent snow-mask experiment was tested and then removed from the default
rendering path because its visual benefit did not justify reducing benchmark
performance from approximately 60 FPS to 47 FPS on desktop and 51 FPS on mobile.
That work remains preserved on the
`codex/experimental-toroidal-snow-mask` Git branch. The normal game does not
allocate, update, relax, or sample that persistent texture.

The current restored benchmark baseline is approximately 60 FPS on both the
desktop and mobile automated profiles, with four normal gameplay draw calls.

Planned later milestones include expanded obstacle variety, tricks and
distance/trick scoring, additional ramp and landing behavior, dynamic quality
selection, GPU compute feature generation, clipmaps, and a
future arcade portal. Fully persistent terrain deformation remains experimental.
