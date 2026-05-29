# SPEC — detective-script-dev Skill Package

> Version: 6.0 | Date: 2026-05-29

## Architecture

```text
detective-script-dev/
  .kit/       project facts
  .plan/      PRD, SPEC, CHECKLIST, acceptance spec
  .workflow/  operator entry
  content/    active regression case
  ops/        packaged skill
  src/        runnable repo entrypoints
```

## Active Paths

| Surface | Path |
|---------|------|
| Case runner | `src/bin/wolf-runner.js` |
| LLM router | `src/lib/llm-router.js` |
| Fanqie adapter | `src/adapters/fanqie/fanqie-cli.js` |
| Primary skill package | `ops/skills/detective-script-dev/` |
| Case artifacts | `content/cases/{case}/` |

## Case Protocol

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

Case-local `archive/` is not part of the retained baseline after migration cleanup.

## Commands

```bash
npm test
npm run acceptance
node src/bin/wolf-runner.js case list
node src/bin/wolf-runner.js case check HYOUKA-GZ --no-write
python C:\Users\hy11\.codex\skills\.system\skill-creator\scripts\quick_validate.py ops\skills\detective-script-dev
```

## Fanqie Safety

Live write commands require `--confirm-live`:

- `upload`
- `create-book`
- `cleanup`

Read-only commands such as `check-status` and `fetch-data` remain available without confirmation.

## Remote

Cloud repo:

```text
https://github.com/2000thboy/detective-script-dev-skill
```

Default branch: `master`.

## Stop Gate

Do not claim product-level readiness unless P0/P1 gates pass:

- Fanqie live gate works.
- Runner state machine acceptance works.
- Multi-case acceptance works.
- HYOUKA-GZ regression still passes.
