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
