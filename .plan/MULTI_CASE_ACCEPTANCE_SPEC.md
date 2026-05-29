# detective-script-dev Multi-Case Acceptance Spec

## Version
- Spec version: 1.0
- Date: 2026-05-29
- Status: approved

## What
- Modify `ops/skills/detective-script-dev/scripts/wolf-runner.js` — add promote, recover, agent-start, agent-finish, brief, and node-stage commands; harden check for version drift, fused archive snapshots, and review/editor JSON schema.
- Modify `src/adapters/fanqie/fanqie-cli.js` — require `--confirm-live` before live write commands.
- Modify `ops/skills/detective-script-dev/scripts/fanqie-cli.js` — mirror the same live gate for packaged skill use.
- Modify `ops/skills/detective-script-dev/scripts/acceptance-check.js` — split acceptance into seven independent scenarios covering real regression, base lifecycle, locks, fuse archive, v12 promotion, schema blocking, and Fanqie live gate.

## Why
Move the runner from a single-case smoke baseline to reproducible multi-case acceptance for high-frequency multi-agent detective-script production.

## Acceptance Criteria
- [ ] `npm run acceptance` runs all seven scenario functions and fails on any scenario failure.
- [ ] `case check HYOUKA-GZ --no-write` passes and detects `v10`.
- [ ] Synthetic base case can initialize and pass before `core_trick.locked=true`.
- [ ] Lock conflict, unlock, and relock behavior is deterministic.
- [ ] Three rollbacks fuse a case, write an archive snapshot, and block rollback/promote until manual recover.
- [ ] `v12` promote works with numeric version ordering; rollback to `v7` records from/to/owner/reason.
- [ ] Invalid review/editor JSON artifacts block `case check`; valid artifacts pass.
- [ ] `upload` and `create-book` return `CONFIRM_REQUIRED` without `--confirm-live`; read-only commands do not.

## Three-Domain Exit Check
- [ ] Spec to Code: All listed runner, Fanqie, and acceptance changes are implemented.
- [ ] Spec to Tests: All acceptance criteria are covered by `npm run acceptance` or explicit verification commands.
- [ ] Code to Tests: New command paths are exercised by acceptance scenarios or syntax/test commands.
