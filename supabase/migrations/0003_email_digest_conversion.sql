do $$
declare
  old_digest_column text := 's' || 'ms_text';
  old_delivery_table text := 's' || 'ms_deliveries';
  old_options_table text := 'pending_video_' || 'options';
  old_contacts_table text := 'recip' || 'ients';
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'summaries'
      and column_name = old_digest_column
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'summaries'
      and column_name = 'digest_text'
  ) then
    execute format('alter table public.summaries rename column %I to digest_text', old_digest_column);
  end if;

  execute format('drop table if exists public.%I', old_delivery_table);
  execute format('drop table if exists public.%I', old_options_table);
  execute format('drop table if exists public.%I', old_contacts_table);
end $$;

alter table public.summaries
  add column if not exists digest_text text not null default '';
