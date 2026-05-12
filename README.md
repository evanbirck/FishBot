# FishBot

An internal automation system for monitoring weekly California Delta fishing reports, generating AI summaries, storing report history in Supabase, and sending email notifications through Gmail SMTP.

## Tech Stack

- Next.js App Router
- TypeScript
- React Server Components
- Supabase Postgres + RLS
- OpenAI Responses API
- YouTube Data API
- Gmail SMTP with an app password
- Vercel Cron
- GitHub Actions
- Vitest

## Features

- Weekly automated report discovery through the channel uploads playlist
- Deterministic and AI-assisted classification for weekly reports, optional extra uploads, and ignored uploads
- Public YouTube transcript extraction with graceful placeholder fallback
- In-depth AI-generated structured JSON summaries validated with Zod
- Combined weekly email digest with one-click summarize links for extra uploads
- Supabase persistence with idempotency constraints
- Dashboard with latest report, classification state, runs, costs, testing, and settings readiness
- Cost tracking for OpenAI token usage
- Historical testing page for date-range backfills without sending email
- Protected cron route
- Tests and CI

## Setup

1. Install dependencies with `npm install`.
2. Create a Supabase project.
3. Run `supabase/migrations/0001_init_fishbot.sql`.
4. If the database already exists, also run `supabase/migrations/0002_summary_cost_tracking.sql` and `supabase/migrations/0003_email_digest_conversion.sql`.
5. Optionally run `supabase/seed.sql` to seed the source channel.
6. Create a Google Cloud project and enable the YouTube Data API.
7. Create an OpenAI API key.
8. Enable 2-step verification on the Gmail account that will send FishBot email, then create a Gmail app password.
9. Copy `.env.example` to `.env.local` and fill in values.
10. Run `npm run dev`.
11. Open `/dashboard`.

## Environment Variables

Browser-safe:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_SUMMARY_MODEL` defaults to `gpt-5.4-mini`
- `YOUTUBE_API_KEY`
- `YOUTUBE_CHANNEL_ID`
- `YOUTUBE_CHANNEL_HANDLE`
- `GMAIL_SMTP_USER`
- `GMAIL_APP_PASSWORD`
- `GMAIL_SMTP_HOST` defaults to `smtp.gmail.com`
- `GMAIL_SMTP_PORT` defaults to `465`
- `EMAIL_FROM`
- `EMAIL_TO`
- `EMAIL_ACTION_SECRET`
- `CRON_SECRET`
- `ENABLE_EMAIL`
- `ENABLE_STT_FALLBACK`
- `FETCHTRANSCRIPT_API_KEY`
- `FETCHTRANSCRIPT_API_URL`
- `APP_BASE_URL`
- `DASHBOARD_PASSWORD`

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is still accepted as a backward-compatible alias for the publishable key. Never expose server-only values in client components or commit `.env.local`.

Optional cost-estimate values:

- `OPENAI_INPUT_COST_PER_1M`
- `OPENAI_OUTPUT_COST_PER_1M`

## Gmail SMTP

Use the Gmail address as `GMAIL_SMTP_USER`. Use a Gmail app password as `GMAIL_APP_PASSWORD`, not the normal account password.

Recommended values:

```text
GMAIL_SMTP_HOST=smtp.gmail.com
GMAIL_SMTP_PORT=465
EMAIL_FROM=FishBot <your-gmail-address@gmail.com>
EMAIL_TO=your-personal-email@gmail.com
ENABLE_EMAIL=true
```

Extra upload emails include signed one-click links like:

```text
{APP_BASE_URL}/api/videos/{youtubeVideoId}/summarize
```

Clicking a valid link summarizes that video, stores the report, and redirects to the report detail page.

## Cron Schedule

`vercel.json` checks the protected weekly-report route at:

- `0 2 * * 5`

This runs around Thursday 7:00 PM Pacific during daylight time because Vercel cron is UTC.

An optional Friday morning backup check can be added at `0 16 * * 5`, which is around Friday 9:00 AM Pacific. Vercel Hobby deployments can be limited on cron frequency, so the default config keeps only the Thursday evening check.

## Local Development

Run the app:

```bash
npm run dev
```

Sign in at `/login` with `DASHBOARD_PASSWORD`. Use the Testing page for controlled historical dry runs and backfills. Production processing is handled by the protected cron route.

## Runtime Flow

1. Vercel Cron calls `GET /api/cron/weekly-report` on the configured UTC schedule.
2. The route verifies `Authorization: Bearer ${CRON_SECRET}`.
3. A weekly `job_runs` row is created or reused.
4. The YouTube service resolves the channel uploads playlist and fetches recent uploads.
5. Each upload is classified as `weekly_report`, `possible_report`, `extra_upload`, or `ignored`.
6. Only high-confidence `weekly_report` videos are summarized automatically.
7. `possible_report` and `extra_upload` videos are listed in the weekly email digest with one-click summarize links.
8. Ignored uploads are stored and excluded from the digest unless manually handled later.
9. Public transcript extraction runs through YouTube caption endpoints first.
10. If Vercel is blocked by YouTube bot checks, the optional managed transcript provider runs when `FETCHTRANSCRIPT_API_KEY` is configured.
11. Missing transcripts create a placeholder summary instead of failing the job.
12. OpenAI returns detailed structured JSON validated by Zod.
13. One combined weekly email digest is rendered and sent to `EMAIL_TO`.

## Deploying to Vercel

1. Push the repo to GitHub.
2. Import the project into Vercel.
3. Add all required environment variables in Vercel Project Settings.
4. Set `APP_BASE_URL` to the deployed Vercel URL.
5. Set `DASHBOARD_PASSWORD`.
6. Run the Supabase migrations in production.
7. Deploy.
8. Confirm `/login` works.
9. Confirm `/dashboard` redirects to `/login` when unauthenticated.
10. Confirm Vercel Cron is enabled.
11. Verify `/api/health` returns ready status.

The protected dashboard pages use an HTTP-only `delta_auth` cookie set after a correct password login. The cron route is not protected by the dashboard cookie; `/api/cron/weekly-report` continues to require `CRON_SECRET`. One-click email summarize links are signed with `EMAIL_ACTION_SECRET`, or `CRON_SECRET` if no separate action secret is provided.

## Testing

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Tests cover scoring, classification, email digest formatting, signed action links, environment validation, idempotency helpers, average publish-time calculation, and summary validation. CI runs the same checks on pull requests.

## Known Limitations

Public YouTube transcripts may not be available from every hosting environment. Vercel serverless IPs can receive YouTube bot-check responses even when the same video has captions in a browser. Configure `FETCHTRANSCRIPT_API_KEY` to use a managed transcript fallback for those cases. If no transcript source returns usable text, the app creates a placeholder report with the video title, link, and clear note that no transcript was available.

## Roadmap

- Optional speech-to-text fallback
- Multiple source channels
- Email preference controls
- Delivery audit table

## Operational Notes

- `playlistItems.list` is used instead of defaulting to `search.list` because the uploads playlist is cheaper, more deterministic, and scoped to the source channel.
- Idempotency lives in database constraints: job run keys, YouTube video IDs, and one summary per video.
- Structured summary JSON is stored separately from rendered digest text so the dashboard, analytics, and email channel can evolve independently.
- Supabase RLS is enabled and service-role access is kept server-only.
