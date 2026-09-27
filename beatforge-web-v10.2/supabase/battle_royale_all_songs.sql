-- Run after battle_royale_song_vote.sql. Draw six distinct playable songs
-- from the entire library, rather than the most popular 400 chart variants.
create or replace function public.battle_royale_ensure_songs(p_match uuid,p_round integer)
returns void language plpgsql security definer set search_path=public as $$
declare previous_key text; inserted_count integer;
begin
  if exists(select 1 from public.battle_royale_song_choices
    where match_id=p_match and round_no=p_round) then return; end if;

  select coalesce(
    substring(c.youtube_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),
    m.current_chart_id::text
  ) into previous_key
  from public.battle_royale_matches m
  left join public.charts c on c.id=m.current_chart_id
  where m.id=p_match;

  insert into public.battle_royale_song_choices(match_id,round_no,chart_id)
  select p_match,p_round,s.id
  from (
    select distinct on (c.song_key) c.id
    from (
      select ch.id,ch.instrument,ch.play_count,ch.created_at,
        coalesce(substring(ch.youtube_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),ch.id::text) as song_key
      from public.charts ch
      where ch.youtube_url is not null
        and jsonb_array_length(coalesce(to_jsonb(ch.notes),'[]'::jsonb))>=4
    ) c
    where c.song_key is distinct from previous_key
    order by c.song_key,(coalesce(c.instrument,'mix')='mix') desc,c.play_count desc nulls last,c.created_at desc,c.id
  ) s
  order by random()
  limit 6
  on conflict do nothing;

  get diagnostics inserted_count=row_count;
  if inserted_count<>6 then
    raise exception 'Six distinct playable songs are required for Battle Royale';
  end if;
end $$;
revoke all on function public.battle_royale_ensure_songs(uuid,integer) from public,anon,authenticated;
