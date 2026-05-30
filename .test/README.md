# Test Sandbox — detective-script-dev

This directory is the isolated test/evidence sandbox for the current skill.
It is not the deleted legacy `.test` package.

## Lanes

- `ai/`: Codex/agent self-check evidence.
- `user/`: internal beta user evidence and feedback.

## Current Gates

```bash
npm run acceptance
npm test
npm pack --dry-run --json
python C:\Users\hy11\.codex\skills\.system\skill-creator\scripts\quick_validate.py ops\skills\detective-script-dev
```

Keep generated publish packages out of this directory unless they are redacted
evidence. Do not store account material, cookies, browser profiles, `book_id`,
or `volume_id`.
