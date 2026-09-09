# Powderline QA handoff

## Current milestone

Landscape mobile physical-playability experiment. This iteration tests a camera
composition designed for landscape and independent two-thumb controls. It does
not lock orientation, remove portrait, alter skiing physics, or declare the
mobile control question solved. Physical-device feedback remains the decision
gate before the next gameplay milestone.

## Code and deployment identity

- Starting Git SHA: `8e36e1efbe0649372d0113bf3e06e2778e3feb1c`
- Ending implementation SHA: `483ba6a8aa2999ecc59fcf9408a8439dbd1434de`
- Git branch: `main`; the documentation handoff commit is the direct successor
  to the implementation SHA and its final tip must be verified with
  `git rev-parse HEAD`.
- GitHub: https://github.com/Tyguy101/powderline
- Stable production: https://powderline-lake.vercel.app/
- Deterministic QA seed: `424242`

## Mobile systems changed

- Coarse-pointer landscape viewports now use an 88-world-unit vertical camera,
  with the skier targeting 15–20% down from the top after the framing settles.
  The measured downhill view is about 70 m: approximately 5.9 s at initial speed,
  3.2 s at standing speed, and 2.1 s at maximum tuck speed.
- The left 70% of the canvas is an invisible relative steering zone. Each touch
  establishes its own neutral point; an 8 px dead zone suppresses drift, a curved
  analog response reaches a hard carve at a viewport-scaled 76–112 px, vertical
  movement is ignored, and near-neutral movement gently recenters the origin.
- Large safe-area-aware hold controls on the right independently activate BRAKE
  and TUCK. A dedicated steering pointer and action pointer can change and release
  without stealing one another. Dragging the action finger away returns to neutral;
  sliding directly between controls switches modes without toggling.
- Keyboard, mouse-drag, gamepad, normalized replay input, deterministic 60 Hz
  simulation, skiing physics, collisions, NPCs, and portrait camera behavior are
  unchanged.
- Development A/B options preserve the old touch gesture (`?dev=1&mobileControls=drag`)
  and old mobile camera (`?dev=1&mobileCamera=legacy`). `?dev=1&touchDebug=1`
  visualizes touch origin/vector/state; F3 exposes camera and input diagnostics.

The lifecycle and compatibility foundation from the prior milestone remains:

- Added a reusable lifecycle manager for visibility, page hide/show, focus loss,
  orientation, and visual-viewport changes.
- Backgrounding now clears held input, pauses the run, stops the animation/render
  loop, and resets fixed-step time before returning to an explicit resume prompt.
  A 30-second interruption cannot become a catch-up burst.
- Manual pause leaves the lightweight input loop available but renders one frozen
  frame rather than continuously submitting the WebGPU scene.
- Touch pointers clear safely on cancellation, lost capture, and lifecycle loss.
- Keyboard, pointer, touch, gamepad, and replay still converge on the same
  normalized `{ steer, brake, tuck }` fixed-step input. Physics and replay format
  are unchanged.
- Added touch-specific help, input diagnostics in F3, and 44 px pause/resume and
  crash-action targets.
- Added safe-area variables, dynamic viewport height, narrow-landscape styling,
  scroll/selection/callout suppression, and canvas sizing from its CSS surface.
- Fixed the prior invisible compatibility page. Unsupported, insecure-context,
  and renderer-initialization failures now show a player-facing explanation,
  technical detail, and retry action without interpolating raw errors as HTML.
- Sentry runtime context now includes secure-context, orientation, visibility,
  and canvas-size facts, with no replay/input collection or default PII enabled.

## Automated viewport and lifecycle matrix

`npm run qa:mobile` uses production WebGPU in desktop Chromium with mobile input
emulation. It is not iOS or physical-device evidence.

| Simulated profile | DPR | Initial backing canvas | Rotated backing canvas | Result |
| --- | ---: | ---: | ---: | --- |
| Small phone 320×568 → 568×320 | 2 | 480×852 (0.41 MP) | 852×480 (0.41 MP) | Pass |
| Tall phone 430×932 → 932×430 | 3 | 645×1398 (0.90 MP) | 1398×645 (0.90 MP) | Pass |
| Tablet 820×1180 → 1180×820 | 2 | 833×1199 (1.00 MP) | 1199×833 (1.00 MP) | Pass |
| Narrow landscape 667×375 → 375×667 | 2 | 1000×562 (0.56 MP) | 562×1000 (0.56 MP) | Pass |

Every profile passed canvas fill, one-megapixel policy, scrolling suppression,
touch help, 44 px pause/resume controls, 70+ px BRAKE/TUCK controls, pause
freeze/resume, background return, live rotation, rotation while paused, and
browser-console review. The QA sequence also proved simultaneous steering +
BRAKE, steering direction changes while braking, BRAKE → TUCK while steering,
independent finger release, and vertical steering-thumb drift. Landscape profiles
activated the 88-unit camera and measured the skier in the 15–21% target band.
The separate unsupported-WebGPU case showed a visible useful compatibility card.

