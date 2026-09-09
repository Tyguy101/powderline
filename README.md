# Powderline

Powderline is an original browser skiing game: a deterministic downhill run
through a procedurally generated mountain, rendered with WebGPU and Three.js
TSL. It is moving from prototype toward a feature-complete web game, a polished
release candidate, physical-device testing, and eventual mobile/native packaging
investigation. This repository is the technical source of truth for the game.

Powderline's visible game art is procedural shader code and generated geometry.
It does not use downloaded sprites, texture atlases, imported character models,
or external game-art assets. Audio, analytics, native packaging, and final store
assets are intentionally not implemented yet.

## Project locations and source of truth

- Local development: `C:\Users\tyler\Powderline`
- GitHub code and history: [Tyguy101/powderline](https://github.com/Tyguy101/powderline)
- Stable web build: [powderline-lake.vercel.app](https://powderline-lake.vercel.app/)
- Work/backlog: [Linear project — Powderline](https://linear.app/tyler-harris/project/powderline-b7e53d2ce4a1)
- Runtime health: [TyGames Sentry organization](https://tygames.sentry.io), project slug `powderline`; production DSN is configured in Vercel
- Human product and release material: the [Powderline Google Drive repository](https://drive.google.com/drive/folders/1yrUGRQrhTOCgByO1lvuYKu6-WPuUwJzR)

Local is the working copy, GitHub is canonical code/history, Vercel is the
current deployed web build, Linear is actionable work, Sentry is runtime
evidence, and Drive is the human-facing product/release repository. See
[docs/DEVELOPMENT_WORKFLOW.md](./docs/DEVELOPMENT_WORKFLOW.md).

## Run

Requires a current browser with WebGPU enabled and Node.js 22 or newer.

The active local checkout is:

```text
C:\Users\tyler\Powderline
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

Production deploys from GitHub `main` through the persistent Vercel project
`powderline`. Preview deployments are for review only; the stable URL above is
the address to share.

## Controls

- `A` / Left Arrow: carve left
- `D` / Right Arrow: carve right
- `W` / Up Arrow: brake
- `S` / Down Arrow: speed tuck
- Mouse drag horizontally: farther displacement produces a sharper carve
- Touch: place the left thumb anywhere in the left steering zone and move it
  horizontally for analog carving; vertical thumb drift does not change speed
- Touch: hold the right-side `BRAKE` or `TUCK` control while steering with the
  left thumb; releasing the button returns to neutral speed input
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
- `F5`: development NPC laboratory
- Development builds or `?dev=1`: `G` opens the pose inspector
- `?dev=1&cameraTest=1`: procedural scale markers for camera evaluation
- `?dev=1&crashLab=1`: collision visualization and controlled impact testing
- `?dev=1&npcLab=1`: controlled NPC rig, carve, fall, and recovery gallery
- `?dev=1&touchDebug=1`: visualize the steering origin, thumb vector, normalized
  steering value, action state, camera scale, and skier screen position
- `?dev=1&mobileControls=drag`: A/B test the previous combined touch-drag scheme
- `?dev=1&mobileCamera=legacy`: A/B test the previous mobile camera composition

## Verification and measurement

```bash
npm run lint
npm run test
npm run build
npm run benchmark
npm run benchmark:potato
npm run benchmark:mobile
npm run benchmark:matrix
npm run qa:mobile
npm run report
```

Benchmark output is written to `tools/reports/` and intentionally ignored by Git.

The bottom-left status chip includes the eight-character Git build identifier.
The benchmark matrix records CSS size, backing-canvas pixels, DPR, frame
percentiles, long frames, browser errors, and in-game subsystem timings. Current
policy and historical regression evidence are summarized in
[OPTIMIZATION_REPORT.md](./OPTIMIZATION_REPORT.md); commands and thresholds are
in [BENCHMARKING.md](./BENCHMARKING.md).

## Status

The default production build currently includes:

- WebGPU and Three.js TSL rendering with no imported game art
- A shader-drawn skier with interpolated neutral, carve, traverse, brake, tuck,
  airborne, landing, crash, and idle poses
- A wide, camera-relative downhill view with smooth look-ahead and origin
  rebasing. Coarse-pointer landscape play uses an experimental 88-unit camera
  scale and places the skier near the top fifth of the viewport for more warning.
- Deterministic fixed-step simulation at 60 Hz
- Keyboard, pointer, mouse-drag, touch, and standard-layout gamepad controls
  with eight-direction input
- Standing, braking, and manually controlled tuck speeds
- Turn sharpness that builds while steering is held
- Deterministically generated shader-drawn trees, rocks, and red launch ramps
- Three deterministic shader-drawn mountain-user rigs: a tucked speed skier,
  upright snowplow beginner, and sideways snowboarder. A fixed pool keeps three
  to five active (three on low/mobile quality), with independently seeded
  six-color headwear, tops, bottoms, and snowboard-goggle accents. Their bent
  limb rigs interpolate carve, traversal, compression, airborne, fall, slide,
  and recovery poses, alongside deterministic avoidance, passing, snowboard
  ramp hops, and player/NPC/NPC collision reactions.
- CPU circle collisions with minor impacts, stumbles, and full crashes
- Four condition-driven crash families with tree/rock-specific variations,
  impact snow, sliding marks, equipment motion, camera shake, and quick restart
- Speed- and direction-based ramp launches, an arcing airborne path, limited
  aerial steering, a ski-jumper pose, guaranteed landing, and landing slowdown
- A fixed-size GPU instanced circular trail buffer with twin ski grooves,
  carve-strength marks, fading spray, powder shading, and landing bursts
- Deterministic replay serialization and playback
- Pose, camera-scale, collision, crash-laboratory, and NPC-laboratory tools
- F3 metrics, automated tests, screenshot/capture tools, and desktop/mobile
  Playwright benchmarks
- Safe-area-aware phone/tablet HUD, touch pause/resume, independent left steering
  and right action pointer ownership, and predictable background/orientation
  recovery without catch-up
- Player-facing WebGPU startup diagnostics instead of a blank failure screen

The lightweight trail buffer is the production track implementation. A toroidal
persistent snow-mask experiment was tested and then removed from the default
rendering path because its visual benefit did not justify reducing benchmark
performance from approximately 60 FPS to 47 FPS on desktop and 51 FPS on mobile.
That work remains preserved on the
`codex/experimental-toroidal-snow-mask` Git branch. The normal game does not
allocate, update, relax, or sample that persistent texture.

The renderer now uses an evidence-based one-million-pixel canvas budget, tight
instanced obstacle/NPC regions, partial trail uploads, allocation-free rolling
metrics, and startup pipeline prewarming. This prevents high-DPI laptop displays
from silently multiplying fullscreen shader work while keeping the HUD at native
CSS resolution. See [OPTIMIZATION_REPORT.md](./OPTIMIZATION_REPORT.md) for
before/after measurements, subsystem costs, limitations, and future headroom.

The release path is intentionally staged. The current evidence recommends a
Safari/Home Screen web app first and an isolated Capacitor 8 physical-device
spike later; see
[docs/MOBILE_AND_IOS_FEASIBILITY.md](./docs/MOBILE_AND_IOS_FEASIBILITY.md).

The sequence is:

1. feature-complete browser game;
2. polished release candidate;
3. mobile/native packaging feasibility investigation;
4. physical-device testing;
5. beta/TestFlight preparation;
6. App Store submission.

The next product milestone is the menu/app shell. Other work remains tracked in
Linear rather than duplicated here. Known
future areas include progressive mountain difficulty, additional hazards,
scoring/run structure, audio, onboarding, mobile UX, accessibility, and release
QA. The Web → iOS packaging investigation must test WebGPU/WebKit behavior,
controllers, touch, lifecycle, orientation, audio, safe areas, storage,
performance, and App Store rules before a wrapper technology is chosen.

The persistent toroidal snow-mask experiment remains available on the
`codex/experimental-toroidal-snow-mask` branch, but is not part of production.
