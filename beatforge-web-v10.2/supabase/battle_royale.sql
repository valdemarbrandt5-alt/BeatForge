-- BeatForge Battle Royale v1
-- Run in Supabase SQL Editor.
-- Completely separate from Ranked/Casual tables and MMR.

create table if not exists public.battle_royale_matches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'lobby' check (status in ('lobby','loading','playing','round_result','finished','cancelled')),
  round_no integer not null default 0,
  current_chart_id uuid references public.charts(id) on delete set null,
  start_at timestamptz,
  lobby_deadline timestamptz not null default (now() + interval '20 seconds'),
  round_resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.battle_royale_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.battle_royale_matches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  is_bot boolean not null default false,
  bot_name text,
  difficulty text,
  ready boolean not null default false,
  score bigint not null default 0,
  combo integer not null default 0,
  max_combo integer not null default 0,
  finished boolean not null default false,
  eliminated boolean not null default false,
  placement integer,
  bot_target_score bigint not null default 0,
  joined_at timestamptz not null default now(),
  check ((is_bot and user_id is null and bot_name is not null) or (not is_bot and user_id is not null)),
  check (difficulty is null or difficulty in ('Easy','Medium','Hard','Expert'))
);

create unique index if not exists battle_royale_one_human_per_match_idx
  on public.battle_royale_players(match_id,user_id) where user_id is not null;
create index if not exists battle_royale_match_players_idx on public.battle_royale_players(match_id,eliminated);
create index if not exists battle_royale_open_matches_idx on public.battle_royale_matches(status,created_at);

alter table public.battle_royale_matches enable row level security;
alter table public.battle_royale_players enable row level security;
-- Access is intentionally through security-definer RPCs below. No direct table policies are required.

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
  humans integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select p.match_id into existing
  from public.battle_royale_players p
  join public.battle_royale_matches m on m.id=p.match_id
  where p.user_id=uid and m.status in ('lobby','loading','playing','round_result')
  order by m.created_at desc limit 1;
  if existing is not null then return existing; end if;

  select m.id into mid
  from public.battle_royale_matches m
  where m.status='lobby' and m.lobby_deadline>now()
  order by m.created_at
  limit 1
  for update skip locked;

  if mid is not null then
    select count(*) into humans from public.battle_royale_players where match_id=mid and not is_bot;
    if humans>=8 then mid:=null; end if;
  end if;

  if mid is null then
    insert into public.battle_royale_matches default values returning id into mid;
  end if;

  insert into public.battle_royale_players(match_id,user_id,is_bot)
  values(mid,uid,false)
  on conflict do nothing;

  select count(*) into humans from public.battle_royale_players where match_id=mid and not is_bot;
  if humans>=8 then
    update public.battle_royale_matches set lobby_deadline=now(),updated_at=now() where id=mid;
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
  i integer;
  chart_id uuid;
  names text[]:=array['NOVA','Echo','Pulse','Mira','Vex','Luna','Riff','Kairo'];
  diff text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.battle_royale_players where match_id=p_match and user_id=uid) then raise exception 'Not in Battle Royale'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then return; end if;
  if m.status<>'lobby' then return; end if;

  select count(*) into humans from public.battle_royale_players where match_id=p_match and not is_bot;
  if humans<8 and now()<m.lobby_deadline then return; end if;
  if humans=0 then update public.battle_royale_matches set status='cancelled',updated_at=now() where id=p_match; return; end if;

  select count(*) into total_players from public.battle_royale_players where match_id=p_match;
  if total_players<8 then
    for i in total_players+1..8 loop
      diff:=case floor(random()*4)::int when 0 then 'Easy' when 1 then 'Medium' when 2 then 'Hard' else 'Expert' end;
      insert into public.battle_royale_players(match_id,is_bot,bot_name,difficulty,ready)
      values(p_match,true,names[i],diff,true);
    end loop;
  end if;

  select id into chart_id from public.rank_candidate_charts() order by random() limit 1;
  if chart_id is null then raise exception 'Need community charts before Battle Royale can start'; end if;

  update public.battle_royale_matches set
    status='loading',round_no=1,current_chart_id=chart_id,start_at=null,round_resolved_at=null,updated_at=now()
  where id=p_match;
end $$;
grant execute on function public.battle_royale_tick(uuid) to authenticated;

