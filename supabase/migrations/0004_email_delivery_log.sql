create table if not exists public.email_deliveries (
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

create index if not exists email_deliveries_status_idx on public.email_deliveries(status);
create index if not exists email_deliveries_created_at_idx on public.email_deliveries(created_at desc);

alter table public.email_deliveries enable row level security;
