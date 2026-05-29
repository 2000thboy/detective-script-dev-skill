# Agent Review Contract

Run deterministic checks before LLM review. Do not claim multi-agent review
happened unless review artifacts exist under:

```text
content/cases/{case}/05-reviews/v{N}/
```

Recommended review flow:

```text
completeness-gate
-> logic-checker
-> canon-checker
-> oc-checker
-> style-checker
-> editor-judge
```

Each spawned reviewer must have a distinct owner label, for example
`logic-checker:v7:run-20260529T120000Z`. Do not let two agents write the same
review file. Merge only after the editor judge reads all completed reviewer
artifacts.

Before a coordinator writes shared state, acquire a lease:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case lock CASE_NAME --owner "editor-judge:vN" --ttl-minutes 120
```

Release it after merging:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case unlock CASE_NAME --owner "editor-judge:vN"
```

Reviewer inputs:

- current draft or chapter text
- `00-meta/characters.json`
- `00-meta/truth-file.json`
- approved outline
- previous chapter summary if context is long

Writer inputs:

- approved brief
- approved outline
- locked `core_trick`
- editor explanation
- canonical solution
- writer constraints

Hard rule: reviewers and writers may suggest scene-level improvements, but they
must not modify the locked core trick without explicit user approval.

If the editor judge returns `next_action: rollback`, record it with:

```bash
node ops/skills/detective-script-dev/scripts/wolf-runner.js case rollback CASE_NAME --to vN --reason "editor-judge" --owner "editor-judge"
```

Three rollbacks fuse the case and create an archive snapshot. Fused cases must
not continue drafting until the user approves a new direction.

Use:

- `schemas/review-result.json` for each expert.
- `schemas/editor-verdict.json` for the final editor judge.
