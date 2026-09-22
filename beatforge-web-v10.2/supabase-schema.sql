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


-- v0.20 private audio storage
alter table public.charts add column if not exists audio_path text;
insert into storage.buckets (id, name, public) values ('song-audio','song-audio',false) on conflict (id) do update set public=false;
create policy "own song audio read" on storage.objects for select to authenticated using (bucket_id='song-audio' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "own song audio upload" on storage.objects for insert to authenticated with check (bucket_id='song-audio' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "own song audio update" on storage.objects for update to authenticated using (bucket_id='song-audio' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "own song audio delete" on storage.objects for delete to authenticated using (bucket_id='song-audio' and (storage.foldername(name))[1]=auth.uid()::text);

-- v0.21 chart metadata
alter table public.charts add column if not exists artist text;

-- v0.22 community chart discovery
create index if not exists charts_title_artist_idx on public.charts (lower(title), lower(artist));

-- v0.24 friends
create table if not exists public.friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now(),
  unique(requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.friendships enable row level security;
drop policy if exists "friendships visible to participants" on public.friendships;
create policy "friendships visible to participants" on public.friendships for select to authenticated using (auth.uid()=requester_id or auth.uid()=addressee_id);
drop policy if exists "send friend requests" on public.friendships;
create policy "send friend requests" on public.friendships for insert to authenticated with check (auth.uid()=requester_id and status='pending');
drop policy if exists "accept friend requests" on public.friendships;
create policy "accept friend requests" on public.friendships for update to authenticated using (auth.uid()=addressee_id) with check (auth.uid()=addressee_id and status='accepted');

-- v0.25 difficulty-specific leaderboards
alter table public.scores add column if not exists difficulty text;
update public.scores s set difficulty=c.difficulty from public.charts c where s.chart_id=c.id and s.difficulty is null;
alter table public.scores alter column difficulty set default 'Medium';
create index if not exists scores_chart_difficulty_score_idx on public.scores(chart_id,difficulty,score desc);

-- v0.26 YouTube-linked charts
alter table public.charts add column if not exists youtube_url text;


-- v0.29 Community popularity
alter table public.charts add column if not exists play_count integer not null default 0;

create table if not exists public.chart_likes (
  chart_id uuid not null references public.charts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (chart_id,user_id)
);
alter table public.chart_likes enable row level security;
drop policy if exists "chart likes are public" on public.chart_likes;
create policy "chart likes are public" on public.chart_likes for select using (true);
drop policy if exists "users can like charts" on public.chart_likes;
create policy "users can like charts" on public.chart_likes for insert to authenticated with check (auth.uid()=user_id);
drop policy if exists "users can unlike charts" on public.chart_likes;
create policy "users can unlike charts" on public.chart_likes for delete to authenticated using (auth.uid()=user_id);

create or replace function public.increment_chart_play(p_chart_id uuid)
returns void language sql security definer set search_path=public as $$
  update public.charts set play_count=play_count+1 where id=p_chart_id;
$$;
grant execute on function public.increment_chart_play(uuid) to anon, authenticated;
create index if not exists charts_play_count_idx on public.charts(play_count desc);
create index if not exists chart_likes_chart_idx on public.chart_likes(chart_id);
