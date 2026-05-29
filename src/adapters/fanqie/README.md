# Fanqie Adapter

Optional adapter for Fanqie publish, status, cleanup, data-fetch, and manual book maintenance.

Run from the repository root:

```bash
node src/adapters/fanqie/fanqie-cli.js check-status --book-id BOOK_ID
node src/adapters/fanqie/fanqie-cli.js upload --book-id BOOK_ID --file FILE --title "第1章 标题" --num 1
node src/adapters/fanqie/fanqie-cli.js fetch-data --book-id BOOK_ID
```

Safety rules:

- Keep real `book_id`, `volume_id`, cookies, Chrome profiles, and account material out of git.
- Prefer existing book slots for daily runs.
- Treat `create-book` as manual maintenance, not the daily path.
- Platform quota and audit delays should stop as `DEFERRED`.
- One-off historical scripts with fixed IDs are not retained in this skill repo.
