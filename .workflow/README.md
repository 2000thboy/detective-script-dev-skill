# Workflow Entry

Project version: 1.1.0

This repo now exposes one active workflow surface: the packaged `detective-script-dev` skill and its runner commands.

## Commands

```bash
npm test
npm run acceptance
npm pack --dry-run --json
node src/bin/wolf-runner.js case list
```

## Skill Install Targets

- Trae Solo: `C:\Users\hy11\.trae\skills\detective-script-dev`
- WorkBuddy: `C:\Users\hy11\.workbuddy\skills\detective-script-dev`

## Live Gate

Fanqie live writes require explicit `--confirm-live`. Do not bypass this gate.
