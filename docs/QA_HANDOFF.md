# Powderline QA handoff

## Current milestone

Repository consolidation and performance-foundation synchronization. The active
checkout is now `C:\Users\tyler\Powderline`; the prior OneDrive/Procedural Games
checkout is archived separately. This handoff is updated in place for the latest
meaningful milestone.

## Code and deployment identity

- Git branch: `main`
- Git SHA (migration implementation): `8b5bc8a` (full SHA: `8b5bc8af594b04087fe989984862778d136648a0`)
- Current branch tip: verify with `git rev-parse HEAD` and the GitHub `main` ref
- GitHub: https://github.com/Tyguy101/powderline
- Production: https://powderline-lake.vercel.app/
- Vercel build ID/commit: verified over HTTPS with Playwright during this handoff;
  the page exposed the current branch's eight-character build identifier.
- Deterministic seed: `424242` for benchmark smoke/replay checks

## Material changes

- Moved the active Powderline working repository to `C:\Users\tyler\Powderline`.
- Preserved the performance hardening, benchmark matrix, world-feature renderer,
  allocation-free metrics, tight crash-trail bounds, and optional Sentry hook.
- Added the durable development workflow and migration inventory.

## Validation completed

- `npm run lint`
- `npm test` — 30 tests passing
- `npm run build`
- Benchmark smoke and high-DPI isolation runs
- Browser visual/console review of the local WebGPU game

## Review focus and limitations

- Independently verify GitHub `main` matches the local migration SHA.
- Re-check the eight-character build identifier after subsequent pushes and
  confirm that the canvas initializes over HTTPS.
- Physical-device FPS and WebGPU adapter behavior still need a real desktop and
  phone/tablet pass; headless browser measurements are not a substitute.
- Sentry project/organization linkage is not verifiable in this session because
  no Sentry connector is available. The integration is inert until a DSN is set.
- Linear project and issue IDs must be confirmed in the connected Linear account.