## Performance before and after

Same-machine 1440×900 production benchmark evidence:

- Before (`8609a47`, consolidation smoke): 58.83 reported FPS, 16.70 ms median,
  16.80 ms P95, one >50 ms long frame, about 1.00 MP.
- After (`5270f9d` source, benchmark built before commit identifier advanced):
  59.91 FPS, 16.70 ms median, 16.90 ms P95, zero >50 ms frames, about 1.00 MP.
- After simulated phone 390×844 low quality: 60.12 FPS, 16.70 ms median,
  16.90 ms P95, zero >25 ms frames, 0.33 MP.
- Two-thumb experiment desktop 1440×900: 59.90 FPS, 16.70 ms median, 17.00 ms
  P95, zero >50 ms frames, about 1.00 MP.
- Two-thumb experiment simulated phone 390×844 low quality: 59.40 FPS, 16.70 ms
  median and 17.00 ms P95. One isolated 100 ms frame occurred in headless Chrome;
  steady-state percentiles did not regress.

The mobile foundation showed no measurable steady-state regression. CPU
simulation remained below 0.15 ms average in these runs. These are headless
Chrome measurements, not mobile GPU, thermal, or battery evidence.

## Validation completed

- `npm run lint`
- `npm test` — 33 tests in 10 files
- `npm run build`
- `npm run qa:mobile` — four profiles plus unsupported-WebGPU case
- Desktop 1440×900 and simulated phone 390×844 benchmarks
- `npm run dev` verified Local and Network HTTP addresses on port 5173
- `npm run dev:https` verified Local and Network HTTPS addresses on port 5173
- LAN HTTP check at `192.168.4.190` confirmed `isSecureContext=false`,
  `navigator.gpu` unavailable, and the compatibility message visible
- Browser screenshots and console review: no page or console errors

## Physical-device evidence

No physical iPhone, iPad, or Android device was available to Codex. No physical
result has been fabricated. Tyler must complete the matrix in
`docs/PHYSICAL_DEVICE_QA.md`, including real WebGPU startup, control feel, edge
gestures, safe areas, background/lock/call interruptions, controller reconnect,
10–20 minute frame pacing, thermals, battery, and memory.

The Windows helper `npm run setup:https` requires mkcert (not installed on the
development PC during this milestone), creates an ignored LAN-valid certificate,
and documents the iOS root-CA trust step. The untrusted Vite certificate remains
a desktop fallback.

### Tyler's focused landscape play check

1. Hold a long left carve in neutral.
2. Hold a long right carve.
3. Carve while holding TUCK.
4. Carve while holding BRAKE.
5. Rapidly change directions while tucked.
6. Brake suddenly while already turning.
7. Switch BRAKE → TUCK while continuously steering.
8. Judge whether the skier/camera provides enough downhill warning in landscape.
9. Judge whether the skier is too small, too large, too high, or too low.
10. Note whether either thumb obscures important gameplay.

## iOS feasibility outcome

- Recommendation: excellent Safari/Home Screen web app first; isolated Capacitor
  8 physical-device spike later, bundling `dist` rather than loading Vercel.
- Practical target floor: iOS/iPadOS 26 because Powderline has no WebGL fallback
  and WebGPU is enabled by default in Safari 26.
- Orientation: landscape-first, portrait-supported. Portrait remains functional
  but offers substantially less lateral terrain visibility.
- Windows can own gameplay/web work. Native compilation, signing, provisioning,
  TestFlight, and submission require macOS/Xcode, Apple Developer membership,
  and physical Apple devices. A Mac remains necessary for interactive debugging;
  cloud CI can automate later builds but cannot replace that work.
- No wrapper branch was created because the remaining go/no-go questions require
  real WKWebView hardware, not a Windows-only scaffold.

## Sentry, Linear, and Drive

- Sentry `TyGames/powderline` was empty before the milestone. A single controlled
  event (`POWDERLINE-1`) proved ingestion end to end and was immediately resolved.
  No intentional crash path was added to production. Final production review must
  confirm no unresolved issues after deployment.
- Linear issues [TYL-9](https://linear.app/tyler-harris/issue/TYL-9/mobile-web-to-ios-packaging-feasibility)
  and [TYL-11](https://linear.app/tyler-harris/issue/TYL-11/mobile-mobile-ux-and-physical-device-qa)
  are the milestone records. No speculative issues were created.
- Drive documents updated: Roadmap & Release Plan, Web → iOS Packaging
  Feasibility, and Current Technical & QA Status / physical-device matrix.

## Independent review focus

- Confirm GitHub `main`, Vercel production, and the visible eight-character build
  identifier all match the final handoff commit.
- Run the manual physical-device matrix before calling iPhone/iPad support proven.
- In a future Mac-only branch, prove WebGPU/TSL, touch, controllers, lifecycle,
  offline launch, storage, and Sentry in bundled Capacitor WKWebView.
- Recheck device-loss recovery. Startup failures are handled, but an already-
  running WebGPU device-loss event is not yet wired to resource recreation.
