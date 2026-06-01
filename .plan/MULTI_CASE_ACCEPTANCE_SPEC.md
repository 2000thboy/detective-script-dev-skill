# detective-script-dev Multi-Case Acceptance Spec

## Version
- Spec version: 1.0
- Date: 2026-05-29
- Status: approved

## What
- Modify `ops/skills/detective-script-dev/scripts/wolf-runner.js` — add promote, recover, agent-start, agent-finish, brief, and node-stage commands; harden check for version drift, fused archive snapshots, and review/editor JSON schema.
- Modify `src/adapters/fanqie/fanqie-cli.js` — require `--confirm-live` before live write commands.
- Modify `ops/skills/detective-script-dev/scripts/fanqie-cli.js` — mirror the same live gate for packaged skill use.
- Modify `ops/skills/detective-script-dev/scripts/acceptance-check.js` — split acceptance into independent scenarios covering packaged regression, base lifecycle, locks, fuse archive, v12 promotion, schema blocking, and Fanqie live gate.
- Add fairness-check acceptance scenarios for locked-room, alibi, and social-motive cases so the product is validated without a bundled user case.

## Why
Move the runner from a single-case smoke baseline to reproducible multi-case acceptance for high-frequency multi-agent detective-script production.

## Acceptance Criteria
- [ ] `npm run acceptance` runs all scenario functions and fails on any scenario failure.
- [ ] Synthetic base case can initialize and pass before `core_trick.locked=true`.
- [ ] Lock conflict, unlock, and relock behavior is deterministic.
- [ ] Three rollbacks fuse a case, write an archive snapshot, and block rollback/promote until manual recover.
- [ ] `v12` promote works with numeric version ordering; rollback to `v7` records from/to/owner/reason.
- [ ] Invalid review/editor JSON artifacts block `case check`; valid artifacts pass.
- [ ] `upload` and `create-book` return `CONFIRM_REQUIRED` without `--confirm-live`; read-only commands do not.
- [ ] `case fair-check ACCEPT-LOCKED-ROOM --version v1` returns `PASS` when all clues are planted before reveal.
- [ ] `case fair-check ACCEPT-ALIBI --version v1` returns `BLOCKED` when a key alibi clue is missing before reveal.
- [ ] `case fair-check ACCEPT-SOCIAL-MOTIVE --version v1` returns `BLOCKED` when a key motive clue appears only in the reveal.
- [ ] `package.json` exposes both `wolf` and `wolf-runner` to the same repo runner.
- [ ] `publish prep ACCEPT-PUBLISH --platform fanqie --version v1` creates a manual-copy package with `live_write: false`.
- [ ] `memory init/check/show` validates the static memory schema and rejects malformed memory.
- [ ] `case score ACCEPT-QUALITY --version v1` writes a pass quality report, and a fairness-blocked case returns a blocked quality verdict.
- [ ] Distribution materials include `marketplace.json` and `references/beta-acceptance.md` with live-write safety claims.
- [ ] `npm pack --dry-run --json` excludes `.omc/` and full case drafts while retaining the packaged skill and runner.

## Three-Domain Exit Check
- [ ] Spec to Code: All listed runner, Fanqie, and acceptance changes are implemented.
- [ ] Spec to Tests: All acceptance criteria are covered by `npm run acceptance` or explicit verification commands.
- [ ] Code to Tests: New command paths are exercised by acceptance scenarios or syntax/test commands.
