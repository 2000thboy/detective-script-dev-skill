# AGENTS.md — detective-script-dev

Project version: 1.0.0

## Current Direction

This repository is **detective-script-dev**: a frontend-free detective fiction skill with deterministic case artifacts, core trick locking, multi-agent review contracts, and optional Fanqie publishing.

- Do not restore the old React/Vite frontend workbench unless the user explicitly asks.
- Treat `.plan/PRD.md`, `.plan/SPEC.md`, `.plan/CHECKLIST.md`, `.kit/config.json`, `.kit/version.json`, `.test/README.md`, `README.md`, and this file as active facts.
- Do not reintroduce deleted migration leftovers such as `archive/`, `.workflows/`, `ops/legacy/`, or `content/knowledge/` unless the user explicitly asks.
- Keep Fanqie live operations behind explicit human approval.
- Never commit real account material, cookies, Chrome profiles, provider keys, `book_id`, or `volume_id`.

## Active Surface

| Area | Path |
|------|------|
| Case runner | `src/bin/wolf-runner.js` |
| Primary skill package | `ops/skills/detective-script-dev/` |
| Case artifacts | `content/cases/{case}/` |
| Workflow entry | `.workflow/README.md` |
| Fanqie adapter | `src/adapters/fanqie/fanqie-cli.js` |
| Test sandbox | `.test/` |

## Case Protocol

Every active case should use:

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

## Verification

Run after code or package-affecting changes:

```bash
npm test
npm run acceptance
npm pack --dry-run --json
node src/bin/wolf-runner.js case list
node src/bin/wolf-runner.js case check HYOUKA-GZ
```

If `case check` writes `content/cases/{case}/.case/manifest.json`, keep or revert that runtime timestamp intentionally; do not leave it accidental.

## Fanqie Safety

- Use existing Fanqie book slots by default.
- `create-book` is manual-confirmed maintenance only.
- Platform quota or audit delays must become `DEFERRED`, not retry loops.
- Real publish actions require the user to approve the final deliverable and platform action.
