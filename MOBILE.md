# Mobile

The game surface uses `touch-action: none` so browser gestures are suppressed only
inside play. Horizontal drag controls steering; pressing the lower screen region
engages braking. UI spacing and type adapt below 640 px.

The current build limits pixel ratio to 1.5. Adaptive internal resolution, startup
profiling, device orientation input, and the full Potato/Low/Medium/High tuning
table remain future work.
