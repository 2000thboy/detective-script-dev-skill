# CHECKLIST — detective-script-dev

> Version: 6.0 | Date: 2026-05-29

## Cleanup

| Task | Status |
|------|--------|
| Delete old root scripts and old `skills/novel-pipeline` tree | Done |
| Delete old `.test/` package | Done |
| Delete old `.workflows/` tree | Done |
| Delete old `.workflow` sub-entry files | Done |
| Delete untracked `archive/`, `content/knowledge/`, `ops/docs/`, `ops/github/`, `ops/workflows/` | Done |
| Delete `ops/legacy/` runner | Done |
| Delete case-local `content/cases/HYOUKA-GZ/archive/` | Done |
| Update `.plan`, `.kit`, `.workflow`, and `package.json` to remove residual references | Done |

## Verification

| Command | Expected |
|---------|----------|
| `npm test` | PASS |
| `npm run acceptance` | 7 scenarios PASS |
| `node src/bin/wolf-runner.js case check HYOUKA-GZ --no-write` | PASS, highest version `v10` |
| `quick_validate.py ops\skills\detective-script-dev` | Skill is valid |

## Remaining Policy

- Keep generated runtime output out of git.
- Keep knowledge corpora outside this skill repo unless explicitly promoted.
- Keep Fanqie live writes behind `--confirm-live`.
