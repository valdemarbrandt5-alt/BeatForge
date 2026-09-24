-- BeatForge ranked bot fallback
-- Run this in the Supabase SQL editor after the existing ranked SQL files.
-- Bot matches are stored separately so the known-good human-vs-human ranked path stays untouched.

create table if not exists public.ranked_bot_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'voting' check (status in ('voting','ready','playing','finished','cancelled')),
  bot_name text not null,
  bot_mmr integer not null,
  user_mmr_before integer not null,
  candidate_chart_ids uuid[] not null default '{}',
  bot_vote_chart_id uuid references public.charts(id) on delete set null,
  user_vote_chart_id uuid references public.charts(id) on delete set null,
  selected_chart_id uuid references public.charts(id) on delete set null,
  voting_ends_at timestamptz,
  bot_difficulty text not null default 'Medium',
  user_difficulty text,
  start_at timestamptz,
  user_score bigint not null default 0,
  bot_score bigint not null default 0,
  bot_target_score bigint not null default 0,
  user_finished boolean not null default false,
  mmr_delta integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ranked_bot_matches_user_status_idx
  on public.ranked_bot_matches(user_id,status,created_at desc);

alter table public.ranked_bot_matches enable row level security;

drop policy if exists "own ranked bot matches readable" on public.ranked_bot_matches;
create policy "own ranked bot matches readable" on public.ranked_bot_matches
for select to authenticated
using (user_id=auth.uid());

-- Atomically converts a still-waiting queue entry into a bot match.
-- If a real player matched the user first, this returns null and the normal ranked flow wins the race.
create or replace function public.start_ranked_bot_match()
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  my_mmr integer;
  q public.ranked_queue%rowtype;
  choices uuid[];
  names text[] := array['NOVA','Kairo','Pulse','Mira','Vex','Echo','Luna','Riff'];
  chosen_name text;
  chosen_mmr integer;
  chosen_diff text;
  bot_vote uuid;
  new_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  insert into public.ranked_players(user_id) values(uid)
  on conflict(user_id) do nothing;
  select mmr into my_mmr from public.ranked_players where user_id=uid;

  -- Lock our queue row. Human matchmaking also locks queue rows, so only one side can win.
  select * into q from public.ranked_queue where user_id=uid for update;
  if q.user_id is null then return null; end if;

  if exists(
    select 1 from public.ranked_matches m
    where uid in (m.player_1,m.player_2)
      and m.status in ('voting','ready','playing')
  ) then
    return null;
  end if;

  if exists(
    select 1 from public.ranked_bot_matches b
    where b.user_id=uid and b.status='playing'
  ) then
    return null;
  end if;

  update public.ranked_bot_matches
    set status='cancelled',updated_at=now()
    where user_id=uid and status in ('voting','ready');

  select coalesce(array_agg(id),'{}'::uuid[])
    into choices
    from public.rank_candidate_charts();
  if coalesce(array_length(choices,1),0) < 3 then
    raise exception 'Need at least 3 community charts for ranked bot matchmaking';
  end if;

  chosen_mmr := greatest(500,my_mmr + floor(random()*161)::int - 80);
  chosen_name := names[1 + floor(random()*array_length(names,1))::int];
  chosen_diff := case
    when chosen_mmr < 850 then 'Easy'
    when chosen_mmr < 1100 then 'Medium'
    when chosen_mmr < 1400 then 'Hard'
    else 'Expert'
  end;
  bot_vote := choices[1 + floor(random()*array_length(choices,1))::int];

  insert into public.ranked_bot_matches(
    user_id,bot_name,bot_mmr,user_mmr_before,candidate_chart_ids,
    bot_vote_chart_id,voting_ends_at,bot_difficulty
  ) values(
    uid,chosen_name,chosen_mmr,my_mmr,choices,
    bot_vote,now()+interval '15 seconds',chosen_diff
  ) returning id into new_id;

  delete from public.ranked_queue where user_id=uid;
  return new_id;
end $$;

grant execute on function public.start_ranked_bot_match() to authenticated;

