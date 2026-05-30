# SPEC — detective-script-dev Skill Package

Project version: 1.0.0

> Version: 6.0 | Date: 2026-05-29

## Architecture

```text
detective-script-dev/
  .kit/       project facts
  .plan/      PRD, SPEC, CHECKLIST, acceptance spec
  .test/      AI/user evidence sandbox
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
| Test sandbox | `.test/` |

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
node src/bin/wolf-runner.js case fair-check HYOUKA-GZ --version v10
node src/bin/wolf-runner.js case score HYOUKA-GZ --version v10
node src/bin/wolf-runner.js publish prep HYOUKA-GZ --platform fanqie --version v10
node src/bin/wolf-runner.js memory check
python C:\Users\hy11\.codex\skills\.system\skill-creator\scripts\quick_validate.py ops\skills\detective-script-dev
```

Optional global config:

```json
{
  "caseRoot": "content/cases",
  "maxRollbacks": 3
}
```

Path: `~/.config/wolf/config.json`. Missing config is valid.

Optional static memory:

```json
{
  "version": "1.0",
  "user_profile": {
    "preferred_style": [],
    "preferred_pace": "",
    "preferred_trick_type": [],
    "chapter_length_target": null,
    "outline_depth": null
  },
  "successful_cases": [],
  "failure_patterns": []
}
```

Path: `~/.config/wolf/memory.json`. Memory is preference context only.

## Fairness Check

`case fair-check` validates `truth-file.json.clues[]` against a selected draft.
It writes `05-reviews/{version}/fairness-report.json` and
`05-reviews/{version}/fairness-report.md`.

Status semantics:

- `PASS`: all required clues are found before reveal.
- `WARN`: searchable clue data is weak but not blocking.
- `BLOCKED`: a required clue is missing or appears only at/after reveal.

## Quality Score

`case score` writes `05-reviews/{version}/quality-score.json` and
`05-reviews/{version}/quality-score.md`.

Dimensions:

- core trick lock
- fairness result
- draft completeness
- structured review presence
- publish readiness

## Distribution Materials

The skill package includes:

- `marketplace.json`: listing draft, command list, safety claims, verification commands.
- `references/beta-acceptance.md`: first external-user beta script and pass criteria.

These are local preparation artifacts. Do not claim external marketplace
submission without a live external confirmation.

Npm package distribution is constrained by `package.json.files`. The package
must include the skill, runner, adapter, `.plan`, `.kit`, `.workflow/README.md`,
and root operator docs, and must exclude `.omc/` research output and full case
drafts.

## Run State And Evidence

Resumable workflow state:

- Case state: `content/cases/{case}/.case/state.json`
- Case manifest: `content/cases/{case}/.case/manifest.json`
- Agent run records: `.case/state.json.agent_runs`
- Rollback audit: `.case/state.json.rollback_history`
- Fuse archive snapshot: `content/cases/{case}/archive/rollback-fused-*/snapshot.json`

Evidence roots:

- AI self-check evidence: `.test/ai/evidence/`
- User/internal beta evidence: `.test/user/evidence/`
- Current HYOUKA fairness report: `content/cases/HYOUKA-GZ/05-reviews/v10/fairness-report.md`
- Current HYOUKA quality report: `content/cases/HYOUKA-GZ/05-reviews/v10/quality-score.md`

## Capability Inventory And Ownership

| Capability | Owner | Tool / Skill | Evidence |
|------------|-------|--------------|----------|
| Planning / archive contract | Codex | `kit-skills` | `.plan/archive/2026-05/internal-beta-readiness.md` |
| Runner implementation | Codex | `src/bin/wolf-runner.js`, packaged skill runner | `npm run acceptance` |
| Skill packaging | Codex | `skill-creator` quick validate | `quick_validate.py ops/skills/detective-script-dev` |
| Internal beta | Human + Codex | `references/beta-acceptance.md` | `.test/user/evidence/` |
| Fanqie live action | Human approval required | `fanqie-cli.js --confirm-live` | Deferred |
| Deep research | Codex / delegated research | `deep-research` installed on host | `.omc/` ignored local research; promoted facts live in `.plan/` |

## Handoff Schema

Every handoff records:

