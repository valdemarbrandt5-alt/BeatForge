-- Run once in Supabase SQL Editor. The computed density updates automatically
-- whenever a chart's notes or duration changes. No chart reanalysis is needed.

alter table public.charts
  add column if not exists note_density double precision generated always as (
    case when jsonb_typeof(notes) = 'array'
      then jsonb_array_length(notes)::double precision * 60.0 / greatest(duration::double precision,1.0)
      else 0.0 end
  ) stored;

create index if not exists charts_note_density_idx on public.charts (note_density desc,id);
create index if not exists charts_duration_sort_idx on public.charts (duration,id);

create or replace function public.discover_charts_sorted(
  p_sort text,
  p_instrument text default 'all',
  p_search text default '',
  p_creator_ids uuid[] default '{}',
  p_offset integer default 0,
  p_limit integer default 31
)
returns table (id uuid,note_density double precision)
language sql stable security invoker set search_path=public as $$
  with candidates as (
    select c.id,c.note_density,c.duration,c.play_count,
           coalesce(
             substring(c.youtube_url from '[?&]v=([A-Za-z0-9_-]{11})'),
             substring(c.youtube_url from 'youtu[.]be/([A-Za-z0-9_-]{11})'),
             'chart:'||c.id::text
           ) as song_key
    from public.charts c
    where (p_instrument='all' or coalesce(c.instrument,'mix')=p_instrument)
      and (p_search='' or c.title ilike '%'||p_search||'%'
           or coalesce(c.artist,'') ilike '%'||p_search||'%'
           or c.user_id=any(p_creator_ids))
  ), ranked as (
    select candidates.*,
           case when p_sort like 'difficulty%' then note_density else duration::double precision end as sort_value,
           row_number() over (
             partition by song_key
             order by
               case when p_sort in ('difficultyDesc','durationDesc') then
                 case when p_sort='difficultyDesc' then note_density else duration::double precision end end desc nulls last,
               case when p_sort in ('difficultyAsc','durationAsc') then
                 case when p_sort='difficultyAsc' then note_density else duration::double precision end end asc nulls last,
               play_count desc nulls last,id
           ) as song_row
    from candidates
  )
  select ranked.id,ranked.note_density
  from ranked where song_row=1
  order by
    case when p_sort in ('difficultyDesc','durationDesc') then sort_value end desc nulls last,
    case when p_sort in ('difficultyAsc','durationAsc') then sort_value end asc nulls last,
    id
  limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
$$;

grant execute on function public.discover_charts_sorted(text,text,text,uuid[],integer,integer) to anon,authenticated;