-- The bot has already voted. If the player votes for another chart, the tied vote is resolved randomly.
create or replace function public.vote_ranked_bot_chart(p_match uuid,p_chart uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  m public.ranked_bot_matches%rowtype;
  picked uuid;
  base_count integer;
  effective_count integer;
  factor numeric;
  max_score bigint;
  skill numeric;
  target bigint;
begin
  select * into m from public.ranked_bot_matches where id=p_match for update;
  if m.id is null then raise exception 'Bot match not found'; end if;
  if m.user_id<>uid then raise exception 'Not in bot match'; end if;
  if m.selected_chart_id is not null then return m.selected_chart_id; end if;
  if m.status<>'voting' then raise exception 'Bot match is not voting'; end if;
  if not (p_chart=any(m.candidate_chart_ids)) then raise exception 'Invalid chart'; end if;

  if p_chart=m.bot_vote_chart_id then picked:=p_chart;
  elsif random()<0.5 then picked:=p_chart;
  else picked:=m.bot_vote_chart_id;
  end if;

  select coalesce(jsonb_array_length(coalesce(to_jsonb(c.notes),'[]'::jsonb)),0)
    into base_count
    from public.charts c where c.id=picked;

  factor := case m.bot_difficulty
    when 'Easy' then 0.38
    when 'Medium' then 0.65
    when 'Hard' then 0.87
    else 1.10
  end;
  effective_count := greatest(1,round(base_count*factor)::int);

  -- Approximate BeatForge's maximum tap score including combo multipliers.
  max_score :=
      least(effective_count,9)::bigint*1000
    + greatest(least(effective_count,19)-9,0)::bigint*2000
    + greatest(least(effective_count,29)-19,0)::bigint*3000
    + greatest(least(effective_count,49)-29,0)::bigint*4000
    + greatest(effective_count-49,0)::bigint*5000;

  -- Bot skill scales with its displayed MMR, with a little natural match-to-match variance.
  skill := greatest(0.38::numeric,least(0.96::numeric,
    0.48::numeric + ((m.bot_mmr-600)::numeric/1400::numeric)*0.45::numeric
    + (random()::numeric-0.5::numeric)*0.10::numeric
  ));
  target := greatest(1000,round(max_score::numeric*skill*1.04::numeric)::bigint);

  update public.ranked_bot_matches set
    user_vote_chart_id=p_chart,
    selected_chart_id=picked,
    bot_target_score=target,
    status='ready',
    updated_at=now()
  where id=p_match;

  return picked;
end $$;

grant execute on function public.vote_ranked_bot_chart(uuid,uuid) to authenticated;

create or replace function public.set_ranked_bot_difficulty(p_match uuid,p_difficulty text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  d text := initcap(lower(trim(p_difficulty)));
  m public.ranked_bot_matches%rowtype;
begin
  if d not in ('Easy','Medium','Hard','Expert') then raise exception 'Invalid difficulty'; end if;
  select * into m from public.ranked_bot_matches where id=p_match for update;
  if m.id is null or m.user_id<>uid then raise exception 'Not in bot match'; end if;
  if m.status not in ('ready','voting') then raise exception 'Bot match already started'; end if;
  update public.ranked_bot_matches set user_difficulty=d,updated_at=now() where id=p_match;
end $$;

grant execute on function public.set_ranked_bot_difficulty(uuid,text) to authenticated;

create or replace function public.ready_ranked_bot_match(p_match uuid)
returns table(start_at timestamptz,server_now timestamptz)
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  m public.ranked_bot_matches%rowtype;
  chosen timestamptz;
begin
  select * into m from public.ranked_bot_matches where id=p_match for update;
  if m.id is null or m.user_id<>uid then raise exception 'Not in bot match'; end if;
  if m.selected_chart_id is null or m.user_difficulty is null then raise exception 'Song or difficulty not selected'; end if;
  if m.status not in ('ready','playing') then raise exception 'Bot match cannot start'; end if;

  chosen:=coalesce(m.start_at,now()+interval '5 seconds');
  update public.ranked_bot_matches
    set start_at=chosen,status='playing',updated_at=now()
    where id=p_match;
  return query select chosen,now();
end $$;

grant execute on function public.ready_ranked_bot_match(uuid) to authenticated;

create or replace function public.update_ranked_bot_score(p_match uuid,p_score bigint,p_finished boolean default false)
returns table(bot_score bigint,match_status text,my_mmr integer,mmr_delta integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  m public.ranked_bot_matches%rowtype;
  song_duration numeric := 1;
  elapsed numeric := 0;
  progress numeric := 0;
  current_bot bigint := 0;
  delta integer := 0;
  new_mmr integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.ranked_bot_matches where id=p_match for update;
  if m.id is null or m.user_id<>uid then raise exception 'Not in bot match'; end if;
  if m.status not in ('playing','finished') then raise exception 'Bot match is not playing'; end if;

  if m.status='finished' then
    select mmr into new_mmr from public.ranked_players where user_id=uid;
    return query select m.bot_score,m.status,new_mmr,coalesce(m.mmr_delta,0);
    return;
  end if;

  update public.ranked_bot_matches set
    user_score=greatest(user_score,greatest(0,p_score)),
    user_finished=user_finished or p_finished,
    updated_at=now()
  where id=p_match;
  select * into m from public.ranked_bot_matches where id=p_match for update;

  select greatest(coalesce(c.duration,1)::numeric,1::numeric)
    into song_duration from public.charts c where c.id=m.selected_chart_id;

  -- PLAY itself contains BeatForge's count-in + pre-roll (~5.55 s) before scoring begins.
  elapsed:=greatest(0::numeric,extract(epoch from (now()-m.start_at))::numeric-5.55::numeric);
  progress:=least(1::numeric,elapsed/song_duration);
  current_bot:=least(m.bot_target_score,
    floor(m.bot_target_score::numeric*power(progress::double precision,1.06))::bigint
  );

  if p_finished then current_bot:=m.bot_target_score; end if;
  update public.ranked_bot_matches set bot_score=current_bot,updated_at=now() where id=p_match;

  if p_finished then
    if m.user_score=current_bot then
      delta:=0;
      update public.ranked_players set draws=draws+1,updated_at=now() where user_id=uid;
    elsif m.user_score>current_bot then
      delta:=20;
      update public.ranked_players set mmr=greatest(0,mmr+20),wins=wins+1,updated_at=now() where user_id=uid;
    else
      delta:=-20;
      update public.ranked_players set mmr=greatest(0,mmr-20),losses=losses+1,updated_at=now() where user_id=uid;
    end if;
    update public.ranked_bot_matches set
      status='finished',bot_score=current_bot,mmr_delta=delta,updated_at=now()
      where id=p_match;
  end if;

  select * into m from public.ranked_bot_matches where id=p_match;
  select mmr into new_mmr from public.ranked_players where user_id=uid;
  return query select m.bot_score,m.status,new_mmr,coalesce(m.mmr_delta,0);
end $$;

grant execute on function public.update_ranked_bot_score(uuid,bigint,boolean) to authenticated;

create or replace function public.cancel_ranked_bot_match(p_match uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid:=auth.uid();
begin
  update public.ranked_bot_matches set status='cancelled',updated_at=now()
  where id=p_match and user_id=uid and status in ('voting','ready');
end $$;

grant execute on function public.cancel_ranked_bot_match(uuid) to authenticated;

create or replace function public.forfeit_ranked_bot_match(p_match uuid)
returns table(my_mmr integer,mmr_delta integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  m public.ranked_bot_matches%rowtype;
  new_mmr integer;
begin
  select * into m from public.ranked_bot_matches where id=p_match for update;
  if m.id is null or m.user_id<>uid then raise exception 'Not in bot match'; end if;
  if m.status='playing' then
    update public.ranked_players set mmr=greatest(0,mmr-20),losses=losses+1,updated_at=now() where user_id=uid;
    update public.ranked_bot_matches set status='finished',user_finished=true,mmr_delta=-20,updated_at=now() where id=p_match;
  end if;
  select mmr into new_mmr from public.ranked_players where user_id=uid;
  select * into m from public.ranked_bot_matches where id=p_match;
  return query select new_mmr,coalesce(m.mmr_delta,0);
end $$;

grant execute on function public.forfeit_ranked_bot_match(uuid) to authenticated;
