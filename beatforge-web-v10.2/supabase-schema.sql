-- BeatForge v0.18 database schema
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_url text,
  created_at timestamptz default now()
);
create table if not exists public.charts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  difficulty text not null,
  lane_count int not null check (lane_count between 3 and 5),
  duration real not null default 0,
  notes jsonb not null,
  created_at timestamptz default now()
);
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  chart_id uuid not null references public.charts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score bigint not null,
  accuracy real not null,
  max_combo int not null,
  perfect int not null default 0,
  great int not null default 0,
  good int not null default 0,
  miss int not null default 0,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
alter table public.charts enable row level security;
alter table public.scores enable row level security;
create policy "profiles readable" on public.profiles for select using (true);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);
create policy "charts readable" on public.charts for select using (true);
create policy "own charts insert" on public.charts for insert with check (auth.uid() = user_id);
create policy "own charts update" on public.charts for update using (auth.uid() = user_id);
create policy "own charts delete" on public.charts for delete using (auth.uid() = user_id);
create policy "scores readable" on public.scores for select using (true);
create policy "own scores insert" on public.scores for insert with check (auth.uid() = user_id);
