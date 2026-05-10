# FishBot

An internal automation system for monitoring weekly California Delta fishing reports, generating AI summaries, storing report history in Supabase, and sending SMS notifications through Twilio.

## Tech Stack

- Next.js App Router
- TypeScript
- React Server Components
- Supabase Postgres + RLS
- OpenAI Responses API
- YouTube Data API
- Twilio SMS
- Vercel Cron
- GitHub Actions
- Vitest

## Features

- Weekly automated report discovery through the channel uploads playlist
- Deterministic and AI-assisted classification for weekly reports, optional extra uploads, and ignored uploads
- Public YouTube transcript extraction with graceful placeholder fallback
- In-depth AI-generated structured JSON summaries validated with Zod
- Combined weekly SMS digest with extra upload reply options
- Inbound SMS support for `YES 1`, `YES ALL`, `ALL`, `NO 1`, and `STOP`
- Twilio delivery status callback handling
- Supabase persistence with idempotency constraints
- Dashboard with latest report, classification state, runs, deliveries, and settings readiness
- Cost tracking for OpenAI token usage and SMS delivery estimates
- Historical testing page for date-range backfills without sending SMS
- Protected cron and manual run routes
- Tests and CI

## Setup

1. Install dependencies with `npm install`.
2. Create a Supabase project.
3. Run `supabase/migrations/0001_init_fishbot.sql`.
4. If the database already exists, also run `supabase/migrations/0002_summary_cost_tracking.sql`.
5. Optionally run `supabase/seed.sql` to seed the source channel.
6. Create a Google Cloud project and enable the YouTube Data API.
7. Create an OpenAI API key.
8. Create a Twilio account and configure a sending number or Messaging Service.
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
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TO_PHONE_NUMBER`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_STATUS_CALLBACK_URL`
- `CRON_SECRET`
- `ENABLE_SMS`
- `ENABLE_STT_FALLBACK`
- `APP_BASE_URL`
- `DASHBOARD_PASSWORD`

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is still accepted as a backward-compatible alias for the publishable key. Never expose server-only values in client components or commit `.env.local`.

Optional cost-estimate values:

- `OPENAI_INPUT_COST_PER_1M`
- `OPENAI_OUTPUT_COST_PER_1M`
- `TWILIO_ESTIMATED_SEGMENT_COST_USD`

## Cron Schedule

`vercel.json` checks the protected weekly-report route at:

- `0 2 * * 5`

This runs around Thursday 7:00 PM Pacific during daylight time because Vercel cron is UTC.

An optional Friday morning backup check can be added at `0 16 * * 5`, which is around Friday 9:00 AM Pacific. Vercel Hobby deployments can be limited on cron frequency, so the default config keeps only the Thursday evening check. Use the dashboard `Run now` button as the backup.

## Local Development

Seed at least one source channel row with `supabase/seed.sql`. Add recipient rows only for users who have explicitly opted in:

```sql
insert into public.recipients (phone_e164, display_name, active, opt_in_confirmed)
values ('+15555550123', 'Operations recipient', true, true);
```

Run the app:

```bash
npm run dev
```

Sign in at `/login` with `DASHBOARD_PASSWORD`. The dashboard `Run now` button is enabled in local development only after required server environment variables are configured. It is disabled in production.

## Runtime Flow

1. Vercel Cron calls `GET /api/cron/weekly-report` on the configured UTC schedule.
2. The route verifies `Authorization: Bearer ${CRON_SECRET}`.
3. A weekly `job_runs` row is created or reused.
4. The YouTube service resolves the channel uploads playlist and fetches recent uploads.
5. Each upload is classified as `weekly_report`, `possible_report`, `extra_upload`, or `ignored`.
6. Only high-confidence `weekly_report` videos are summarized automatically.
7. `possible_report` and `extra_upload` videos are listed as reply options in the weekly digest.
8. Ignored uploads are stored and excluded from the digest unless manually handled later.
9. Public transcript extraction runs when captions are available.
10. Missing transcripts create a placeholder summary instead of failing the job.
11. OpenAI returns detailed structured JSON validated by Zod.
12. One combined weekly SMS digest is rendered and sent only to active opted-in recipients.
13. Twilio status and inbound reply webhooks update delivery, approval, ignore, and opt-out state.

## Inbound SMS

Configure the Twilio phone number Incoming Message Webhook to:

```text
{APP_BASE_URL}/api/sms/inbound
```

Supported replies:

- `YES 1`, `Y 1`, `SUMMARIZE 1`, `REPORT 1`
- `ALL`, `YES ALL`, `SUMMARIZE ALL`, `REPORT ALL`
- `NO 1`, `IGNORE 1`, `SKIP 1`
- `STOP`

Extra uploads are summarized only after an explicit valid reply or a manual dashboard action.

## Deploying to Vercel

1. Push the repo to GitHub.
2. Import the project into Vercel.
3. Add all required environment variables in Vercel Project Settings.
4. Set `APP_BASE_URL` to the deployed Vercel URL.
5. Set `DASHBOARD_PASSWORD`.
6. Run the Supabase migration in production.
7. Deploy.
8. Confirm `/login` works.
9. Confirm `/dashboard` redirects to `/login` when unauthenticated.
10. Configure the Twilio phone number Incoming Message Webhook to `{APP_BASE_URL}/api/sms/inbound`.
11. Set `TWILIO_STATUS_CALLBACK_URL` to `{APP_BASE_URL}/api/twilio/status`.
12. Confirm Vercel Cron is enabled.
13. Verify `/api/health` returns ready status.

The protected dashboard pages use an HTTP-only `delta_auth` cookie set after a correct password login. Cron and webhook routes are not protected by the dashboard cookie: `/api/cron/weekly-report` continues to require `CRON_SECRET`, while Twilio routes use their webhook-specific validation.

## Testing

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Tests cover scoring, classification, SMS digest formatting and splitting, inbound reply parsing, environment validation, idempotency helpers, average publish-time calculation, and summary validation. CI runs the same checks on pull requests.

## Known Limitations

Public YouTube transcripts may not be available for every video. In that case, the app creates a placeholder report with the video title, link, and clear note that no transcript was available. Optional speech-to-text fallback is represented by `ENABLE_STT_FALLBACK` but intentionally disabled by default.

## Roadmap

- Admin authentication
- Optional speech-to-text fallback
- Multiple source channels
- Recipient preferences
- Delivery analytics by carrier and segment count

## Operational Notes

- `playlistItems.list` is used instead of defaulting to `search.list` because the uploads playlist is cheaper, more deterministic, and scoped to the source channel.
- Idempotency lives in database constraints: job run keys, YouTube video IDs, one summary per video, and one delivery per summary-recipient pair.
- Structured summary JSON is stored separately from rendered SMS text so the dashboard, analytics, and SMS channel can evolve independently.
- Supabase RLS is enabled and service-role access is kept server-only.
- SMS bodies use plain text and chunking to reduce unexpected segmentation.
