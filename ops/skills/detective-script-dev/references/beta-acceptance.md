# Beta Acceptance

Use this as the first external-user acceptance script. Keep the session local
and do not ask beta users for platform credentials.

## Target Users

- Chinese detective fiction writers.
- Mystery fan writers who can judge clue fairness.
- Script-kill or suspense writers who need clue tracking.

## Required Beta Cases

Each beta run should produce one case under `content/cases/{case}/` and pass:

```bash
wolf case check {case} --no-write
wolf case fair-check {case} --version vN
wolf case score {case} --version vN
wolf publish prep {case} --platform fanqie --version vN
```

## Feedback Form

Ask the user to score each item from 1 to 5:

- The core trick lock prevented unwanted drift.
- The fairness report found a real clue problem.
- The quality score matched editor intuition.
- The manual publish package saved time.
- The workflow was understandable without extra explanation.

Collect three free-text answers:

- Which step felt unclear?
- Which output would you trust enough to reuse?
- What would stop you from using this on a real story?

## Pass Criteria

- At least 5 beta users complete one case each.
- At least 3 cases are not HYOUKA-style daily mystery.
- Average workflow clarity score is 4 or higher.
- At least one fairness report catches a real missing or late clue.
- No beta run performs live platform writes.
