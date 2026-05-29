# detective-script-dev

> Frontend-free detective fiction skill with deterministic artifacts, core trick locking, multi-agent review contracts, and optional Fanqie publishing.

## What

detective-script-dev is the productized shape of `script-dev`: a local skill package for creating, reviewing, packaging, publishing, and reporting mystery fiction workflows.

- Root is intentionally small and product-facing.
- Writing workbench/frontend migration leftovers have been deleted.
- Fanqie operations are adapter commands, not the core product.
- Live Fanqie operations always stay behind human approval.

## Root Map

```text
.kit/       KIT project facts and version metadata
.plan/      PRD, SPEC, CHECKLIST, PROGRESS
.workflow/  operator entry docs
src/        runnable code: CLI, adapters, shared libraries
content/    active regression cases
ops/        packaged skill
```

Runtime folders such as `data/`, `artifacts/`, `.codex-tmp/`, and `node_modules/` are ignored operational state, not product entry points.

## Quick Start

```bash
npm test
node src/bin/wolf-runner.js case list
node src/bin/wolf-runner.js case check HYOUKA-GZ
```

## Active Entrypoints

| Area | Path |
|------|------|
| Case runner | `src/bin/wolf-runner.js` |
| Fanqie adapter | `src/adapters/fanqie/fanqie-cli.js` |
| Primary skill package | `ops/skills/detective-script-dev/` |
| Active cases | `content/cases/` |

## Case Structure

```text
content/cases/{case}/
  .case/
  00-meta/
  01-brief/
  02-research/
  03-outline/
  04-drafts/
  05-reviews/
  06-deliverables/
```

## Fanqie Safety

Use existing book slots by default. `create-book` is maintenance-only and must be confirmed by a human. Never commit account data, cookies, Chrome profiles, provider keys, `book_id`, or `volume_id`.
