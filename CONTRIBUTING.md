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
- Keep cron and SMS work idempotent; retries should not duplicate sends.
- Do not log API keys, auth tokens, full phone numbers, or full transcripts.

## Database Changes

Add new SQL files under `supabase/migrations/` and document any manual seed data in `supabase/seed.sql`.

## Security

All protected API routes must validate server-side authorization. Public UI should show masked phone numbers only.
