-- Apply once after battle_royale_song_vote.sql.
-- First-round choices and votes open only when the eight-player lobby is ready.

create or replace function public.get_battle_royale_song_vote(p_match uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.battle_royale_matches%rowtype; target_round integer; result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.battle_royale_players
    where match_id=p_match and user_id=auth.uid()) then raise exception 'Not in match'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.status not in ('lobby','round_result') then return null; end if;
  if m.status='lobby' and (m.vote_opens_at is null or
    (select count(*) from public.battle_royale_players where match_id=p_match)<8) then return null; end if;
  target_round:=case when m.status='lobby' then 1 else m.round_no+1 end;
  perform public.battle_royale_ensure_songs(p_match,target_round);
  select jsonb_build_object('round_no',target_round,'deadline',
      case when m.status='lobby' then m.lobby_deadline else m.round_resolved_at+interval '30 seconds' end,
      'server_now',now(),
      'my_vote',(select v.chart_id from public.battle_royale_song_votes v
        where v.match_id=p_match and v.round_no=target_round and v.user_id=auth.uid()),
      'songs',coalesce(jsonb_agg(jsonb_build_object('id',c.chart_id,'title',ch.title,
        'artist',ch.artist,'youtube_url',ch.youtube_url,'votes',
        (select count(*) from public.battle_royale_song_votes v
          where v.match_id=p_match and v.round_no=target_round and v.chart_id=c.chart_id)
      ) order by ch.title),'[]'::jsonb)) into result
  from public.battle_royale_song_choices c join public.charts ch on ch.id=c.chart_id
  where c.match_id=p_match and c.round_no=target_round;
  return result;
end $$;
grant execute on function public.get_battle_royale_song_vote(uuid) to authenticated;

create or replace function public.vote_battle_royale_song(p_match uuid,p_chart uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m public.battle_royale_matches%rowtype; target_round integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if not exists(select 1 from public.battle_royale_players
    where match_id=p_match and user_id=auth.uid() and not is_bot and not eliminated) then
    raise exception 'Only active players may vote';
  end if;
  if m.status='lobby' and m.vote_opens_at is not null and now()<m.lobby_deadline
    and (select count(*) from public.battle_royale_players where match_id=p_match)>=8 then target_round:=1;
  elsif m.status='round_result' and now()<m.round_resolved_at+interval '30 seconds' then target_round:=m.round_no+1;
  else raise exception 'Voting is closed'; end if;
  perform public.battle_royale_ensure_songs(p_match,target_round);
  if not exists(select 1 from public.battle_royale_song_choices
    where match_id=p_match and round_no=target_round and chart_id=p_chart) then raise exception 'Song is not a choice'; end if;
  insert into public.battle_royale_song_votes(match_id,round_no,user_id,chart_id)
  values(p_match,target_round,auth.uid(),p_chart)
  on conflict(match_id,round_no,user_id) do update set chart_id=excluded.chart_id;
end $$;
grant execute on function public.vote_battle_royale_song(uuid,uuid) to authenticated;
