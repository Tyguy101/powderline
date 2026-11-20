# Powderline QA handoff

## Mountain trail pass

Local branch `codex/mountain-trail-pass`. The comparison build is
`4f7e1e6e` on `codex/endless-mountain`. Gameplay is at `a488a2b`. Start Vite with
`npm run dev -- --host 127.0.0.1`. Seed **1729** starts at
[the summit](http://localhost:5173/?seed=1729). Take **left → left → right →
left → right**, then straight, to see every trail and a fresh Gate Run layout.

| Moment | Direct start | What to try |
| --- | --- | --- |
| Physical fork | [Pine fork](http://localhost:5173/?seed=1729&scenario=fork) | Read the overhead board and destination flags, then tuck through a mouth. |
| Pine Glades | [Grove before the glade](http://localhost:5173/?seed=1729&section=pine&scenario=encounter) | Take the wide line around the outcrop, then try the narrower trees-side line. |
| Gate Run | [First combination](http://localhost:5173/?seed=1729&section=gate&scenario=encounter) | Coast through the pair, then use the longer cross-slope setup. Seed [2718](http://localhost:5173/?seed=2718&section=gate&scenario=encounter) changes the rhythm. |
| Big Air Park | [First crevice](http://localhost:5173/?seed=1729&section=air&scenario=encounter) | Tuck on the approach, coast to see a short jump, or follow either green bypass marker. |
| Needle Chute | [First rock bend](http://localhost:5173/?seed=1729&section=chute&scenario=encounter) | Brake before the sidewalls sweep in. Aim around the interior boulder before opening your speed in the pocket. |
| Avalanche Alley | [First warning marks](http://localhost:5173/?seed=1729&section=avalanche&scenario=encounter) | Move toward the amber arrows and alternate sides as the warning changes. Stay in the current safe lane until the snow passes. |

Fork signs project from fixed mountain coordinates. The final three openings
are centered at −18, 0, and +18 m, with lane boundaries at −9 and +9 m.
The piste narrows to these mouths, and the adjoining section shares its seam.
Earlier destination signs give riders time to set up the turn.

The old ramp rendered a normalized soft mask enlarged with the asset. At
the showcase scale, its fixed edge transition covered roughly 0.8 world
meters. The mountain ramps now use camera-relative meshes with a distinct
lip. The ravine outline defines the same collision region used to determine
clearance. Tree and rock obstacles also frame the bypasses.

The avalanche uses 3–5 alternating downhill sweeps, producing 2–4 required
side changes depending on the seed. The rendered leading edge and the skier
and rider hit checks share the same curve and lane boundary. A passed sweep
can still overtake riders ahead. F3 and `__POWDERLINE_METRICS__` expose the
current warning, direction, wave number, passes, and NPC engulfments.

Version 7 records the new collision and encounter rules. Version 6
mountain recordings can be opened on the original branch. Classic version 5
remains supported. Use **R** or **Retry Section** to reset the current
section and its encounter state. **Restart at the Top** rolls a fresh seed.

### Reproduce the evidence

```powershell
npm run lint
npm test
npm run build
npm run qa:endless -- --headed
npm run qa:endless -- --tour
npm run qa:endless -- --replay-tour
npx tsx tools/qa/endless-tuning.ts
npx tsx tools/qa/trail-matched-captures.ts
npx tsx tools/qa/trail-matched-captures.ts --mobile-chute
npm run qa:mobile
npm run benchmark:matrix
```

Captures, runs, and screenshots live under `tools/reports/trail-pass`.
The paired `before-*` and `after-*` PNGs use seed 1729 and fixed capture
waypoints. Open a saved input sequence by appending its `.replay.txt` content
to `http://localhost:5173/#replay=`. The headed encounter driver uses ordinary
keyboard and drag events. The fixed-step sweeps exercise course physics
without graphics. The `--double` tour and `--replay-tour` checks can shorten
verification wall time, and their timing is separate from benchmark data.

### Playtest results and decisions

- Headed Chrome drove both Pine lines, a tucked right fork, two gate sequences
  with a deliberate miss and recovered streak, the crevice at tuck and coast
  speeds, and the crevice bypass. The same Needle Chute layout cleared under
  a guided brake line and crashed on a straight tucked charge.
- The seed-1729 encounter cleared three avalanche sweeps with an
  [NPC engulfment](../tools/reports/trail-pass/avalanche-npc-engulfed.png).
  Starting the first crossing late was recoverable. Holding that side for the
  second sweep caused a crash. Retry restored the same layout and cleared the
  wave and NPC-hit counters. A second attempt held straight tuck and was
  caught. Restart at the Top began a new seed.
- The 12-seed fixed-step sweep cleared both Pine lines on all 12 layouts.
  Coasting and braking cleared the first 12 slalom gates with guided steering.
  Tuck cleared 4–7. On seed 1729 braking and coasting traveled 6.65 and
  27.26 m before the crevice failure. Tuck cleared it at 48.21 m.
- The guided chute line reached the recovery pocket on all 12 layouts
  while braking or coasting. A straight tuck cleared none. With a standing
  entry into the first avalanche sweep, a 44 m gap left enough time on all
  12 tested seeds. At 36 m, 6 of 12 escaped. At 28 m, all were caught.
- Four mobile-emulation profiles passed in both orientations. The
  [narrow-landscape fork](../tools/reports/mobile-lifecycle/narrow-landscape-fork-tuck.png)
  accepted native two-finger tuck and carve events at more than 30 m/s.
  The [chute pinch replay](../tools/reports/trail-pass/chute-narrow-landscape.png)
  was reviewed at the same viewport. Human feel and physical mobile device
  checks are pending.
- The final headless browser tour covered 9.46 km and six forks with ordinary
  mouse-drag input at 2× playback clock. It cleared the five-sweep avalanche
  variant and registered 16 rider engulfments there. It reached the seventh
  section with 60 clean gates, two retained sections, 384 trail samples, and
  901 compressed input runs. In the final 98 wall-clock seconds, the eight
  Chrome processes used 576–595 MiB of private memory. JS heap at exit was
  about 30 MiB. The browser tour clock was accelerated for route verification.
  The same 42.6 KB input sequence reproduced the seventh section ID, lane
  choice, and 60-gate total on the potato preset.
- Lint, 42 tests across 11 files, and the production build passed. Tests
  include route joins and reachability across 256 seeds, repeated wake
  collisions, and retention over more than 60 simulated sections.

Use the first playtest to choose how inviting the scenic glade line should
look, whether the showcase crevice should demand a sustained tuck, and whether
the avalanche's late-crossing margin feels fair once riders are in the way.

| Matched capture | Before | After |
| --- | --- | --- |
| Fork approach | [UI cards](../tools/reports/trail-pass/before-fork-approach.png) | [Overhead approach](../tools/reports/trail-pass/after-fork-approach.png) |
| Fork mouths | [Painted lanes](../tools/reports/trail-pass/before-fork-mouths.png) | [Entrance gantries](../tools/reports/trail-pass/after-fork-mouths.png) |
| Ramp 1440×900 | [Soft mask](../tools/reports/trail-pass/before-ramp-medium.png) | [Modeled lip](../tools/reports/trail-pass/after-ramp-medium.png) |
| Ramp potato 1280×720 | [Soft mask](../tools/reports/trail-pass/before-ramp-potato.png) | [Modeled lip](../tools/reports/trail-pass/after-ramp-potato.png) |

The input record for the complete descent is
[`tour-5-commit.replay.txt`](../tools/reports/trail-pass/tour-5-commit.replay.txt).
For short motion checks, use `fork-right-tuck.replay.txt`,
`pine-scenic-rejoin.replay.txt`, `gate-second-combination.replay.txt`,
`air-landing-medium.replay.txt`, `chute-recovery.replay.txt`, and
`avalanche-all-crossings.replay.txt` from the same folder.

### Benchmark commands

```powershell
npm run benchmark -- --duration=5 --warmup=3 --scenario=trail-after-smoke
npm run benchmark:potato -- --duration=5 --warmup=3 --scenario=trail-after-potato
npm run benchmark -- --seed=1729 --start=fork --fork-range=125 --drive=tuck --duration=4 --warmup=1 --scenario=trail-match-after-fork
npm run benchmark -- --seed=1729 --section=chute --start=encounter --drive=chute --duration=4 --warmup=4 --scenario=trail-match-after-chute
npm run benchmark -- --seed=1729 --section=avalanche --start=encounter --replay-file=tools/reports/trail-pass/avalanche-all-crossings.replay.txt --drive=coast --avalanche=chasing --wave=1 --lead=26 --duration=1 --warmup=1 --scenario=trail-match-after-chase
```

For comparison, serve the original build from `4f7e1e6e` on a separate
loopback port and pass its URL with `--url`. Use `--drive=tuck` and omit
`--wave` for the original single-front chase. Matched PNGs can be captured
against that preview with `POWDERLINE_QA_URL` and `--before`.

The production comparisons use headless Chrome 157, the default WebGPU
backend, DPR 1, and the same Windows host. The desktop, potato, and fork
comparisons use identical input policies. The chute guide follows each
edition's center line, so the revised tighter bend produces more braking.

| Scenario | Canvas pixels | Before median / P95 / P99 | After median / P95 / P99 | Frames >50 ms before / after |
| --- | ---: | --- | --- | --- |
| Desktop smoke | 998,560 | 16.70 / 16.90 / 17.00 ms | 16.70 / 16.90 / 17.00 ms | 0 / 0 |
| Potato smoke | 921,600 | 16.70 / 16.90 / 17.00 ms | 16.70 / 16.90 / 17.00 ms | 0 / 0 |
| Tucked fork | 998,560 | 16.70 / 16.90 / 17.00 ms | 16.70 / 16.90 / 17.00 ms | 0 / 0 |
| Wooded chute | 998,560 | 16.70 / 16.90 / 17.00 ms | 16.70 / 16.90 / 17.00 ms | 0 / 0 |
| Active avalanche, one-second window | 998,560 | 16.70 / 17.00 / 17.00 ms | 16.70 / 17.00 / 17.00 ms | 0 / 0 |

The guided chute averaged 0.184 → 0.217 ms in simulation, 0.012 →
0.014 ms in collision, 0.059 → 0.065 ms in render preparation, and
0.859 → 0.864 ms in CPU submission. The fork averaged 0.900 → 0.970 ms in
CPU submission. These subsystem measurements are CPU times.

The revised chase sample used recorded input from the successful run so
the pilot could reliably reach the second moving sweep. Both versions
remained in the chasing phase for the entire sample. The revised sample had
six NPC hits recorded by its end. Chase CPU submission averaged
0.716 → 0.733 ms. The scripted tuck traverse was excluded after it collided
with an NPC upstream of the sample window.

All eight profiles in the [production matrix](../tools/reports/performance-matrix.json)
passed at 16.70 / 16.90 / 17.00 ms median/P95/P99. Every measured comparison
and matrix profile had zero frames over 50 ms. Raw benchmark JSON and
screenshots use the `trail-*` file prefixes in `tools/reports`.

---

## Endless Mountain local playtest

- Checkout `C:\Users\tyler\Powderline` on `codex/endless-mountain`, based on
  `80600c920645707029b3c4bfbd201d88c4789c47`.
- Implementation commit `ba9922eff433abf3c26889667447aecdb31c1459` and
  mobile readability follow-up `9d8597a`. The branch tip includes the QA handoff.
- Launch `npm run dev -- --host 127.0.0.1` and open [the seeded summit](http://localhost:5173/?seed=1729).
- Seed **1729**. Take **left → left → right → left → right** to visit every
  trail and return to Gate Run. Go straight at the next fork to replay the
  trail type with a new layout. Seed **424242** offers Needle Chute before Big
  Air Park, and seed **2718** offers a different set of section rhythms.

| Check | Start link |
| --- | --- |
| Pine Glades summit | [Open summit](http://localhost:5173/?seed=1729) |
| Route preview and steering | [Approach Pine fork](http://localhost:5173/?seed=1729&section=pine&scenario=fork) |
| Gate Run | [Approach first gate](http://localhost:5173/?seed=1729&section=gate&scenario=encounter) |
| Big Air Park | [Approach first kicker](http://localhost:5173/?seed=1729&section=air&scenario=encounter) |
| Needle Chute | [Approach first bend](http://localhost:5173/?seed=1729&section=chute&scenario=encounter) |
| Avalanche Alley | [Approach warning zone](http://localhost:5173/?seed=1729&section=avalanche&scenario=encounter) |

- Gate Run counts crossings between flags. Brake to set up a turn or coast
  through the rhythm. On Big Air, tuck toward the first center kicker or carve
  wide early to pass it. In Needle Chute, brake before the narrow rock bends.
  In Avalanche Alley, head into either green shelter lane after the warning.
  A centered coast reproduces the catch.
- **Retry Section** or **R** restores the section entrance with its incoming
  speed, NPCs, and score at commitment. A QA start retries at the selected QA
  spawn. **Restart at the Top** starts a fresh Pine Glades seed. The seed chip
  copies a starting URL. A crash replay includes the inputs and starting
  settings. Valid v5 recordings select the classic course and should use their
  original quality preset.
- **F3** and `globalThis.__POWDERLINE_METRICS__` expose trail ID, fork lanes,
  score and streak, shelter state, frame pacing, and canvas budget.
  `?dev=1` enables the read-only `__POWDERLINE_REPLAY__()` capture hook.
  Telemetry initialization is skipped on loopback.

### Repeatable evidence

```powershell
npm run lint
npm test
npm run build
npm run qa:endless -- --headed
npm run qa:endless -- --tour
npm run qa:endless -- --replay-tour
npx tsx tools/qa/endless-tuning.ts
npm run benchmark -- --duration=5 --warmup=3 --scenario=endless-smoke
npm run benchmark:potato -- --duration=5 --warmup=3 --scenario=endless-potato
npm run benchmark -- --section=pine --start=fork --duration=5 --scenario=endless-junction
npm run benchmark -- --seed=1729 --section=avalanche --start=encounter --drive=tuck --avalanche=chasing --lead=26 --duration=4 --scenario=endless-chase
npm run benchmark:matrix
npm run qa:mobile
```

The browser tour uses real mouse drag input from the summit and drives
representative left, right, and straight forks. The focused browser script
uses drag, keyboard, and crash buttons. Both write screenshots, metrics,
and captured replay strings under `tools/reports/endless`. To play a saved
replay, append the contents of its `.replay.txt` file to
`http://localhost:5173/#replay=`. The fragment keeps long recordings in the
browser. The `--replay-tour` check replays the saved tour at accelerated
fixed-step time. Duration and steering variants are generated
locally by the fixed-step sweep. The rendered captures were reviewed in Codex.

- **Headless Chrome summit tour.** Playwright drag drove 9.45 km through
  six forks with zero browser errors and 58 clean gates. The 50 KB input
  replay reached the same seventh-section identity and score on the potato
  render preset at accelerated fixed-step time. Use `tour.json`,
  `tour-5-commit.replay.txt`, and `replay-tour.json`.
- **Headed Chrome encounters.** Playwright drove the right fork, tested a
  clean gate and a miss, landed a 47.6 m tucked jump, bypassed the park
  kickers, and reproduced early/late escapes and a catch. Both crash actions,
  the v5 classic replay, and invalid-replay messaging passed. Use
  `encounters.json` and the paired PNG and replay captures.
- **Long-run bounds.** The tour retained two sections, up to 384 trail
  samples, and 1,072 compressed input runs at the final fork. After startup,
  recorded stage snapshots had 16.7 ms medians and 16.8–17.0 ms P95s.
  Chrome process private memory stayed between 556 and 577 MiB over the
  final 85 seconds. JS heap ended at about 27 MiB. Process memory snapshots
  include Chrome overhead. The fixed-step unit ride advanced over 60 sections
  and reached the recording capacity without stopping the descent.
- **Automated tests.** 41 passed across 11 files. The generator batch checked
  route reachability and joins across 256 seeds. Focused batches checked
  steering and collision geometry across the three variants of each encounter.
- **Mobile emulation.** Four Chromium profiles passed in both orientations,
  including the unsupported-WebGPU message, lifecycle pause and resume,
  split touch controls, and fork layout. The compact fork preview was
  captured on the narrow landscape profile. See
  [mobile results](../tools/reports/mobile-lifecycle/results.json) and
  [close fork](../tools/reports/mobile-lifecycle/narrow-landscape-fork-close.png).

The 12-seed sweep cleared 12/12 of the first gates while braking, 11–12/12
while coasting, and 1–3/12 while tucking. Seed 1729's first jump traveled
6.65 m braking, 27.89 m coasting, and 47.62 m tucked. All 12 coasting
avalanche trials escaped at the warning or when starting a traverse at a
36–52 m lead. All 12 were caught when starting at 28 m or making no move.

### Captures

| Scene | Screenshot |
| --- | --- |
| Summit | [Start deck](../tools/reports/endless/tour-summit.png) |
| Pine Glades | [Clearing landmark](../tools/reports/endless/pine-clearing.png) |
| Gate Run | [Clean gate](../tools/reports/endless/gate-clean.png) |
| Big Air Park | [Landing](../tools/reports/endless/air-landing.png) |
| Needle Chute | [Rock pinch point](../tools/reports/endless/tour-chute.png) |
| Avalanche Alley | [Late escape](../tools/reports/endless/avalanche-late.png) |
| Junction | [Approach](../tools/reports/endless/tour-1-fork-approach.png) and [commit](../tools/reports/endless/tour-1-commit.png) |

### Production preview performance

Same-machine headless Chrome 157 with the default WebGPU backend on Windows.
The desktop and potato before/after runs used identical scripts, DPR 1,
viewports, and quality settings.

| Profile | Canvas pixels | Median / P95 / P99 | Frames >50 ms |
| --- | ---: | --- | ---: |
| Original desktop, 1440×900 | 998,560 | 16.70 / 16.90 / 17.00 ms | 0 |
| Mountain desktop, 1440×900 | 998,560 | 16.70 / 16.90 / 17.00 ms | 0 |
| Original potato, 1280×720 | 921,600 | 16.70 / 17.00 / 17.00 ms | 0 |
| Mountain potato, 1280×720 | 921,600 | 16.70 / 16.90 / 17.00 ms | 0 |
| Mountain junction | 998,560 | 16.70 / 16.90 / 17.00 ms | 0 |
| Mountain moving avalanche, seed 1729 | 998,560 | 16.70 / 16.90 / 17.00 ms | 0 |

Desktop smoke CPU averages moved from 0.167 to 0.197 ms for simulation,
0.05 to 0.07 ms for render preparation, and 0.735 to 0.919 ms for CPU
submission. Frame pacing stayed within the same refresh interval.
All eight matrix profiles passed on `9d8597a8`. They measured 16.70 ms
median, 16.90 ms P95, 17.00 ms P99, and zero frames over 50 ms. The
four-second tuck chase remained active throughout. It averaged 0.131 ms
in simulation, 0.008 ms in collision, 0.046 ms in render preparation,
and 0.731 ms in CPU submission.

**Playtest decisions.** Compare the feel of the late escape with the early
green exit. Then try coasting through Gate Run before braking at its tighter
turns. Physical-device compatibility and human play feel remain the next checks.

---

## Previous milestone

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
