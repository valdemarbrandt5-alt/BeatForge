-- BeatForge ranked multiplayer foundation
-- Run this once in the Supabase SQL editor.
-- The client uses the RPC functions below instead of trusting browser supplied MMR/results.

create extension if not exists pgcrypto;

create table if not exists public.ranked_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mmr integer not null default 1000 check (mmr >= 0),
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.ranked_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mmr integer not null,
  joined_at timestamptz not null default now()
);

create table if not exists public.ranked_matches (
  id uuid primary key default gen_random_uuid(),
  player_1 uuid not null references auth.users(id) on delete cascade,
  player_2 uuid not null references auth.users(id) on delete cascade,
  status text not null default 'voting' check (status in ('voting','ready','playing','finished','cancelled')),
  candidate_chart_ids uuid[] not null default '{}',
  selected_chart_id uuid references public.charts(id) on delete set null,
  voting_ends_at timestamptz,
  player_1_score bigint not null default 0,
  player_2_score bigint not null default 0,
  player_1_finished boolean not null default false,
  player_2_finished boolean not null default false,
  player_1_mmr_before integer not null default 1000,
  player_2_mmr_before integer not null default 1000,
  player_1_mmr_delta integer,
  player_2_mmr_delta integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ranked_votes (
  match_id uuid not null references public.ranked_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chart_id uuid not null references public.charts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id,user_id)
);

alter table public.ranked_players enable row level security;
alter table public.ranked_queue enable row level security;
alter table public.ranked_matches enable row level security;
alter table public.ranked_votes enable row level security;

drop policy if exists "ranked players readable" on public.ranked_players;
create policy "ranked players readable" on public.ranked_players for select to authenticated using (true);
drop policy if exists "own ranked player insert" on public.ranked_players;
create policy "own ranked player insert" on public.ranked_players for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own queue readable" on public.ranked_queue;
create policy "own queue readable" on public.ranked_queue for select to authenticated using (user_id = auth.uid());

drop policy if exists "match participants readable" on public.ranked_matches;
create policy "match participants readable" on public.ranked_matches for select to authenticated using (auth.uid() in (player_1,player_2));
drop policy if exists "match participants update" on public.ranked_matches;
create policy "match participants update" on public.ranked_matches for update to authenticated using (auth.uid() in (player_1,player_2)) with check (auth.uid() in (player_1,player_2));

drop policy if exists "match votes readable" on public.ranked_votes;
create policy "match votes readable" on public.ranked_votes for select to authenticated using (exists(select 1 from public.ranked_matches m where m.id=match_id and auth.uid() in (m.player_1,m.player_2)));
drop policy if exists "own vote insert" on public.ranked_votes;
create policy "own vote insert" on public.ranked_votes for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.ranked_matches m where m.id=match_id and auth.uid() in (m.player_1,m.player_2)));
drop policy if exists "own vote update" on public.ranked_votes;
create policy "own vote update" on public.ranked_votes for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Picks three random songs from the current top 50 trending pool.
-- Trending is intentionally based on existing BeatForge play_count + like_count signal.
create or replace function public.rank_candidate_charts()
returns setof public.charts
language sql
security definer
set search_path=public
as $$
  with top50 as (
    select c.*
    from public.charts c
    left join lateral (select count(*)::int likes from public.chart_likes l where l.chart_id=c.id) x on true
    order by (coalesce(c.play_count,0) + coalesce(x.likes,0)*5) desc, c.created_at desc
    limit 50
  )
  select * from top50 order by random() limit 3;
$$;

grant execute on function public.rank_candidate_charts() to authenticated;

create or replace function public.join_ranked_queue()
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  me uuid := auth.uid();
  my_mmr int;
  opponent public.ranked_queue%rowtype;
  new_match uuid;
  choices uuid[];
begin
  if me is null then raise exception 'Not authenticated'; end if;
  insert into public.ranked_players(user_id) values(me) on conflict(user_id) do nothing;
  select mmr into my_mmr from public.ranked_players where user_id=me;

  -- Lock one nearest waiting opponent so two callers cannot claim the same player.
  select * into opponent
  from public.ranked_queue q
  where q.user_id<>me and q.joined_at > now()-interval '2 minutes'
  order by abs(q.mmr-my_mmr), q.joined_at
  for update skip locked
  limit 1;

  if opponent.user_id is null then
    insert into public.ranked_queue(user_id,mmr,joined_at) values(me,my_mmr,now())
    on conflict(user_id) do update set mmr=excluded.mmr,joined_at=excluded.joined_at;
    return null;
  end if;

  select coalesce(array_agg(id),'{}'::uuid[]) into choices from public.rank_candidate_charts();
  if coalesce(array_length(choices,1),0) < 3 then raise exception 'Need at least 3 community charts for ranked voting'; end if;

  insert into public.ranked_matches(player_1,player_2,candidate_chart_ids,voting_ends_at,player_1_mmr_before,player_2_mmr_before)
  values(opponent.user_id,me,choices,now()+interval '15 seconds',opponent.mmr,my_mmr)
  returning id into new_match;
  delete from public.ranked_queue where user_id in (me,opponent.user_id);
  return new_match;
end;
$$;

grant execute on function public.join_ranked_queue() to authenticated;

create or replace function public.leave_ranked_queue()
returns void language sql security definer set search_path=public as $$ delete from public.ranked_queue where user_id=auth.uid(); $$;
grant execute on function public.leave_ranked_queue() to authenticated;

create or replace function public.vote_ranked_chart(p_match uuid,p_chart uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m public.ranked_matches%rowtype;
begin
 select * into m from public.ranked_matches where id=p_match;
 if auth.uid() not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
 if not (p_chart=any(m.candidate_chart_ids)) then raise exception 'Invalid chart'; end if;
 insert into public.ranked_votes(match_id,user_id,chart_id) values(p_match,auth.uid(),p_chart)
 on conflict(match_id,user_id) do update set chart_id=excluded.chart_id,created_at=now();
end $$;
grant execute on function public.vote_ranked_chart(uuid,uuid) to authenticated;

-- Resolves the vote once both players voted or the timer expired. A tied vote is random.
create or replace function public.resolve_ranked_vote(p_match uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare m public.ranked_matches%rowtype; picked uuid; vote_count int;
begin
 select * into m from public.ranked_matches where id=p_match for update;
 if auth.uid() not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
 if m.selected_chart_id is not null then return m.selected_chart_id; end if;
 select count(*) into vote_count from public.ranked_votes where match_id=p_match;
 if vote_count<2 and now()<m.voting_ends_at then return null; end if;
 select chart_id into picked from public.ranked_votes where match_id=p_match group by chart_id order by count(*) desc, random() limit 1;
 if picked is null then picked:=m.candidate_chart_ids[1+floor(random()*array_length(m.candidate_chart_ids,1))::int]; end if;
 update public.ranked_matches set selected_chart_id=picked,status='ready',updated_at=now() where id=p_match;
 return picked;
end $$;
grant execute on function public.resolve_ranked_vote(uuid) to authenticated;

-- Realtime publication. Supabase may already contain these tables in the publication,
-- so duplicate-object errors here are harmless if rerunning individual statements.
do $$ begin alter publication supabase_realtime add table public.ranked_matches; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ranked_votes; exception when duplicate_object then null; end $$;
