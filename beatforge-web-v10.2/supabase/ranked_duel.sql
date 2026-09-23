-- BeatForge Ranked Duel foundation
-- Run this once in Supabase SQL Editor.

create table if not exists public.ranked_ratings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  duel_mmr integer not null default 1000,
  duel_lp integer not null default 0,
  duel_wins integer not null default 0,
  duel_losses integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.duel_matches (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid references public.charts(id) on delete set null,
  difficulty text not null default 'Medium',
  status text not null default 'waiting' check (status in ('waiting','ready','playing','finished','cancelled')),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.duel_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.duel_matches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  display_name text not null,
  is_simulated boolean not null default false,
  simulated_skill numeric not null default .72,
  score integer not null default 0,
  accuracy numeric not null default 0,
  max_combo integer not null default 0,
  ready boolean not null default false,
  result text check (result in ('win','loss')),
  mmr_delta integer,
  created_at timestamptz not null default now(),
  unique(match_id,user_id)
);

alter table public.ranked_ratings enable row level security;
alter table public.duel_matches enable row level security;
alter table public.duel_players enable row level security;

drop policy if exists "ratings readable" on public.ranked_ratings;
create policy "ratings readable" on public.ranked_ratings for select using (true);
drop policy if exists "own rating insert" on public.ranked_ratings;
create policy "own rating insert" on public.ranked_ratings for insert to authenticated with check (user_id=auth.uid());

drop policy if exists "duel matches readable" on public.duel_matches;
create policy "duel matches readable" on public.duel_matches for select to authenticated using (true);
drop policy if exists "duel matches create" on public.duel_matches;
create policy "duel matches create" on public.duel_matches for insert to authenticated with check (true);

drop policy if exists "duel players readable" on public.duel_players;
create policy "duel players readable" on public.duel_players for select to authenticated using (true);
drop policy if exists "own duel player create" on public.duel_players;
create policy "own duel player create" on public.duel_players for insert to authenticated with check (user_id=auth.uid());
drop policy if exists "own duel player update" on public.duel_players;
create policy "own duel player update" on public.duel_players for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- NOTE: simulated opponents and authoritative rating changes should eventually be
-- written by a server/Edge Function using the service role, not trusted client code.
