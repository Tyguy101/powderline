# Procedural rendering

The visible scene contains two code-generated planes and no texture sampling.

- The snow pass evaluates low-cost sine fields in TSL from UVs and camera world
  position, combining broad undulation, fine grain, and directional wind streaks.
- The skier pass combines analytic ellipse and box signed-distance masks in TSL.
  Jacket, goggles, limbs, skis, boots, and shadow are colored independently.
- Steering deforms the skier's local coordinate field, producing a readable carve.

Both materials are compiled by Three.js WebGPURenderer. The next rendering step is
an instanced procedural obstacle pass backed by compact deterministic descriptors.
