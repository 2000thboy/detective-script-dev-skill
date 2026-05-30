# Artifact Protocol

All case output belongs under:

```text
content/cases/{case}/
  .case/
    state.json
    manifest.json
  00-meta/
    meta.md
    characters.json
    truth-file.json
  01-brief/
    brief.md
  02-research/
  03-outline/
  04-drafts/
  05-reviews/
  06-deliverables/
  archive/
```

Required checks:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case list
node ops/skills/detective-script-dev/scripts/wolf-runner.js case check CASE_NAME
node ops/skills/detective-script-dev/scripts/wolf-runner.js case check CASE_NAME --no-write
node ops/skills/detective-script-dev/scripts/wolf-runner.js case fair-check CASE_NAME --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js case score CASE_NAME --version vN
node ops/skills/detective-script-dev/scripts/wolf-runner.js case status CASE_NAME
node ops/skills/detective-script-dev/scripts/wolf-runner.js case lock CASE_NAME --owner "agent-or-human" --ttl-minutes 120
node ops/skills/detective-script-dev/scripts/wolf-runner.js case unlock CASE_NAME --owner "agent-or-human"
```

If installed outside the repo, replace `ops/skills/detective-script-dev` with the
installed skill path.

## Core Trick Shape

`00-meta/truth-file.json` must contain this after `core-trick-approval`:

```json
{
  "core_trick": {
    "locked": true,
    "approved_by": "user",
    "approved_at": "YYYY-MM-DDTHH:mm:ssZ",
    "editor_explanation": "How the editor explains the trick to writers",
    "canonical_solution": "The final truth and reasoning chain",
    "writer_constraints": [
      "Do not change the core method",
      "Draft scenes must preserve the approved clue chain"
    ],
    "change_policy": "User approval required before any core trick change"
  }
}
```

Unlocked new cases may pass `case check` before outline or draft artifacts exist.
Once outline, draft, or deliverable artifacts exist, missing or unlocked
`core_trick` should be treated as a workflow warning and resolved before new
drafting work.

## Version, Rollback, and Fuse State

`.case/state.json` tracks:

- `current_version`: latest active version detected or selected.
- `last_successful_version`: last user/editor accepted version.
- `rollback_count`: number of recorded rollbacks.
- `rollback_history`: who rolled back, from/to version, when, and why.
- `active_run`: current host/agent operation metadata.
- `agent_runs`: optional per-subagent execution records.
- `status`: `active`, `delivered`, `blocked`, `fused`, or `archived`.
- `archive_path`: snapshot path after manual archive or fuse archive.

Rollback command:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case rollback CASE_NAME --to vN --reason "why" --owner "agent-or-human"
```

After 3 rollbacks, the runner sets `status: fused`, writes
`circuit_breaker.fused: true`, and creates an archive snapshot under
`content/cases/{case}/archive/rollback-fused-{timestamp}/snapshot.json`.
Treat fused cases as hard stops until the user approves a new direction.

Use `case lock` / `case unlock` before and after coordinated writes. Locks are
lightweight leases stored in `active_run`; they are meant to prevent accidental
multi-agent state overwrites, not to replace filesystem permissions.

## Fairness Report

`case fair-check` reads `00-meta/truth-file.json` and the selected draft, then
writes:

```text
content/cases/{case}/05-reviews/vN/fairness-report.json
content/cases/{case}/05-reviews/vN/fairness-report.md
```

Each clue in `truth-file.json.clues[]` should provide searchable text through
`claim`, `description`, `name`, `significance`, or `aliases`. A clue with
`expected_before_reveal: false` is exempt from pre-reveal planting.

Treat `BLOCKED` as an editor stop: the draft cannot be approved until the clue
appears before the reveal, or the user explicitly approves a change to the
locked truth.

## Quality Score

`case score` writes:

```text
content/cases/{case}/05-reviews/vN/quality-score.json
content/cases/{case}/05-reviews/vN/quality-score.md
```

The score is 0-100 across core trick lock, fairness, draft completeness,
structured review presence, and publish readiness. A `blocked` verdict is an
editor stop.

## Static Memory

Optional memory lives at `~/.config/wolf/memory.json`:

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

Use `memory init`, `memory check`, and `memory show`. Memory is preference
context only; it must not override locked case truth.
