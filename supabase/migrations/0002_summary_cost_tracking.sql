alter table public.summaries
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists total_tokens integer,
  add column if not exists estimated_openai_cost_usd numeric(12,6),
  add column if not exists cost_source text not null default 'estimated',
  add column if not exists model_price_snapshot jsonb not null default '{}'::jsonb;

create index if not exists summaries_created_at_idx on public.summaries(created_at desc);
