-- BeatForge Battle Royale v2
-- Run after battle_royale.sql.
-- Adds Battle Royale MMR, rank-aware matchmaking and gradual lobby filling.

create table if not exists public.battle_royale_ratings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mmr integer not null default 1000,
  wins integer not null default 0,
  games integer not null default 0,
  top4 integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.battle_royale_ratings enable row level security;

alter table public.battle_royale_matches
  add column if not exists rating_center integer not null default 1000,
  add column if not exists bot_fill_started_at timestamptz,
  add column if not exists next_bot_at timestamptz;

alter table public.battle_royale_players
  add column if not exists mmr_before integer,
  add column if not exists mmr_delta integer,
  add column if not exists mmr_applied boolean not null default false,
  add column if not exists bot_mmr integer;

create index if not exists battle_royale_rating_center_idx
  on public.battle_royale_matches(status,rating_center,created_at);

create or replace function public.get_battle_royale_rating()
returns table(mmr integer,wins integer,games integer,top4 integer)
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  insert into public.battle_royale_ratings(user_id) values(uid)
  on conflict(user_id) do nothing;
  return query
    select r.mmr,r.wins,r.games,r.top4
    from public.battle_royale_ratings r where r.user_id=uid;
end $$;
grant execute on function public.get_battle_royale_rating() to authenticated;

create or replace function public.battle_royale_apply_mmr(p_match uuid,p_player uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.battle_royale_players%rowtype;
  delta integer;
begin
  select * into p from public.battle_royale_players where id=p_player and match_id=p_match for update;
  if p.id is null or p.is_bot or p.user_id is null or p.placement is null or p.mmr_applied then return; end if;

  delta:=case p.placement
    when 1 then 30
    when 2 then 20
    when 3 then 12
    when 4 then 5
    when 5 then -5
    when 6 then -12
    when 7 then -20
    else -30
  end;

  insert into public.battle_royale_ratings(user_id,mmr) values(p.user_id,coalesce(p.mmr_before,1000))
  on conflict(user_id) do nothing;

  update public.battle_royale_ratings set
    mmr=greatest(0,mmr+delta),
    games=games+1,
    wins=wins+case when p.placement=1 then 1 else 0 end,
    top4=top4+case when p.placement<=4 then 1 else 0 end,
    updated_at=now()
  where user_id=p.user_id;

  update public.battle_royale_players set mmr_delta=delta,mmr_applied=true where id=p.id;
end $$;

create or replace function public.join_battle_royale()
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  mid uuid;
  existing uuid;
  my_mmr integer;
  total_players integer;
  new_center integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  insert into public.battle_royale_ratings(user_id) values(uid)
  on conflict(user_id) do nothing;
  select r.mmr into my_mmr from public.battle_royale_ratings r where r.user_id=uid;

  select p.match_id into existing
  from public.battle_royale_players p
  join public.battle_royale_matches m on m.id=p.match_id
  where p.user_id=uid and m.status in ('lobby','loading','playing','round_result')
  order by m.created_at desc limit 1;
  if existing is not null then return existing; end if;

  select m.id into mid
  from public.battle_royale_matches m
  where m.status='lobby'
    and (select count(*) from public.battle_royale_players px where px.match_id=m.id)<8
    and abs(coalesce(m.rating_center,1000)-my_mmr)
      <= least(600,180 + greatest(0,floor(extract(epoch from (now()-m.created_at)))::integer)*18)
  order by abs(coalesce(m.rating_center,1000)-my_mmr),m.created_at
  limit 1
  for update of m skip locked;

  if mid is null then
    insert into public.battle_royale_matches(
      rating_center,lobby_deadline,bot_fill_started_at,next_bot_at
    ) values(
      my_mmr,
      now()+interval '30 seconds',
      now()+interval '20 seconds',
      now()+(20+random()*3)*interval '1 second'
    ) returning id into mid;
  end if;

  select count(*) into total_players from public.battle_royale_players where match_id=mid;
  if total_players>=8 then
    -- A lobby filled between selection and insert. Make a fresh lobby instead.
    insert into public.battle_royale_matches(
      rating_center,lobby_deadline,bot_fill_started_at,next_bot_at
    ) values(
      my_mmr,
      now()+interval '30 seconds',
      now()+interval '20 seconds',
      now()+(20+random()*3)*interval '1 second'
    ) returning id into mid;
  end if;

  insert into public.battle_royale_players(match_id,user_id,is_bot,mmr_before)
  values(mid,uid,false,my_mmr)
  on conflict do nothing;

  select round(avg(coalesce(p.mmr_before,my_mmr)))::integer into new_center
  from public.battle_royale_players p where p.match_id=mid and not p.is_bot;
  update public.battle_royale_matches set rating_center=coalesce(new_center,my_mmr),updated_at=now() where id=mid;

  select count(*) into total_players from public.battle_royale_players where match_id=mid;
  if total_players>=8 then
    update public.battle_royale_matches set next_bot_at=now(),updated_at=now() where id=mid;
  end if;
  return mid;
end $$;
grant execute on function public.join_battle_royale() to authenticated;

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
  if m.id is null or m.status<>'lobby' then return; end if;

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
    if total_players<8 then
      update public.battle_royale_matches set
        next_bot_at=now()+(1.4+random()*3.2)*interval '1 second',
        updated_at=now()
      where id=p_match;
      return;
    end if;
  end if;

  select id into chart_id from public.rank_candidate_charts() order by random() limit 1;
  if chart_id is null then raise exception 'Need community charts before Battle Royale can start'; end if;

  update public.battle_royale_matches set
    status='loading',round_no=1,current_chart_id=chart_id,start_at=null,round_resolved_at=null,updated_at=now()
  where id=p_match;
end $$;
grant execute on function public.battle_royale_tick(uuid) to authenticated;

create or replace function public.battle_royale_ready(p_match uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  waiting integer;
  base_count integer:=1;
  effective integer;
  max_score bigint;
  factor numeric;
  skill numeric;
  p record;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null or m.status not in ('loading','playing') then raise exception 'Round is not ready'; end if;

  update public.battle_royale_players set ready=true
  where match_id=p_match and user_id=uid and not eliminated and difficulty is not null;
  if not found then raise exception 'Choose a difficulty first'; end if;

  select count(*) into waiting from public.battle_royale_players
  where match_id=p_match and not eliminated and not is_bot and not ready;
  if waiting>0 or m.status='playing' then return; end if;

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
grant execute on function public.battle_royale_ready(uuid) to authenticated;

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

  eliminate_count:=least(2,alive_count-1);
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

create or replace function public.battle_royale_leave(p_match uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  alive_count integer;
  humans_left integer;
  pid uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then return; end if;

  select count(*) into alive_count from public.battle_royale_players where match_id=p_match and not eliminated;
  select id into pid from public.battle_royale_players where match_id=p_match and user_id=uid and not eliminated limit 1;

  update public.battle_royale_players set eliminated=true,finished=true,ready=false,
    placement=case when m.status='lobby' then placement else coalesce(placement,alive_count) end
  where id=pid;

  if pid is not null and m.status<>'lobby' then
    perform public.battle_royale_apply_mmr(p_match,pid);
  end if;

  select count(*) into humans_left from public.battle_royale_players where match_id=p_match and not is_bot and not eliminated;
  if humans_left=0 then
    update public.battle_royale_matches set status='cancelled',updated_at=now() where id=p_match;
  end if;
end $$;
grant execute on function public.battle_royale_leave(uuid) to authenticated;

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
