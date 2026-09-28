-- Run in Supabase SQL Editor before using the six-song Ranked vote screen.
-- One chart per song, with the full mix preferred when available.
create or replace function public.rank_candidate_charts()
returns setof public.charts
language sql security definer set search_path=public as $$
  with chart_choices as (
    select c.id,
      row_number() over (
        partition by coalesce(
          substring(c.youtube_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),
          c.id::text
        )
        order by case when c.instrument='mix' then 0 else 1 end,
                 coalesce(c.play_count,0) desc,c.id
      ) as song_row
    from public.charts c
  ), top50 as (
    select c.*
    from public.charts c
    join chart_choices choice on choice.id=c.id and choice.song_row=1
    left join lateral (
      select count(*)::int likes from public.chart_likes l where l.chart_id=c.id
    ) x on true
    order by coalesce(c.play_count,0)+coalesce(x.likes,0)*5 desc,c.created_at desc
    limit 50
  )
  select * from top50 order by random() limit 6;
$$;
revoke all on function public.rank_candidate_charts() from public,anon;
grant execute on function public.rank_candidate_charts() to authenticated;
