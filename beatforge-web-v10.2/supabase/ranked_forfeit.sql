-- BeatForge ranked forfeit + disconnect handling
-- Run once in Supabase SQL editor after ranked_live_score.sql and ranked_sync_start.sql.

alter table public.ranked_matches
  add column if not exists player_1_seen_at timestamptz,
  add column if not exists player_2_seen_at timestamptz,
  add column if not exists forfeit_by uuid references auth.users(id) on delete set null;

create or replace function public.forfeit_ranked_match(p_match uuid)
returns table(match_status text,my_mmr integer,mmr_delta integer,forfeited_by uuid)
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.ranked_matches%rowtype;
  uid uuid := auth.uid();
  my_delta int;
  my_new_mmr int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into m from public.ranked_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if uid not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;

  -- Idempotent: repeated pagehide/beforeunload requests cannot charge MMR twice.
  if m.status='finished' then
    if uid=m.player_1 then my_delta:=coalesce(m.player_1_mmr_delta,0); else my_delta:=coalesce(m.player_2_mmr_delta,0); end if;
    select mmr into my_new_mmr from public.ranked_players where user_id=uid;
    return query select m.status,my_new_mmr,my_delta,m.forfeit_by;
    return;
  end if;

  if m.status<>'playing' then raise exception 'Match is not playing'; end if;

  if uid=m.player_1 then
    update public.ranked_players set mmr=greatest(0,mmr-20),losses=losses+1,updated_at=now() where user_id=m.player_1;
    update public.ranked_players set mmr=greatest(0,mmr+20),wins=wins+1,updated_at=now() where user_id=m.player_2;
    update public.ranked_matches set
      status='finished',player_1_finished=true,player_2_finished=true,
      player_1_mmr_delta=-20,player_2_mmr_delta=20,forfeit_by=uid,updated_at=now()
    where id=p_match;
    my_delta:=-20;
  else
    update public.ranked_players set mmr=greatest(0,mmr+20),wins=wins+1,updated_at=now() where user_id=m.player_1;
    update public.ranked_players set mmr=greatest(0,mmr-20),losses=losses+1,updated_at=now() where user_id=m.player_2;
    update public.ranked_matches set
      status='finished',player_1_finished=true,player_2_finished=true,
      player_1_mmr_delta=20,player_2_mmr_delta=-20,forfeit_by=uid,updated_at=now()
    where id=p_match;
    my_delta:=-20;
  end if;

  select mmr into my_new_mmr from public.ranked_players where user_id=uid;
  return query select 'finished'::text,my_new_mmr,my_delta,uid;
end $$;

grant execute on function public.forfeit_ranked_match(uuid) to authenticated;

create or replace function public.ranked_match_heartbeat(p_match uuid)
returns table(match_status text,my_mmr integer,mmr_delta integer,forfeited_by uuid)
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.ranked_matches%rowtype;
  uid uuid := auth.uid();
  opponent uuid;
  opponent_seen timestamptz;
  my_delta int;
  my_new_mmr int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into m from public.ranked_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if uid not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;

  if m.status='playing' then
    if uid=m.player_1 then
      update public.ranked_matches set player_1_seen_at=now() where id=p_match;
      opponent:=m.player_2;
    else
      update public.ranked_matches set player_2_seen_at=now() where id=p_match;
      opponent:=m.player_1;
    end if;

    select * into m from public.ranked_matches where id=p_match for update;
    opponent_seen:=case when uid=m.player_1 then m.player_2_seen_at else m.player_1_seen_at end;

    -- Fallback for hard tab/browser closes where the unload request never reaches Supabase.
    -- We wait 12 seconds after the shared start time to avoid false forfeits from startup jitter.
    if m.start_at is not null
       and now() > m.start_at + interval '12 seconds'
       and (opponent_seen is null or opponent_seen < now() - interval '12 seconds') then
      if opponent=m.player_1 then
        update public.ranked_players set mmr=greatest(0,mmr-20),losses=losses+1,updated_at=now() where user_id=m.player_1;
        update public.ranked_players set mmr=greatest(0,mmr+20),wins=wins+1,updated_at=now() where user_id=m.player_2;
        update public.ranked_matches set status='finished',player_1_finished=true,player_2_finished=true,
          player_1_mmr_delta=-20,player_2_mmr_delta=20,forfeit_by=opponent,updated_at=now() where id=p_match;
      else
        update public.ranked_players set mmr=greatest(0,mmr+20),wins=wins+1,updated_at=now() where user_id=m.player_1;
        update public.ranked_players set mmr=greatest(0,mmr-20),losses=losses+1,updated_at=now() where user_id=m.player_2;
        update public.ranked_matches set status='finished',player_1_finished=true,player_2_finished=true,
          player_1_mmr_delta=20,player_2_mmr_delta=-20,forfeit_by=opponent,updated_at=now() where id=p_match;
      end if;
      select * into m from public.ranked_matches where id=p_match;
    end if;
  end if;

  if uid=m.player_1 then my_delta:=coalesce(m.player_1_mmr_delta,0); else my_delta:=coalesce(m.player_2_mmr_delta,0); end if;
  select mmr into my_new_mmr from public.ranked_players where user_id=uid;
  return query select m.status,my_new_mmr,my_delta,m.forfeit_by;
end $$;

grant execute on function public.ranked_match_heartbeat(uuid) to authenticated;
