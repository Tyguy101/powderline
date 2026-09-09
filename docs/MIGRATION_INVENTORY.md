# Powderline migration inventory — 2026-09-09

## Source audit

- Historical checkout (now archived): `C:\Users\tyler\Procedural Games.archive-20260909`
- OneDrive path: `C:\Users\tyler\OneDrive\Documents\Procedural Games` (empty
  reparse-point directory; not an active checkout)
- Target checkout: `C:\Users\tyler\Powderline`
- Remote: `https://github.com/Tyguy101/powderline.git`
- GitHub `main` before migration: `96203d0fbef691c501ce67b4325ba8ef2de47948`
- Historical local `main` before migration: `8936c5a568eafbd7e2b3c908183abc9f1173b3d6`
- Historical local-only commits: four Interactions-Lab commits, preserved on
  `archive/pre-powderline-migration-20260909` in the archived checkout.
- Preserved experimental branch: `codex/experimental-toroidal-snow-mask`

## Copied into the active checkout

- GitHub Powderline source, tests, tools, documentation, Vercel config, and
  tracked `.openai/hosting.json`
- Current uncommitted Powderline performance work:
  `OPTIMIZATION_REPORT.md`, `src/gpu/WorldFeatureRenderer.ts`,
  `src/instrumentation/PerformanceCounters.ts`, and
  `tools/benchmark/run-matrix.ts`
- Ignored `tools/reports/` benchmark screenshots/JSON for diagnostic continuity

## Intentionally not copied

- `node_modules/`, `dist/`, TypeScript build-info, Vite caches, and other
  regenerable output
- `.env.local`, which contains a Vercel token; no secret was copied or committed
- `.vercel/`, `.wrangler/`, and old deployment metadata; `vercel.json` is the
  committed deployment configuration and the Vercel project is documented
- `Interactions-Lab/`, `Procedural-2D-Human-Rig-Sandbox/`, and
  `Procedural-World-Lab/`, which are separate experiments preserved in the
  archived historical checkout rather than mixed into Powderline

The old checkout is retained as an archive until the owner has reviewed the
migration. It is no longer the active Powderline working directory.
