-- Run once in the Supabase SQL Editor. This replaces the ranked top-50 pool,
-- confirms the full-library Battle Royale pool, and lowers only synthetic rivals.
-- Real scores, rankings, and play counts are untouched.
begin;

create or replace function public.rank_candidate_charts()
returns setof public.charts
language sql security definer set search_path=public as $$
  select c.*
  from public.charts c
  where c.id in (
    select distinct on (song_key) id
    from (
      select ch.id,ch.instrument,ch.play_count,ch.created_at,
        coalesce(substring(ch.youtube_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),ch.id::text) as song_key
      from public.charts ch
      where ch.youtube_url is not null
        and jsonb_array_length(ch.notes)>=4
    ) playable
    order by song_key,(coalesce(instrument,'mix')='mix') desc,
             play_count desc nulls last,created_at desc,id
  )
  order by random()
  limit 6;
$$;
revoke all on function public.rank_candidate_charts() from public,anon;
grant execute on function public.rank_candidate_charts() to authenticated;

create or replace function public.battle_royale_ensure_songs(p_match uuid,p_round integer)
returns void language plpgsql security definer set search_path=public as $$
declare previous_key text; inserted_count integer;
begin
  if exists (select 1 from public.battle_royale_song_choices
             where match_id=p_match and round_no=p_round) then return; end if;

  select coalesce(substring(c.youtube_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),
                  m.current_chart_id::text)
    into previous_key
  from public.battle_royale_matches m
  left join public.charts c on c.id=m.current_chart_id
  where m.id=p_match;

  insert into public.battle_royale_song_choices(match_id,round_no,chart_id)
  select p_match,p_round,picked.id
  from (
    select distinct on (song_key) playable.id,playable.song_key
    from (
      select ch.id,ch.instrument,ch.play_count,ch.created_at,
        coalesce(substring(ch.youtube_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),ch.id::text) as song_key
      from public.charts ch
      where ch.youtube_url is not null and jsonb_array_length(ch.notes)>=4
    ) playable
    where playable.song_key is distinct from previous_key
    order by song_key,(coalesce(instrument,'mix')='mix') desc,
             play_count desc nulls last,created_at desc,id
  ) picked
  order by
    exists (
      select 1 from public.battle_royale_song_choices old_choice
      join public.charts old_chart on old_chart.id=old_choice.chart_id
      where old_choice.match_id=p_match and old_choice.round_no<p_round
        and coalesce(substring(old_chart.youtube_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),old_chart.id::text)=picked.song_key
    ),
    random()
  limit 6
  on conflict do nothing;

  get diagnostics inserted_count=row_count;
  if inserted_count<>6 then
    raise exception 'Six distinct playable songs are required for Battle Royale';
  end if;
end $$;
revoke all on function public.battle_royale_ensure_songs(uuid,integer) from public,anon,authenticated;

-- Replace the old 90%-of-potential top rivals with soft placeholders.
-- The client displays at most three, and removes them as real players arrive.
update public.chart_rival_scores rival
set score=greatest(500,round(calc.perfect_taps * (
      0.56 - (rival.slot-1)*0.055 +
      mod((('x'||substr(md5(rival.chart_id::text||rival.difficulty||rival.slot),1,6))::bit(24)::int),11)/1000.0
    )))::bigint,
    max_combo=greatest(1,round(calc.note_count * (0.56 - (rival.slot-1)*0.055)))::integer
from (
  select r.chart_id,r.difficulty,
    greatest(1,ceil(jsonb_array_length(c.notes) *
      case r.difficulty when 'Easy' then 0.30 when 'Medium' then 0.50
        when 'Hard' then 0.72 else 1.0 end))::integer as note_count,
    coalesce((select sum(1000 * case when hit>=50 then 5 when hit>=30 then 4
      when hit>=20 then 3 when hit>=10 then 2 else 1 end)
      from generate_series(1,greatest(1,ceil(jsonb_array_length(c.notes) *
        case r.difficulty when 'Easy' then 0.30 when 'Medium' then 0.50
          when 'Hard' then 0.72 else 1.0 end))::integer) hit),1000)::numeric as perfect_taps
  from (select distinct chart_id,difficulty from public.chart_rival_scores) r
  join public.charts c on c.id=r.chart_id
) calc
where rival.chart_id=calc.chart_id and rival.difficulty=calc.difficulty;

commit;
