# Powderline QA handoff

## Current milestone

Repository consolidation, performance-foundation synchronization, and account
setup. The active checkout is now `C:\Users\tyler\Powderline`; the prior
OneDrive/Procedural Games checkout is archived separately. This handoff is
updated in place for the latest meaningful milestone.

## Code and deployment identity

- Git branch: `main`
- Git SHA (migration implementation): `8b5bc8a` (full SHA: `8b5bc8af594b04087fe989984862778d136648a0`)
- Current branch tip: verify with `git rev-parse HEAD` and the GitHub `main` ref
- GitHub: https://github.com/Tyguy101/powderline
- Production: https://powderline-lake.vercel.app/
- Vercel build ID/commit: verified over HTTPS with Playwright during this handoff;
  the page exposed the current branch's eight-character build identifier.
- Linear project: [Powderline](https://linear.app/tyler-harris/project/powderline-b7e53d2ce4a1)
- Linear backlog: 10 initial issues covering gameplay, polish, UI/UX, mobile,
  App Store, QA, and release blocking.
- Sentry: `TyGames/powderline` JavaScript project; Production `VITE_SENTRY_DSN`
  configured in Vercel. No replay/input/PII collection is enabled.
- Deterministic seed: `424242` for benchmark smoke/replay checks

## Material changes

- Moved the active Powderline working repository to `C:\Users\tyler\Powderline`.
- Preserved the performance hardening, benchmark matrix, world-feature renderer,
  allocation-free metrics, tight crash-trail bounds, and optional Sentry hook.
- Added the durable development workflow and migration inventory.
- Connected the canonical Linear project/backlog and created the TyGames Sentry
  project with production DSN configuration.

## Validation completed

- `npm run lint`
- `npm test` — 30 tests passing
- `npm run build`
- Benchmark smoke and high-DPI isolation runs
- Browser visual/console review of the local WebGPU game

## Review focus and limitations

- Independently verify GitHub `main` matches the local final SHA.
- Re-check the eight-character build identifier after subsequent pushes and
  confirm that the canvas initializes over HTTPS.
- Physical-device FPS and WebGPU adapter behavior still need a real desktop and
  phone/tablet pass; headless browser measurements are not a substitute.
- The Sentry project is new and has no production event baseline yet; verify the
  first intentional startup/error event after the next release build.
