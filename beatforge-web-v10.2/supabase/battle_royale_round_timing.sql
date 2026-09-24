-- Run after battle_royale_human_priority.sql and battle_royale_lobby_profile.sql.
-- Each loading phase lasts at most 15 seconds. Missing choices default to Medium.
-- Leavers count toward the round's 8 -> 6 -> 4 -> 2 -> 1 survivor targets.

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
  if exists(select 1 from public.battle_royale_players
    where match_id=p_match and not eliminated and not is_bot and not ready) then return; end if;

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

create or replace function public.battle_royale_choose_difficulty(p_match uuid,p_difficulty text)
returns void
language plpgsql security definer set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  d text:=initcap(lower(trim(p_difficulty)));
  m public.battle_royale_matches%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if d not in ('Easy','Medium','Hard','Expert') then raise exception 'Invalid difficulty'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null or m.status<>'loading' or now()>=m.updated_at+interval '15 seconds' then
    raise exception 'Difficulty selection has closed';
  end if;
  update public.battle_royale_players set difficulty=d,ready=false
  where match_id=p_match and user_id=uid and not eliminated;
  if not found then raise exception 'Not an active player'; end if;
end $$;
grant execute on function public.battle_royale_choose_difficulty(uuid,text) to authenticated;

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
  if now()>=m.updated_at+interval '15 seconds' then
    update public.battle_royale_players set
      difficulty=coalesce(difficulty,'Medium'),ready=true
    where match_id=p_match and not eliminated and not is_bot and not ready;
    perform public.battle_royale_start_round(p_match);
    return;
  end if;
  update public.battle_royale_players set ready=true
  where match_id=p_match and user_id=uid and not eliminated and difficulty is not null;
  if not found then raise exception 'Choose a difficulty first'; end if;
  perform public.battle_royale_start_round(p_match);
end $$;
grant execute on function public.battle_royale_ready(uuid) to authenticated;

create or replace function public.battle_royale_tick(p_match uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  humans integer;
  total_players integer;
  add_count integer:=0;
  i integer;
  chart_id uuid;
  names text[]:=array['NOVA','Echo','Pulse','Mira','Vex','Luna','Riff','Kairo','Neon','Astra','Flux','Jinx','Orbit','Sora','Nyx','Tempo'];
  chosen_name text;
  chosen_mmr integer;
  diff text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.battle_royale_players where match_id=p_match and user_id=uid) then raise exception 'Not in Battle Royale'; end if;

  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then return; end if;
  if m.status='loading' then
    if now()>=m.updated_at+interval '15 seconds' then
      update public.battle_royale_players set
        difficulty=coalesce(difficulty,'Medium'),ready=true
      where match_id=p_match and not eliminated and not is_bot and not ready;
      perform public.battle_royale_start_round(p_match);
    end if;
    return;
  end if;
  if m.status<>'lobby' then return; end if;

  select count(*) filter(where not is_bot),count(*)
    into humans,total_players
    from public.battle_royale_players where match_id=p_match;

  if humans=0 then
    update public.battle_royale_matches set status='cancelled',updated_at=now() where id=p_match;
    return;
  end if;

  -- Before 20 seconds, only real players can enter. From 20-30 seconds,
  -- synthetic opponents arrive in small staggered groups so the lobby fills naturally.
  if total_players<8 then
    if now()>=m.created_at+interval '30 seconds' then
      add_count:=8-total_players;
    elsif now()>=coalesce(m.next_bot_at,m.created_at+interval '20 seconds') then
      add_count:=least(8-total_players,case when random()<0.24 then 2 else 1 end);
    else
      return;
    end if;

    for i in 1..add_count loop
      select n into chosen_name
      from unnest(names) as n
      where not exists(
        select 1 from public.battle_royale_players p
        where p.match_id=p_match and lower(coalesce(p.bot_name,''))=lower(n)
      )
      order by random() limit 1;
      if chosen_name is null then chosen_name:='Player '||(total_players+i+1)::text; end if;

      chosen_mmr:=greatest(500,m.rating_center + floor(random()*281)::integer - 140);
      diff:=case
        when chosen_mmr<800 then 'Easy'
        when chosen_mmr<1050 then 'Medium'
        when chosen_mmr<1350 then 'Hard'
        else 'Expert'
      end;

      insert into public.battle_royale_players(match_id,is_bot,bot_name,difficulty,ready,bot_mmr)
      values(p_match,true,chosen_name,diff,true,chosen_mmr);
    end loop;

    select count(*) into total_players from public.battle_royale_players where match_id=p_match;
    if total_players>=8 then
      update public.battle_royale_matches set lobby_deadline=now()+interval '3 seconds',updated_at=now() where id=p_match;
      return;
    end if;
    if total_players<8 then
      update public.battle_royale_matches set
        next_bot_at=now()+(1.4+random()*3.2)*interval '1 second',
        updated_at=now()
      where id=p_match;
      return;
    end if;
  end if;

  -- Hold a full lobby for three seconds. A departure resets this deadline.
  if m.lobby_deadline > now() then return; end if;

  select id into chart_id from public.rank_candidate_charts() order by random() limit 1;
  if chart_id is null then raise exception 'Need community charts before Battle Royale can start'; end if;

  update public.battle_royale_matches set
    status='loading',round_no=1,current_chart_id=chart_id,start_at=null,round_resolved_at=null,updated_at=now()
  where id=p_match;
end $$;
grant execute on function public.battle_royale_tick(uuid) to authenticated;

