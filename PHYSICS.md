# Physics

The current accessible model runs at 60 Hz and tracks position, velocity, facing,
and carve. Downhill acceleration is balanced by drag; steering force weakens
slightly with speed; lateral motion damps smoothly; traversing adds drag; and
braking reduces downhill speed without stopping instantly.

The next slice should add analytic tree and rock collision bodies, crash/restart,
and a deterministic replay recorder before adding jumps or surface types.
