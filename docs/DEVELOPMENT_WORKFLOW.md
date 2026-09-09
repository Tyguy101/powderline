# Powderline development workflow

This is the operating manual for Codex and future contributors. Powderline is a
Vite/WebGPU browser game today; native packaging is a future investigation, not
part of the current build.

## Before working

1. Work only from `C:\Users\tyler\Powderline`.
2. Fetch GitHub and confirm the intended branch:

   ```bash
   git fetch --all --prune
   git status --short --branch
   git log --oneline --decorate -8
   ```

3. Read the current `README.md`, this document, and relevant technical docs.
4. Read the applicable Linear issues. If the work concerns production behavior,
   inspect recent Sentry errors and separate development noise from release
   failures.
5. Do not assume an old local checkout is authoritative. The active checkout,
   branch, remote URL, HEAD SHA, and Vercel build ID must be explicit.

## Preserve project invariants

- Keep fixed 60 Hz simulation, deterministic seeds, collision order, replay
  serialization, and camera-relative/origin-rebased coordinates stable.
- Keep procedural shader/TSL rendering and bounded memory. Do not introduce
  downloaded game art, unbounded particle/effect pools, or per-body-part mesh
  explosions.
- Keep the performance-first production renderer. The one-million-pixel adaptive
  canvas budget and lightweight circular trail buffer are intentional; the
  toroidal persistent snow-mask experiment is preserved on its own branch only.
- Do not add GPU compute or clipmap generation because it sounds attractive.
  Revisit those ideas only when profiling produces a measured reason.

## Validation ladder

Run the smallest useful checks while iterating, then the complete gate before a
meaningful milestone:

```bash
npm run lint
npm test
npm run build
npm run benchmark -- --duration=5 --warmup=3 --scenario=smoke
npm run benchmark:matrix
npm run qa:mobile
```

Also launch `npm run dev`, exercise the changed flow locally, inspect the
browser console, and capture a screenshot when visual behavior changed. For a
release candidate, run desktop, high-DPI, mobile portrait, and mobile landscape
profiles on physical devices when available. Do not report “done” when a gate
failed; record the failure and update the Linear issue.

## Commit and release flow

1. Keep commits focused and descriptive.
2. Update `README.md`, technical docs, and `docs/QA_HANDOFF.md` in the same
   milestone whenever reasonably possible.
3. Commit and push to GitHub `main` only after local validation passes. Branches
   and pull requests may use Vercel previews.
4. Verify that Vercel production still serves
   `https://powderline-lake.vercel.app/` and that its visible build identifier
   matches the pushed Git commit (or document a deployment delay).
5. For meaningful release-candidate builds, associate the build/release with
   Sentry, verify expected events, and inspect new errors before calling it
   healthy.
6. Update the relevant Linear issue(s) as completed, needs QA, blocked, or
   follow-up. Genuine bugs become Linear issues rather than disappearing into
   chat history.

## System responsibilities

| System | Canonical responsibility |
| --- | --- |
| Local repository | Active development and validation |
| GitHub | Source code, history, branches, and tags |
| Vercel | Current web deployment and release-candidate previews |
| Linear | Actionable backlog, bugs, polish, blockers, and status |
| Sentry | Runtime errors, crash health, releases, and deployment evidence |
| Google Drive | Human-readable vision, roadmap, QA, App Store, marketing, privacy, and user-testing material |
| README/docs | Concise technical status and agent operating instructions |

Do not mirror source code into Drive or maintain a second detailed backlog in
Markdown. Link to the authoritative system and keep summaries current.

## Mobile and App Store investigation

The first mobile foundation and iOS feasibility pass recommends Safari/Home
Screen distribution first, followed by an isolated Capacitor 8 spike. Capacitor
remains a hypothesis until physical WKWebView testing passes. Use
[PHYSICAL_DEVICE_QA.md](./PHYSICAL_DEVICE_QA.md) for the device gate and
[MOBILE_AND_IOS_FEASIBILITY.md](./MOBILE_AND_IOS_FEASIBILITY.md) for current
platform/toolchain evidence. Do not convert Powderline during a normal gameplay
milestone.

## Independent QA handoff

After every significant milestone, update
[QA_HANDOFF.md](./QA_HANDOFF.md) with the Git SHA, deployment/build ID, files
changed, tests, benchmarks, deterministic seed/replay, screenshots, known
limitations, open Linear issues, Sentry state, and what deserves independent
review. This keeps ChatGPT/Composio able to inspect GitHub, Vercel, Linear,
Sentry, and Drive without relying on hidden local context.