create or replace function public.battle_royale_update(p_match uuid,p_score bigint,p_combo integer,p_finished boolean default false)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  waiting_humans integer;
  alive_count integer;
  eliminate_count integer;
  target_count integer;
  remaining integer;
  rec record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then raise exception 'Battle Royale not found'; end if;
  if m.status<>'playing' then return; end if;

  update public.battle_royale_players set
    score=greatest(score,greatest(0,coalesce(p_score,0))),
    combo=greatest(0,coalesce(p_combo,0)),
    max_combo=greatest(max_combo,greatest(0,coalesce(p_combo,0))),
    finished=finished or p_finished
  where match_id=p_match and user_id=uid and not eliminated;
  if not found then return; end if;

  select count(*) into waiting_humans from public.battle_royale_players
  where match_id=p_match and not eliminated and not is_bot and not finished;
  if waiting_humans>0 then return; end if;

  update public.battle_royale_players set
    score=bot_target_score,
    combo=0,
    max_combo=greatest(max_combo,
      least(360,greatest(12,(bot_target_score/least(9000::bigint,greatest(3500::bigint,bot_target_score/120)))::integer))),
    finished=true
  where match_id=p_match and not eliminated and is_bot;

  select count(*) into alive_count from public.battle_royale_players where match_id=p_match and not eliminated;
  if alive_count<=1 then
    update public.battle_royale_players set placement=1 where match_id=p_match and not eliminated;
    for rec in select id from public.battle_royale_players where match_id=p_match and placement=1 and not is_bot loop
      perform public.battle_royale_apply_mmr(p_match,rec.id);
    end loop;
    update public.battle_royale_matches set status='finished',round_resolved_at=now(),updated_at=now() where id=p_match;
    return;
  end if;

  target_count:=case m.round_no when 1 then 6 when 2 then 4 when 3 then 2 else 1 end;
  eliminate_count:=least(greatest(alive_count-target_count,0),alive_count-1);
  with ranked as (
    select id,row_number() over(order by score desc,max_combo desc,id) as rn
    from public.battle_royale_players where match_id=p_match and not eliminated
  )
  update public.battle_royale_players p set eliminated=true,placement=r.rn
  from ranked r where p.id=r.id and r.rn>alive_count-eliminate_count;

  for rec in select id from public.battle_royale_players
    where match_id=p_match and eliminated and placement is not null and not is_bot and not mmr_applied loop
    perform public.battle_royale_apply_mmr(p_match,rec.id);
  end loop;

  select count(*) into remaining from public.battle_royale_players where match_id=p_match and not eliminated;
  if remaining=1 then
    update public.battle_royale_players set placement=1 where match_id=p_match and not eliminated;
    for rec in select id from public.battle_royale_players where match_id=p_match and placement=1 and not is_bot loop
      perform public.battle_royale_apply_mmr(p_match,rec.id);
    end loop;
    update public.battle_royale_matches set status='finished',round_resolved_at=now(),updated_at=now() where id=p_match;
  else
    update public.battle_royale_matches set status='round_result',round_resolved_at=now(),updated_at=now() where id=p_match;
  end if;
end $$;
grant execute on function public.battle_royale_update(uuid,bigint,integer,boolean) to authenticated;

create or replace function public.get_battle_royale_state(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  chart_row public.charts%rowtype;
  duration_s numeric:=1;
  progress numeric:=0;
  payload jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.battle_royale_players where match_id=p_match and user_id=uid) then raise exception 'Not in Battle Royale'; end if;
  select * into m from public.battle_royale_matches where id=p_match;
  if m.id is null then raise exception 'Battle Royale not found'; end if;

  if m.current_chart_id is not null then
    select * into chart_row from public.charts where id=m.current_chart_id;
    duration_s:=greatest(coalesce(chart_row.duration,1)::numeric,1::numeric);
  end if;
  if m.status='playing' and m.start_at is not null then
    progress:=least(1::numeric,greatest(0::numeric,(extract(epoch from (now()-m.start_at))::numeric-5.55::numeric)/duration_s));
  end if;

  select jsonb_build_object(
    'id',m.id,
    'status',m.status,
    'round_no',m.round_no,
    'start_at',m.start_at,
    'server_now',now(),
    'lobby_deadline',m.lobby_deadline,
    'ready_deadline',case when m.status='loading' then m.updated_at+interval '15 seconds' else null end,
    'rating_center',m.rating_center,
    'chart',case when m.current_chart_id is null then null else jsonb_build_object(
      'id',chart_row.id,'title',chart_row.title,'artist',chart_row.artist,'youtube_url',chart_row.youtube_url
    ) end,
    'players',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'user_id',p.user_id,
        'name',case when p.is_bot then p.bot_name else coalesce(pr.username,'Player') end,
        'is_bot',p.is_bot,
        'difficulty',p.difficulty,
        'ready',p.ready,
        'mmr',case when p.is_bot then coalesce(p.bot_mmr,m.rating_center) else coalesce(p.mmr_before,1000) end,
        'mmr_before',p.mmr_before,
        'mmr_delta',p.mmr_delta,
        'score',case when p.is_bot and m.status='playing' and not p.finished then least(p.bot_target_score,floor(p.bot_target_score::numeric*power(progress::double precision,1.06))::bigint) else p.score end,
        'combo',case when p.is_bot and m.status='playing' and not p.finished then ((greatest(0,floor(progress*520)::int)+(abs(hashtext(p.id::text))%43))%261) else p.combo end,
        'max_combo',p.max_combo,
        'finished',p.finished,
        'eliminated',p.eliminated,
        'placement',p.placement,
        'me',(p.user_id=uid)
      ) order by p.eliminated,p.placement nulls first,p.score desc,p.joined_at)
      from public.battle_royale_players p
      left join public.profiles pr on pr.id=p.user_id
      where p.match_id=m.id
    ),'[]'::jsonb)
  ) into payload;
  return payload;
end $$;
grant execute on function public.get_battle_royale_state(uuid) to authenticated;
