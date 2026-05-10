create extension if not exists pgcrypto;

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  youtube_channel_id text not null unique,
  youtube_handle text,
  title text not null,
  uploads_playlist_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_checked_at timestamptz
);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  youtube_video_id text not null unique,
  title text not null,
  description text,
  video_url text not null,
  published_at timestamptz not null,
  detected_as_weekly_report boolean not null default false,
  report_score integer not null default 0,
  classification text not null default 'extra_upload'
    check (classification in ('weekly_report','possible_report','extra_upload','ignored')),
  classification_status text not null default 'pending'
    check (classification_status in ('pending','classified','failed')),
  classification_confidence text not null default 'low'
    check (classification_confidence in ('high','medium','low')),
  classification_score numeric not null default 0,
  classification_reason text,
  recommended_action text not null default 'ask_user'
    check (recommended_action in ('auto_summarize','ask_user','ignore')),
  user_approval_status text not null default 'none'
    check (user_approval_status in ('none','summary_available_on_request','user_approved','ignored','summarized')),
  approval_requested_at timestamptz,
  approved_at timestamptz,
  ignored_at timestamptz,
  included_in_digest_at timestamptz,
  summarized_at timestamptz,
  transcript_status text not null default 'pending'
    check (transcript_status in ('pending','found','missing','placeholder','failed')),
  transcript_source text,
  transcript_language text,
  transcript_text text,
  transcript_hash text,
  duration_seconds integer,
  discovered_at timestamptz not null default now(),
  processed_at timestamptz
);

create index videos_channel_published_idx on public.videos(channel_id, published_at desc);
create index videos_published_idx on public.videos(published_at desc);
create index videos_report_score_idx on public.videos(report_score desc);
create index videos_classification_status_idx on public.videos(classification_status);
create index videos_user_approval_status_idx on public.videos(user_approval_status);

create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null unique references public.videos(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  summary_json jsonb not null,
  digest_text text not null,
  char_count integer not null,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_openai_cost_usd numeric(12,6),
  cost_source text not null default 'estimated',
  model_price_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index summaries_created_at_idx on public.summaries(created_at desc);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid references public.summaries(id) on delete set null,
  subject text not null,
  email_to text not null,
  email_from text not null,
  provider text not null default 'gmail_smtp',
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','skipped','failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_deliveries_status_idx on public.email_deliveries(status);
create index email_deliveries_created_at_idx on public.email_deliveries(created_at desc);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  run_key text not null,
  status text not null check (status in ('started','succeeded','failed','skipped')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(job_name, run_key)
);

alter table public.channels enable row level security;
alter table public.videos enable row level security;
alter table public.summaries enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.job_runs enable row level security;

create policy "public can read channels" on public.channels for select using (true);
create policy "public can read videos" on public.videos for select using (true);
create policy "public can read summaries" on public.summaries for select using (true);
create policy "public can read job runs" on public.job_runs for select using (true);