create or replace function public.battle_royale_choose_difficulty(p_match uuid,p_difficulty text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  d text:=initcap(lower(trim(p_difficulty)));
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if d not in ('Easy','Medium','Hard','Expert') then raise exception 'Invalid difficulty'; end if;
  if not exists(select 1 from public.battle_royale_matches where id=p_match and status='loading') then raise exception 'Round is not loading'; end if;
  update public.battle_royale_players set difficulty=d,ready=false
  where match_id=p_match and user_id=uid and not eliminated;
  if not found then raise exception 'Not an active player'; end if;
end $$;
grant execute on function public.battle_royale_choose_difficulty(uuid,text) to authenticated;

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

  for p in select id,difficulty from public.battle_royale_players where match_id=p_match and not eliminated and is_bot loop
    factor:=case p.difficulty when 'Easy' then 0.38 when 'Medium' then 0.65 when 'Hard' then 0.87 else 1.10 end;
    effective:=greatest(1,round(base_count*factor)::int);
    max_score:=
        least(effective,9)::bigint*1000
      + greatest(least(effective,19)-9,0)::bigint*2000
      + greatest(least(effective,29)-19,0)::bigint*3000
      + greatest(least(effective,49)-29,0)::bigint*4000
      + greatest(effective-49,0)::bigint*5000;
    update public.battle_royale_players set
      bot_target_score=greatest(1000,round(max_score::numeric*(0.62::numeric+random()::numeric*0.31::numeric))::bigint),
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
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then raise exception 'Battle Royale not found'; end if;
  if m.status not in ('playing','round_result','finished') then return; end if;
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
      least(320,greatest(12,(bot_target_score/least(9000::bigint,greatest(3500::bigint,bot_target_score/120)))::integer))),
    finished=true
  where match_id=p_match and not eliminated and is_bot;

  select count(*) into alive_count from public.battle_royale_players where match_id=p_match and not eliminated;
  if alive_count<=1 then
    update public.battle_royale_players set placement=1 where match_id=p_match and not eliminated;
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

  select count(*) into remaining from public.battle_royale_players where match_id=p_match and not eliminated;
  if remaining=1 then
    update public.battle_royale_players set placement=1 where match_id=p_match and not eliminated;
    update public.battle_royale_matches set status='finished',round_resolved_at=now(),updated_at=now() where id=p_match;
  else
    update public.battle_royale_matches set status='round_result',round_resolved_at=now(),updated_at=now() where id=p_match;
  end if;
end $$;
grant execute on function public.battle_royale_update(uuid,bigint,integer,boolean) to authenticated;

create or replace function public.battle_royale_next_round(p_match uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  chart_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.battle_royale_players where match_id=p_match and user_id=uid and not eliminated) then raise exception 'You were eliminated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.status='loading' then return; end if;
  if m.status<>'round_result' then raise exception 'Round is not complete'; end if;

  select id into chart_id from public.rank_candidate_charts()
  where id<>m.current_chart_id order by random() limit 1;
  if chart_id is null then select id into chart_id from public.rank_candidate_charts() order by random() limit 1; end if;
  if chart_id is null then raise exception 'No chart available'; end if;

  update public.battle_royale_players set
    difficulty=case when is_bot then difficulty else null end,
    ready=is_bot,score=0,combo=0,max_combo=0,finished=false,bot_target_score=0
  where match_id=p_match and not eliminated;

  update public.battle_royale_matches set
    status='loading',round_no=round_no+1,current_chart_id=chart_id,start_at=null,round_resolved_at=null,updated_at=now()
  where id=p_match;
end $$;
grant execute on function public.battle_royale_next_round(uuid) to authenticated;

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
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then return; end if;

  select count(*) into alive_count from public.battle_royale_players where match_id=p_match and not eliminated;
  update public.battle_royale_players set eliminated=true,finished=true,ready=false,placement=coalesce(placement,alive_count)
  where match_id=p_match and user_id=uid and not eliminated;

  select count(*) into humans_left from public.battle_royale_players where match_id=p_match and not is_bot and not eliminated;
  if m.status='lobby' and humans_left=0 then
    update public.battle_royale_matches set status='cancelled',updated_at=now() where id=p_match;
  elsif humans_left=0 then
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
