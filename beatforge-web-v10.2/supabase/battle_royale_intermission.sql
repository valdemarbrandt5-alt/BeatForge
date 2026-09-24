-- Run after battle_royale_round_timing.sql and battle_royale_full_ready_timer.sql.
-- All survivors share a 30 second intermission based on the round resolution time.
create or replace function public.battle_royale_next_round(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  chart_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.battle_royale_players
    where match_id=p_match and user_id=uid and not eliminated) then
    raise exception 'You were eliminated';
  end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then raise exception 'Battle Royale not found'; end if;
  if m.status='loading' then return; end if;
  if m.status<>'round_result' then raise exception 'Round is not complete'; end if;
  if m.round_resolved_at is null or now()<m.round_resolved_at+interval '30 seconds' then
    raise exception 'Intermission is still running';
  end if;

  select id into chart_id from public.rank_candidate_charts()
  where id<>m.current_chart_id order by random() limit 1;
  if chart_id is null then select id into chart_id from public.rank_candidate_charts() order by random() limit 1; end if;
  if chart_id is null then raise exception 'No chart available'; end if;

  update public.battle_royale_players set
    difficulty=case when is_bot then difficulty else null end,
    ready=is_bot,score=0,combo=0,max_combo=0,finished=false,bot_target_score=0
  where match_id=p_match and not eliminated;

  update public.battle_royale_matches set
    status='loading',round_no=round_no+1,current_chart_id=chart_id,
    start_at=null,round_resolved_at=null,updated_at=now()
  where id=p_match;
end $$;
grant execute on function public.battle_royale_next_round(uuid) to authenticated;

create or replace function public.battle_royale_intermission_tick(p_match uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  can_advance boolean;
  deadline timestamptz;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.battle_royale_matches where id=p_match;
  if m.id is null then raise exception 'Battle Royale not found'; end if;
  select exists(select 1 from public.battle_royale_players
    where match_id=p_match and user_id=uid and not eliminated) into can_advance;
  if not exists(select 1 from public.battle_royale_players where match_id=p_match and user_id=uid) then
    raise exception 'Not in Battle Royale';
  end if;
  deadline:=m.round_resolved_at+interval '30 seconds';
  if m.status='round_result' and can_advance and deadline is not null and now()>=deadline then
    perform public.battle_royale_next_round(p_match);
  end if;
  return jsonb_build_object('deadline',deadline,'server_now',now());
end $$;
grant execute on function public.battle_royale_intermission_tick(uuid) to authenticated;
