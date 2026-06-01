---
name: detective-script-dev
description: >
  Use this skill when Codex needs to run or orchestrate detective-script-dev, a
  detective/mystery novel pipeline for structured case initialization,
  brief/research/outline/draft/review flow, core trick locking, editor-led
  writer instructions, deterministic artifact paths, clue fairness checking,
  0-100 quality scoring, static user preference memory, multi-agent review
  contracts, or optional Fanqie publish preparation with human approval.
  Trigger for Chinese requests such as "按 detective-script-dev 写",
  "小说流水线", "侦探小说", "核心诡计锁死", "主编讲解后让写手写",
  "封装成 skill", "番茄发布准备", or "case check".
---

# detective-script-dev

detective-script-dev is a frontend-free detective fiction creation skill. Use
it as the control surface for a local workflow: Codex talks with the user, locks
creative facts, routes writing/review work, and keeps artifacts in deterministic
case folders.

## First Response

Start every run with a short Chinese status brief:

```text
当前状态: 新建 case | 继续 case | 检查 case | 发布准备
目标: 用户这次要产出的内容
当前确认门: none | brief-approval | core-trick-approval | draft-version-approval | publish-approval
产物位置: content/cases/{case}/
下一步: one concrete action
需要你决定: only the next blocking creative or publish decision
```

If the user did not provide a case name, ask for one concise name. If the user
already gave enough direction, do not over-interview.

## Capabilities

- Initialize and check case artifact folders with `scripts/wolf-runner.js`.
- Guide the user through brief, research, outline, core trick lock, draft,
  completeness gate, parallel review, editor judge, revision, and publish prep.
- Lock the approved core trick in `00-meta/truth-file.json` before drafting.
- Run a fairness check that verifies key clues in `truth-file.json` are planted
  before the reveal in a selected draft.
- Write a 0-100 quality score report for the active draft version.
- Initialize, validate, and show static user preference memory from
  `~/.config/wolf/memory.json`; never rewrite memory without user approval.
- Give writers a main-editor explanation and canonical solution to follow.
- Keep all outputs under `content/cases/{case}/`.
- Track `current_version`, `rollback_count`, `rollback_history`, `active_run`,
  and `agent_runs` in `.case/state.json` so frequent subagent work does not
  silently scramble state.
- Fuse and archive the case after 3 recorded rollbacks until a human editor
  decides how to continue.
- Use external knowledge through `WOLF_KNOWLEDGE_ROOT` when needed; do not
  vendor a heavy knowledge corpus into the skill repo.
- Prepare Fanqie command packages only after `publish-approval`; never perform
  live publishing without explicit user approval.

## When NOT to Use

- Do not use for non-mystery fiction genres (romance, sci-fi without mystery elements, etc.).
- Do not use for live platform publishing without explicit human `--confirm-live` approval.
- Do not use for general creative writing without a structured case workflow.
- Do not use when the user has not provided a case name or creative direction.
- Do not modify locked `truth-file.json` core tricks without user approval.

## Workflow

```text
case init
-> brief                    [brief-approval]
-> research
-> outline
-> core-trick-lock          [core-trick-approval]
-> draft
-> completeness-gate
-> parallel-review
-> editor-judge
-> revise or publish-prep   [draft-version-approval / publish-approval]
```

## Core Trick Lock

Treat the core trick as a locked truth asset, not a suggestion.

Before writing draft prose, the editor must produce:

- `editor_explanation`: plain-language explanation for the writer.
- `canonical_solution`: the final truth, method, clue chain, and reveal logic.
- `writer_constraints`: what the writer must not change.
- `change_policy`: user approval required before any core trick change.

Write these fields to `content/cases/{case}/00-meta/truth-file.json` under
`core_trick`, then set `locked: true` only after the user approves.

If a writer or reviewer wants to change the culprit logic, method, motive truth,
reveal chain, or final explanation, stop and return `CONFIRM_REQUIRED` with the
proposed change. Do not silently rewrite the locked trick.

