# PRD — detective-script-dev

> Version: 6.0 | Date: 2026-05-29

## Background

`detective-script-dev` is now a focused, frontend-free skill package. Migration leftovers from the old workbench, legacy workflow tree, archived backend, and external knowledge corpus have been removed from the repository.

## Product Goal

Provide a local skill that helps produce and review detective fiction cases with deterministic artifacts, core trick locking, clue fairness checking, 0-100 quality scoring, static user preference memory, multi-agent review contracts, and Fanqie publishing safety gates.

## Active Product Surface

| Surface | Path |
|---------|------|
| Skill package | `ops/skills/detective-script-dev/` |
| Repo runner entry | `src/bin/wolf-runner.js` |
| Fanqie adapter | `src/adapters/fanqie/fanqie-cli.js` |
| Acceptance scenarios | `ops/skills/detective-script-dev/scripts/acceptance-check.js` |
| Optional user cases | `content/cases/{case}/` in a host workspace |
| Product docs | `README.md`, `AGENTS.md`, `.plan/`, `.kit/`, `.workflow/` |

## Non-goals

- Do not restore the old React/Vite workbench.
- Do not restore the old Python backend.
- Do not keep legacy workflow specs or archived exploration evidence in this repo.
- Do not vendor the large detective knowledge corpus into this skill repo.
- Do not execute live Fanqie writes without explicit human approval.

## Acceptance

- `npm test` passes.
- `npm run acceptance` runs all multi-case scenarios.
- Fairness checking is covered by locked-room, alibi, and social-motive acceptance cases.
- Static memory schema and quality scoring are covered by acceptance scenarios.
- Distribution readiness includes local `marketplace.json` and beta acceptance script; no external submission is claimed.
- `python C:\Users\hy11\.codex\skills\.system\skill-creator\scripts\quick_validate.py ops\skills\detective-script-dev` passes.
- Local installs under Trae Solo and WorkBuddy contain the same skill package files.
- Cloud remote `origin` points to `https://github.com/2000thboy/detective-script-dev-skill.git`.
