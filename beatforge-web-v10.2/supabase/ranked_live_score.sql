-- BeatForge ranked live scoring + authoritative result/MMR settlement
-- Run once after ranked_multiplayer.sql and ranked_sync_start.sql.

create or replace function public.update_ranked_score(p_match uuid, p_score bigint, p_finished boolean default false)
returns table(opponent_score bigint, match_status text, my_mmr integer, mmr_delta integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.ranked_matches%rowtype;
  uid uuid := auth.uid();
  opp_score bigint;
  my_new_mmr int;
  my_delta int;
  p1_delta int;
  p2_delta int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.ranked_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if uid not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
  if m.status not in ('playing','finished') then raise exception 'Match is not playing'; end if;

  -- Scores may only move upward. This also makes duplicate/retried updates harmless.
  if uid=m.player_1 then
    update public.ranked_matches set
      player_1_score=greatest(player_1_score,greatest(0,p_score)),
      player_1_finished=player_1_finished or p_finished,
      updated_at=now()
    where id=p_match;
  else
    update public.ranked_matches set
      player_2_score=greatest(player_2_score,greatest(0,p_score)),
      player_2_finished=player_2_finished or p_finished,
      updated_at=now()
    where id=p_match;
  end if;

  select * into m from public.ranked_matches where id=p_match for update;

  -- Settle exactly once, when both clients have reported completion.
  if m.player_1_finished and m.player_2_finished and m.status<>'finished' then
    if m.player_1_score=m.player_2_score then
      p1_delta:=0; p2_delta:=0;
      update public.ranked_players set draws=draws+1,updated_at=now() where user_id in (m.player_1,m.player_2);
    elsif m.player_1_score>m.player_2_score then
      p1_delta:=20; p2_delta:=-20;
      update public.ranked_players set mmr=greatest(0,mmr+20),wins=wins+1,updated_at=now() where user_id=m.player_1;
      update public.ranked_players set mmr=greatest(0,mmr-20),losses=losses+1,updated_at=now() where user_id=m.player_2;
    else
      p1_delta:=-20; p2_delta:=20;
      update public.ranked_players set mmr=greatest(0,mmr-20),losses=losses+1,updated_at=now() where user_id=m.player_1;
      update public.ranked_players set mmr=greatest(0,mmr+20),wins=wins+1,updated_at=now() where user_id=m.player_2;
    end if;
    update public.ranked_matches set status='finished',player_1_mmr_delta=p1_delta,player_2_mmr_delta=p2_delta,updated_at=now() where id=p_match;
    select * into m from public.ranked_matches where id=p_match;
  end if;

  if uid=m.player_1 then opp_score:=m.player_2_score; my_delta:=m.player_1_mmr_delta;
  else opp_score:=m.player_1_score; my_delta:=m.player_2_mmr_delta; end if;
  select mmr into my_new_mmr from public.ranked_players where user_id=uid;
  return query select opp_score,m.status,my_new_mmr,coalesce(my_delta,0);
end $$;

grant execute on function public.update_ranked_score(uuid,bigint,boolean) to authenticated;

create or replace function public.get_ranked_live(p_match uuid)
returns table(player_1_score bigint,player_2_score bigint,player_1_finished boolean,player_2_finished boolean,status text,player_1_mmr_delta integer,player_2_mmr_delta integer)
language plpgsql
security definer
set search_path=public
as $$
declare m public.ranked_matches%rowtype;
begin
 select * into m from public.ranked_matches where id=p_match;
 if m.id is null then raise exception 'Match not found'; end if;
 if auth.uid() not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
 return query select m.player_1_score,m.player_2_score,m.player_1_finished,m.player_2_finished,m.status,m.player_1_mmr_delta,m.player_2_mmr_delta;
end $$;
grant execute on function public.get_ranked_live(uuid) to authenticated;
