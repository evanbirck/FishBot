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

-- Email delivery is configured with Gmail SMTP environment variables.
