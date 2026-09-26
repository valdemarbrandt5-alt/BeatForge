-- Run once in the Supabase SQL Editor before deploying the instrument-chart UI.
-- Existing charts default to 'mix'; all scores and song IDs stay the same.
alter table public.charts add column if not exists instrument text not null default 'mix';
alter table public.charts drop constraint if exists charts_instrument_check;
alter table public.charts add constraint charts_instrument_check
  check (instrument in ('mix', 'vocals', 'drums', 'bass', 'melody'));
create index if not exists charts_youtube_instrument_idx
  on public.charts (youtube_url, instrument);