- owner: `Codex`, `human editor`, `Trae Solo`, `WorkBuddy`, or named subagent.
- routed tool/skill: runner command, skill, or external host.
- approval state: `approved`, `deferred`, `confirm_required`, or `blocked`.
- evidence path: `.test/ai/evidence/`, `.test/user/evidence/`, or case-local `05-reviews/vN/`.
- fallback: stop at manual gate; do not invent live platform actions.

## Invocation Status Brief

Every resumed KIT invocation starts with:

```text
Current status: internal beta ready, external submission deferred.
Endpoint: local skill package plus GitHub repo.
Direction drift: none unless frontend, SaaS, or live auto-publish is requested.
Next safe action: commit and push, then collect internal beta evidence.
User decision needed: external marketplace channel and real beta schedule.
Definition of Done / Stop Gate: local gates pass; external publish remains manual.
```

## Archive Interaction Gate

Before archiving, moving, or deleting process files:

- Proceed without extra ceremony only when `.plan`, `.kit`, `.workflow`, `.test`, and live files agree.
- Ask the user when a file may contain live platform evidence, account material, current recovery state, or user beta feedback.
- Prefer `.plan/archive/YYYY-MM/` for historical planning material.
- Prefer `.test/ai/evidence/` or `.test/user/evidence/` for test evidence.

## Logged-In Browser Route

Fanqie browser work uses OpenCLI / browser adapter routes only after human
approval. Auth/session material is host-local and must not be committed.
Fallback is manual copy via `publish prep`; if browser state is unavailable,
return `CONFIRM_REQUIRED` or `DEFERRED`.

## Model / Agent Risk Ledger

- Provider/model version: not pinned by repo; record model in review artifacts.
- Cost/quota: no automatic retry loops for platform or quota delays.
- Context/chunk policy: load `truth-file.json`, selected draft version, and required references only.
- Tool permissions: child agents receive distinct owner labels and artifact paths.
- Eval data isolation: AI checks under `.test/ai`, real beta under `.test/user`.
- Prompt drift: locked core trick overrides memory and reviewer suggestions.
- Content safety: live publish and external submission require manual approval.
- Evidence retention: keep current evidence under `.test` and `05-reviews/vN`.

## Content Quality Blocker / Quality Blockers

质量阻断 / quality blocker policy: a case cannot move to internal beta
approval, publish prep approval, or completion claim while any blocker below is
active.

Block editor approval when any of these occurs:

- `case check` returns `BLOCKED`.
- `case fair-check` returns `BLOCKED`.
- `case score` verdict is `blocked`.
- Locked `core_trick` is missing, unlocked after drafting, or changed without user approval.
- Publish prep attempts a live platform write.

## Node Graph And Review Matrix

Node graph:

```text
brief -> research -> outline -> core-trick-lock -> draft -> fair-check -> score -> parallel-review -> editor-judge -> publish-prep
```

Executor ownership:

- Codex: planning, artifact checks, runner changes, acceptance, packaging.
- Subagents / external runners: bounded review or drafting only when assigned a distinct owner and path.
- Human editor: core trick approval, live publish approval, marketplace submission approval.

Chunk policy:

- Keep case truth in `00-meta/truth-file.json`.
- Keep drafts versioned under `04-drafts/vN/`.
- Keep review outputs under `05-reviews/vN/`.
- Keep publish prep under ignored `06-deliverables/publish/`.

Review matrix:

- Deterministic runner: `case check`, `case fair-check`, `case score`.
- Structured reviewer schemas: `schemas/review-result.json`, `schemas/editor-verdict.json`.
- Human editor gates: core trick, draft approval, publish approval.

Format / encoding gate:

- Runner checks UTF-8 `.md` and `.json` files.
- Publish prep writes `.txt`, `.md`, and `.json` only.

## Fanqie Safety

Live write commands require `--confirm-live`:

- `upload`
- `create-book`
- `cleanup`

Read-only commands such as `check-status` and `fetch-data` remain available without confirmation.

`publish prep` is a local packaging command. It writes manual-copy files under
`06-deliverables/publish/{platform}-package/` and must not call live platform
write commands.

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
- Fairness-check acceptance covers locked-room, alibi, and social-motive cases.
- Quality score and memory schema acceptance work.
- Distribution materials acceptance works.
- HYOUKA-GZ regression still passes.
