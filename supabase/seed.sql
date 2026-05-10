insert into public.channels (
  youtube_channel_id,
  youtube_handle,
  title,
  uploads_playlist_id,
  active
) values (
  'UC9eoszSENedo7ZYNGTAAGPA',
  '@indeeponthedeltawithstevec5997',
  'In Deep on the Delta with Steve Cooper',
  'UU9eoszSENedo7ZYNGTAAGPA',
  true
) on conflict (youtube_channel_id) do update set
  youtube_handle = excluded.youtube_handle,
  title = excluded.title,
  uploads_playlist_id = excluded.uploads_playlist_id,
  active = excluded.active;

-- Add verified recipients manually. Keep opt_in_confirmed=false until they have explicitly opted in.
-- insert into public.recipients (phone_e164, display_name, active, opt_in_confirmed)
-- values ('+15555550123', 'Operations recipient', true, true);