## Commands

Run from the project root or from a workspace that contains `content/cases/`.
If globally installed as `wolf`, the runner can also read optional config from
`~/.config/wolf/config.json`; absence of that file is valid.

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case init CASE_NAME
node ops/skills/detective-script-dev/scripts/wolf-runner.js case list
node ops/skills/detective-script-dev/scripts/wolf-runner.js case check CASE_NAME
node ops/skills/detective-script-dev/scripts/wolf-runner.js case check CASE_NAME --no-write
node ops/skills/detective-script-dev/scripts/wolf-runner.js case fair-check CASE_NAME --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js case score CASE_NAME --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js case status CASE_NAME
node ops/skills/detective-script-dev/scripts/wolf-runner.js case lock CASE_NAME --owner "agent-or-human" --ttl-minutes 120
node ops/skills/detective-script-dev/scripts/wolf-runner.js case unlock CASE_NAME --owner "agent-or-human"
node ops/skills/detective-script-dev/scripts/wolf-runner.js case rollback CASE_NAME --to vN --reason "why" --owner "agent-or-human"
node ops/skills/detective-script-dev/scripts/wolf-runner.js case archive CASE_NAME --reason "why" --owner "agent-or-human"
node ops/skills/detective-script-dev/scripts/wolf-runner.js publish prep CASE_NAME --platform fanqie --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js publish checklist CASE_NAME --platform fanqie --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js memory init
node ops/skills/detective-script-dev/scripts/wolf-runner.js memory check
node ops/skills/detective-script-dev/scripts/wolf-runner.js memory show
```

If the skill has been installed outside this repo, use the installed skill path:

```bash
node path/to/detective-script-dev/scripts/wolf-runner.js case check CASE_NAME
```

Fanqie preparation is optional and human-gated:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js publish prep CASE_NAME --platform fanqie --version vN
node ops/skills/detective-script-dev/scripts/fanqie-cli.js check-status --book-id BOOK_ID
```

## Interaction Rules

- Speak Chinese to the user unless they ask otherwise.
- Ask one blocking question at a time.
- After each user confirmation, record the approved fact in the case artifact.
- When drafting, inject `characters.json`, `truth-file.json`, the approved
  outline, and the editor explanation before writer instructions.
- When reviewing, load `references/agents.yaml` and require structured outputs
  matching `schemas/review-result.json` and `schemas/editor-verdict.json`.
- Before editor approval, run `case fair-check` for the draft version being
  considered. Treat `BLOCKED` as a hard stop until the clue is planted earlier
  or the locked truth is explicitly changed by the user.
- Run `case score` after fairness check. Treat `blocked` as an editor stop and
  `warn` as requiring editor judgment before publish prep.
- Use memory only as preference context for brief/outline/draft/review prompts.
  Locked case truth in `truth-file.json` always overrides memory.
- When using multiple subagents, give each one a distinct owner label and write
  only to its assigned artifact path. Use `case lock` before coordinated writes
  and `case unlock` after completion. Record coordination decisions in
  `.case/state.json` or the relevant review artifact before merging.
- If an editor decision says `rollback`, call `case rollback`. After the third
  rollback, treat `status: fused` as a hard stop; do not draft again until the
  user explicitly approves a new direction.
- For deterministic checks, prefer the runner before subjective review.
- Keep live platform actions as `CONFIRM_REQUIRED`.

## References

Read these only when needed:

- `references/artifact-protocol.md`: case folders, truth lock shape, validation.
- `references/agent-review.md`: reviewer/editor contract and artifact paths.
- `references/agents.yaml`: concrete role definitions.
- `references/beta-acceptance.md`: first external-user acceptance script.
- `schemas/review-result.json`: expert review output schema.
- `schemas/editor-verdict.json`: editor decision output schema.
- `marketplace.json`: distribution listing draft and safety claims.
