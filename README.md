# detective-script-dev

Project version: 1.0.0

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
node src/bin/wolf-runner.js case fair-check HYOUKA-GZ --version v10
node src/bin/wolf-runner.js case score HYOUKA-GZ --version v10
node src/bin/wolf-runner.js publish prep HYOUKA-GZ --platform fanqie --version v10
node src/bin/wolf-runner.js memory check
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

**Live write gate**: All commands that write to Fanqie (`upload`, `create-book`, `cleanup`) require the `--confirm-live` flag. This is a breaking change from earlier versions—automated scripts must be updated to include `--confirm-live` after human approval.

`publish prep` creates a local manual-copy package under
`06-deliverables/publish/{platform}-package/`. It does not write to Fanqie or
any other platform.

## Fairness Check

`case fair-check` validates that key clues recorded in
`00-meta/truth-file.json` appear before the reveal in a draft. It writes
`fairness-report.json` and `fairness-report.md` under `05-reviews/{version}/`.
`BLOCKED` means the draft is not editor-approvable until the clue is planted
earlier or the user approves changing the locked truth.

## Quality Score And Memory

`case score` writes a 0-100 quality report under `05-reviews/{version}/` using
the locked trick, fairness result, draft completeness, structured review
artifacts, and publish readiness.

`memory init/check/show` manages optional static preferences at
`~/.config/wolf/memory.json`. Memory is read-only preference context during case
work; it cannot override `truth-file.json`.

## Distribution Readiness

The skill package includes `marketplace.json` as a distribution listing draft
and `references/beta-acceptance.md` as the first external-user acceptance
script. These are preparation artifacts only; they do not submit to any external
marketplace.

`package.json.files` limits the npm package to the skill, runner, adapter, and
operator docs. Internal research folders and full case drafts are not included
in the distributable package.

Generated publish packages under `content/cases/*/06-deliverables/publish/`
and `.omc/` research output are local runtime material and are ignored by git.
