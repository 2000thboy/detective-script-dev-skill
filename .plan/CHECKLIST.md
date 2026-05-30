# CHECKLIST — detective-script-dev

> Version: 6.0 | Date: 2026-05-29

## Cleanup

| Task | Status |
|------|--------|
| 任务列表前置规划：开发前已列出目标、预期成果、完成标准、状态和验证/证据要求；顺序调整必须先更新 CHECKLIST | Done |
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
| `npm run acceptance` | runner, Fanqie gate, fairness, and wolf alias scenarios PASS |
| `node src/bin/wolf-runner.js case check HYOUKA-GZ --no-write` | PASS, highest version `v10` |
| `node src/bin/wolf-runner.js case fair-check HYOUKA-GZ --version v10` | PASS/WARN/BLOCKED with report written under `05-reviews/v10/` |
| `node src/bin/wolf-runner.js case score HYOUKA-GZ --version v10` | Writes 0-100 quality score under `05-reviews/v10/` |
| `node src/bin/wolf-runner.js publish prep HYOUKA-GZ --platform fanqie --version v10` | Creates local manual-copy package only |
| `node src/bin/wolf-runner.js memory check` | Validates optional `~/.config/wolf/memory.json` when present |
| `marketplace.json` and `references/beta-acceptance.md` | Local distribution and beta materials exist; no external submission claimed |
| `npm pack --dry-run --json` | Package excludes `.omc/` and full case drafts; includes skill, runner, adapter, and docs |
| `quick_validate.py ops\skills\detective-script-dev` | Skill is valid |

## Manual Acceptance Gate / stop gate / 验收门

| Gate | Status |
|------|--------|
| Manual acceptance gate | Human approval is required before any real external publish, marketplace submission, or platform write |
| Real Fanqie live write | Requires explicit human approval and `--confirm-live` |
| External marketplace submission | Requires explicit human approval |
| Internal beta launch | Allowed after commit and GitHub push |
| Completion claim | Requires passing verification commands and evidence under `.test/` |

## Remaining Policy

- Keep generated runtime output out of git.
- Keep `.omc/` research output and `content/cases/*/06-deliverables/publish/` manual-copy packages out of git.
- Keep knowledge corpora outside this skill repo unless explicitly promoted.
- Keep Fanqie live writes behind `--confirm-live`.
