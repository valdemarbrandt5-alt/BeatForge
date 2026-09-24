-- Run after battle_royale_ready_deadline_guard.sql.
-- Everyone Ready starts the synchronized count in immediately. The deadline
-- still automatically readies anyone who has not responded after 15 seconds.
create or replace function public.battle_royale_guard_ready_deadline()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='loading' and old.status is distinct from 'loading' then
    new.ready_deadline:=now()+interval '15 seconds';
  elsif old.status='loading' and new.status='playing'
    and now()<coalesce(old.ready_deadline,old.updated_at+interval '15 seconds')
    and exists(select 1 from public.battle_royale_players
      where match_id=old.id and not eliminated and not ready) then
    raise exception 'Some survivors are not Ready yet';
  end if;
  return new;
end $$;

create or replace function public.battle_royale_start_round(p_match uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.battle_royale_matches%rowtype;
  base_count integer:=1;
  effective integer;
  max_score bigint;
  factor numeric;
  skill numeric;
  p record;
begin
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null or m.status<>'loading' then return; end if;
  -- Before the deadline, start only if every surviving player is Ready.
  if exists(select 1 from public.battle_royale_players
    where match_id=p_match and not eliminated and not ready) then return; end if;

  select greatest(1,coalesce(jsonb_array_length(coalesce(to_jsonb(c.notes),'[]'::jsonb)),1))
    into base_count from public.charts c where c.id=m.current_chart_id;

  for p in select id,difficulty,coalesce(bot_mmr,m.rating_center) as bot_mmr
    from public.battle_royale_players where match_id=p_match and not eliminated and is_bot loop
    factor:=case p.difficulty when 'Easy' then 0.38 when 'Medium' then 0.65 when 'Hard' then 0.87 else 1.10 end;
    effective:=greatest(1,round(base_count*factor)::int);
    max_score:=
        least(effective,9)::bigint*1000
      + greatest(least(effective,19)-9,0)::bigint*2000
      + greatest(least(effective,29)-19,0)::bigint*3000
      + greatest(least(effective,49)-29,0)::bigint*4000
      + greatest(effective-49,0)::bigint*5000;
    skill:=greatest(0.42::numeric,least(0.97::numeric,
      0.50::numeric + ((p.bot_mmr-600)::numeric/1400::numeric)*0.43::numeric
      + (random()::numeric-0.5::numeric)*0.10::numeric
    ));
    update public.battle_royale_players set
      bot_target_score=greatest(1000,round(max_score::numeric*skill*1.04::numeric)::bigint),
      score=0,combo=0,max_combo=0,finished=false,ready=true
    where id=p.id;
  end loop;

  update public.battle_royale_matches set status='playing',start_at=now()+interval '5 seconds',updated_at=now() where id=p_match;
end $$;
revoke execute on function public.battle_royale_start_round(uuid) from public;

create or replace function public.battle_royale_ready(p_match uuid)
returns void
language plpgsql security definer set search_path=public
as $$
declare uid uuid:=auth.uid(); m public.battle_royale_matches%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.battle_royale_players
    where match_id=p_match and user_id=uid and not eliminated) then raise exception 'Not an active player'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null or m.status<>'loading' then raise exception 'Round is not loading'; end if;
  if now()>=coalesce(m.ready_deadline,m.updated_at+interval '15 seconds') then
    update public.battle_royale_players set
      difficulty=coalesce(difficulty,'Medium'),ready=true
    where match_id=p_match and not eliminated and not is_bot and not ready;
    perform public.battle_royale_start_round(p_match);
    return;
  end if;
  update public.battle_royale_players set ready=true
  where match_id=p_match and user_id=uid and not eliminated and difficulty is not null;
  if not found then raise exception 'Choose a difficulty first'; end if;
  -- The last Ready starts the synchronized five second count in immediately.
  perform public.battle_royale_start_round(p_match);
end $$;
grant execute on function public.battle_royale_ready(uuid) to authenticated;
