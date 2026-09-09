# Powderline performance investigation

Date: 2026-07-31

## Reported regression

- Earlier builds ran near 60 FPS on ordinary hardware.
- A modest laptop later measured roughly 45–50 FPS.
- A nominally stronger gaming laptop measured roughly 15 FPS.
- The old automated benchmark continued to report approximately 60 FPS.

The investigation preserved gameplay, procedural art, NPC animation, fixed-step
physics, and deterministic behavior. No gameplay features were added.

## Why the old benchmark disagreed

The old harness created only a CSS viewport. Playwright therefore used DPR 1,
forced Chrome through Vulkan/ANGLE, ran for about four seconds, and reported a
240-frame rolling average. It did not record the canvas backing dimensions.

Real Powderline allowed DPR 1.5. This is 2.25 times the pixels of DPR 1. A
2560×1600 CSS viewport at DPR 1.5 created a 3840×2400 render target: 9.22 million
pixels, or 7.1 times the old 1440×900 benchmark workload. Refresh-capped results
had concealed this scaling.

## Reproduced baseline

Tests below used headless Chrome 150 through its normal backend on a Windows
machine with 12 logical CPUs and 16 GB reported memory. They are comparison
measurements, not universal hardware scores.

| CSS viewport / DPR | Backing pixels | Average | Median | P95 |
| --- | ---: | ---: | ---: | ---: |
| 1920×1080 / 1 | 2.07 MP | 22.18 ms | 16.8 ms | 33.8 ms |
| 1920×1080 / 1.5 | 4.67 MP | 42.99 ms | 33.6 ms | 66.7 ms |
| 2560×1600 / 1.5 | 9.22 MP | 80.80 ms | 83.2 ms | 149.8 ms |

The last result is 12.4 FPS and reproduces/narrows the reported gaming-laptop
15 FPS result. Physical pixel count is the proven primary cause. Adapter choice,
Windows graphics preference, battery state, Optimus copies, and D3D12 driver
behavior can further explain why a stronger laptop performed worse, but cannot
be identified remotely without that device's browser/GPU diagnostics.

## Subsystem findings

- The old fullscreen obstacle shader evaluated cell hashes and every tree,
  rock, and ramp SDF on every pixel. At 9.22 MP, disabling it improved frame time
  by about 29 ms.
- NPC rendering was measurable (roughly 5–7 ms in stressful profiles) but was
  not large enough to explain the collapse alone. NPC simulation remained about
  0.1–0.3 ms.
- The fullscreen snow shader performed four transcendental operations per pixel.
- Trail recording dirtied complete GPU buffers for one changed circular slot.
- Frame instrumentation copied, allocated, sorted, and reduced 240 samples every
  frame, even with F3 hidden, creating avoidable GC and pacing risk.
- NPC rendering uploaded inactive/off-screen slots and selected four clothing
  colors through repeated fragment masks.
- Optional crash materials could compile on first use during gameplay.

## Changes retained

1. Replaced the fullscreen obstacle pass with deterministic CPU cell selection
   and one instanced shader draw containing only actual visible features. The
   existing `describeFeature` function remains the authority for positions,
   types, scale, collision, and replay determinism.
2. Replaced fullscreen snow trigonometry with smooth procedural triangle waves.
   The subtle animated snow shading remains procedural and visually comparable.
3. Established a one-million-pixel default canvas budget. Native DPR is retained
   below the budget; only the WebGPU canvas is scaled, while HUD text remains at
   full CSS resolution. `renderScale` and `maxCanvasPixels` query overrides are
   available for diagnosis.
4. Tightened NPC quads while preserving their exact world-space silhouette size,
   culled off-screen riders from rasterization, and moved palette lookup to CPU
   instance data. All poses, outfit variation, falls, and behavior remain.
5. Changed trail updates to mark only the modified matrix/style range and draw
   only initialized circular slots.
6. Replaced per-frame metrics allocations with fixed typed buffers and periodic
   in-place percentile calculation. HUD/global publishing is throttled.
7. Added simulation, collision, trail, render-preparation, NPC-preparation,
   submission-CPU, pixel-count, DPR, and catch-up-step instrumentation.
8. Requested the high-performance WebGPU adapter and precompiled optional crash
   pipelines during startup.
9. Added development subsystem isolation through `?disable=`. Supported names:
   `player`, `npcRender`, `npcSim`, `npcSpeed`, `npcBeginner`, `npcSnowboard`,
   `npcShadows`, `npcEffects`, `obstacles`, `trails`, `snow`, `collisions`,
   `crashEffects`, `ui`, `cameraEffects`, and `replay`.
10. Added a golden 1,200-step player/NPC route to detect deterministic changes.

## Rejected or limited changes

- 4.2 MP and 2.4 MP default canvas budgets were tested and rejected. The former
  remained near a 25 ms average; the latter had a good median but repeated
  33-50 ms pacing spikes in the ten-second stressed-laptop profile.
- NPC animation detail was not removed because profiling did not support it as
  the primary bottleneck.
- NPC simulation cadence, collision order, and off-screen behavior were not
  throttled because doing so would alter deterministic outcomes.
- Fixed-step catch-up behavior was instrumented but not changed for the same
  determinism reason.

## Optimized high-resolution result

At 2560×1600 CSS / DPR 1.5, the production policy creates a 1280×800 backing
target (1.02 MP). The ten-second stressed result was:

- 19-20 ms average (about 50-53 FPS across repeated runs)
- 16.70 ms median (60 FPS)
- 33.40 ms P95
- 33.60 ms P99
- zero to two frames over 50 ms across repeated ten-second runs
- simulation about 0.24 ms
- render preparation about 0.10 ms
- CPU submission call about 2.30 ms

This is a large improvement over the reproduced 80.8 ms / 12.4 FPS baseline,
but the oversized CSS surface still shows some 16/33 ms compositor pacing in
headless Chrome. At 1920×1080 CSS / DPR 1.5, the policy creates a 1686×948
backing target and measured 16.67 ms average, 16.70 ms median, 16.90 ms P95,
and no long frames. Side-by-side captures showed no material loss of skier, NPC,
obstacle, trail, or HUD readability for Powderline's flat art.

## Remaining costs and risks

- GPU completion timing is not directly available in the normal build. CPU
  submission time is not GPU time. Resolution sweeps and subsystem isolation
  remain the portable inference method.
- Dense overlapping trail quads and the rich NPC SDF shader are the largest
  bounded character/effect costs. They are future optimization candidates if
  counts grow substantially.
- A hitch can still cause up to 12 fixed simulation steps in one rendered frame.
  Peak catch-up count is now recorded; changing it requires a replay policy.
- Real-device adapter name/backend exposure is browser-dependent. Record
  `chrome://gpu`, Windows graphics preference, power state, and browser version
  when investigating a specific laptop.
- The current 1.0 MP budget provides measurable headroom on the reproduced
  profile, but new fullscreen passes would consume it rapidly. Future effects
  should prefer tight bounds, instancing, or small fixed pools.

## Regression workflow

`npm run benchmark:matrix` runs desktop, high-DPI laptop, mobile portrait,
mobile landscape, empty-snow, three-NPC, five-NPC, and heavy-trail profiles. Use
`npm run benchmark:matrix:full` for 30-second samples. The matrix records actual
pixels and fails when median exceeds 18.5 ms, P95 exceeds 25 ms, errors appear,
or more than 1% of samples exceed 50 ms. For stored hardware baselines, also flag
median regressions over 10% or percentile/1%-low regressions over 15%.
