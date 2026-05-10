# Contributing

## Development

Use Node 20+ and install dependencies with:

```bash
npm install
```

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Code Style

- Keep service boundaries typed and small.
- Keep server-only secrets out of client components.
- Prefer deterministic helpers for business logic, then cover them with Vitest.
- Keep cron and email work idempotent; retries should not duplicate summaries.
- Do not log API keys, auth tokens, app passwords, email addresses, or full transcripts.

## Database Changes

Add new SQL files under `supabase/migrations/` and document any manual seed data in `supabase/seed.sql`.

## Security

All protected API routes must validate server-side authorization. Public one-click action routes must use signed, expiring links.
