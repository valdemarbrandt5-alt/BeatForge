-- Persistent Friends rooms. Run once in the Supabase SQL editor after deploying the client.
-- Existing casual_invites rows remain untouched; new invitations use these tables.
create table if not exists public.friend_lobbies (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  chart_id uuid references public.charts(id) on delete set null,
  round_number integer not null default 0,
  status text not null default 'waiting' check (status in ('waiting','countdown','results','closed')),
  start_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.friend_lobby_members (
  lobby_id uuid not null references public.friend_lobbies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','active','left')),
  joined_at timestamptz not null default now(),
  round_number integer not null default 0,
  ready boolean not null default false,
  score bigint not null default 0,
  combo integer not null default 0,
  finished boolean not null default false,
  perfect integer not null default 0,
  great integer not null default 0,
  good integer not null default 0,
  miss integer not null default 0,
  max_combo integer not null default 0,
  primary key (lobby_id,user_id)
);
create index if not exists friend_lobbies_host_idx on public.friend_lobbies(host_id,status);
create index if not exists friend_lobby_members_user_idx on public.friend_lobby_members(user_id,status);
alter table public.friend_lobbies enable row level security;
alter table public.friend_lobby_members enable row level security;

create or replace function public.friend_lobby_access(p_lobby uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.friend_lobby_members
    where lobby_id=p_lobby and user_id=auth.uid() and status in ('active','invited'))
$$;
revoke all on function public.friend_lobby_access(uuid) from public;
grant execute on function public.friend_lobby_access(uuid) to authenticated;
drop policy if exists "friend lobby members read rooms" on public.friend_lobbies;
create policy "friend lobby members read rooms" on public.friend_lobbies for select to authenticated
  using (public.friend_lobby_access(id));
drop policy if exists "friend lobby members read players" on public.friend_lobby_members;
create policy "friend lobby members read players" on public.friend_lobby_members for select to authenticated
  using (user_id=auth.uid() or public.friend_lobby_access(lobby_id));
-- All writes go through the checked functions below. No direct client write policy.

create or replace function public.friend_lobby_create()
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); room uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select l.id into room from public.friend_lobbies l
    join public.friend_lobby_members m on m.lobby_id=l.id
    where m.user_id=uid and m.status='active' and l.status<>'closed'
    order by l.created_at desc limit 1;
  if room is not null then return room; end if;
  insert into public.friend_lobbies(host_id) values(uid) returning id into room;
  insert into public.friend_lobby_members(lobby_id,user_id,status) values(room,uid,'active');
  return room;
end $$;
revoke all on function public.friend_lobby_create() from public;
grant execute on function public.friend_lobby_create() to authenticated;

create or replace function public.friend_lobby_invite(p_lobby uuid,p_friend uuid)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); room public.friend_lobbies%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into room from public.friend_lobbies where id=p_lobby for update;
  if room.id is null or room.host_id<>uid or room.status='closed' then raise exception 'Only the host can invite'; end if;
  if p_friend=uid then raise exception 'You are already in the lobby'; end if;
  if not exists(select 1 from public.friendships f where f.status='accepted' and
    ((f.requester_id=uid and f.addressee_id=p_friend) or (f.addressee_id=uid and f.requester_id=p_friend)))
    then raise exception 'Only friends can be invited'; end if;
  if exists(select 1 from public.friend_lobby_members where lobby_id=p_lobby and user_id=p_friend and status in ('active','invited')) then return; end if;
  if (select count(*) from public.friend_lobby_members where lobby_id=p_lobby and status in ('active','invited'))>=8
    then raise exception 'Lobby is full'; end if;
  insert into public.friend_lobby_members(lobby_id,user_id,status)
    values(p_lobby,p_friend,'invited') on conflict(lobby_id,user_id)
    do update set status='invited',joined_at=now(),ready=false,finished=false;
end $$;
revoke all on function public.friend_lobby_invite(uuid,uuid) from public;
grant execute on function public.friend_lobby_invite(uuid,uuid) to authenticated;

create or replace function public.friend_lobby_answer(p_lobby uuid,p_accept boolean)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); room public.friend_lobbies%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into room from public.friend_lobbies where id=p_lobby for update;
  if room.id is null or room.status='closed' then raise exception 'Lobby closed'; end if;
  update public.friend_lobby_members set status=case when p_accept then 'active' else 'left' end,
    joined_at=now(),ready=false,round_number=room.round_number
    where lobby_id=p_lobby and user_id=uid and status='invited';
  if not found then raise exception 'Invitation not found'; end if;
  -- A new participant joins between rounds, never halfway through the song.
  if p_accept and room.status='countdown' then
    update public.friend_lobby_members set ready=false where lobby_id=p_lobby and user_id=uid;
  end if;
end $$;
revoke all on function public.friend_lobby_answer(uuid,boolean) from public;
grant execute on function public.friend_lobby_answer(uuid,boolean) to authenticated;

create or replace function public.friend_lobby_choose_song(p_lobby uuid,p_chart uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); room public.friend_lobbies%rowtype; next_round integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into room from public.friend_lobbies where id=p_lobby for update;
  if room.id is null or room.host_id<>uid then raise exception 'Only the host can choose a song'; end if;
  if room.status not in ('waiting','results') then raise exception 'Finish the current song first'; end if;
  if not exists(select 1 from public.charts where id=p_chart) then raise exception 'Song not found'; end if;
  next_round:=room.round_number+1;
  update public.friend_lobbies set chart_id=p_chart,round_number=next_round,status='waiting',start_at=null,updated_at=now() where id=p_lobby;
  update public.friend_lobby_members set round_number=next_round,ready=false,score=0,combo=0,finished=false,
    perfect=0,great=0,good=0,miss=0,max_combo=0 where lobby_id=p_lobby and status='active';
  return next_round;
end $$;
revoke all on function public.friend_lobby_choose_song(uuid,uuid) from public;
grant execute on function public.friend_lobby_choose_song(uuid,uuid) to authenticated;

create or replace function public.friend_lobby_ready(p_lobby uuid,p_round integer)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); room public.friend_lobbies%rowtype; scheduled timestamptz;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into room from public.friend_lobbies where id=p_lobby for update;
  if room.id is null or room.round_number<>p_round or room.status not in ('waiting','countdown') or room.chart_id is null
    then raise exception 'Lobby round has changed'; end if;
  update public.friend_lobby_members set ready=true where lobby_id=p_lobby and user_id=uid
    and status='active' and round_number=p_round;
  if not found then raise exception 'Not in this round'; end if;
  if room.status='waiting' and (select count(*) from public.friend_lobby_members
      where lobby_id=p_lobby and status='active' and round_number=p_round)>=2
    and not exists(select 1 from public.friend_lobby_members
      where lobby_id=p_lobby and status='active' and round_number=p_round and not ready)
  then
    update public.friend_lobbies set status='countdown',start_at=now()+interval '4 seconds',updated_at=now()
      where id=p_lobby returning start_at into scheduled;
  end if;
  return coalesce(scheduled,room.start_at);
end $$;
revoke all on function public.friend_lobby_ready(uuid,integer) from public;
grant execute on function public.friend_lobby_ready(uuid,integer) to authenticated;

create or replace function public.friend_lobby_live(p_lobby uuid,p_round integer,p_score bigint,p_combo integer)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); room public.friend_lobbies%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into room from public.friend_lobbies where id=p_lobby;
  if room.id is null or room.round_number<>p_round or room.status<>'countdown' or room.start_at is null
     or now()<room.start_at-interval '1 second' then raise exception 'Round is not playing'; end if;
  update public.friend_lobby_members set score=greatest(score,greatest(coalesce(p_score,0),0)),
    combo=greatest(coalesce(p_combo,0),0) where lobby_id=p_lobby and user_id=uid
    and status='active' and round_number=p_round and ready and not finished;
  if not found then raise exception 'Not in the active round'; end if;
end $$;
revoke all on function public.friend_lobby_live(uuid,integer,bigint,integer) from public;
grant execute on function public.friend_lobby_live(uuid,integer,bigint,integer) to authenticated;

create or replace function public.friend_lobby_finish(p_lobby uuid,p_round integer,p_score bigint,p_perfect integer,
  p_great integer,p_good integer,p_miss integer,p_max_combo integer)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); room public.friend_lobbies%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into room from public.friend_lobbies where id=p_lobby for update;
  if room.id is null or room.round_number<>p_round or room.status<>'countdown' or room.start_at is null
    or now()<room.start_at-interval '1 second' then raise exception 'Round has changed'; end if;
  update public.friend_lobby_members set finished=true,score=greatest(score,greatest(coalesce(p_score,0),0)),combo=0,
    perfect=greatest(coalesce(p_perfect,0),0),great=greatest(coalesce(p_great,0),0),
    good=greatest(coalesce(p_good,0),0),miss=greatest(coalesce(p_miss,0),0),
    max_combo=greatest(coalesce(p_max_combo,0),0)
    where lobby_id=p_lobby and user_id=uid and status='active' and round_number=p_round and ready;
  if not found then raise exception 'Not in the active round'; end if;
  if not exists(select 1 from public.friend_lobby_members where lobby_id=p_lobby and status='active'
     and round_number=p_round and ready and not finished)
  then update public.friend_lobbies set status='results',updated_at=now() where id=p_lobby; end if;
end $$;
revoke all on function public.friend_lobby_finish(uuid,integer,bigint,integer,integer,integer,integer,integer) from public;
grant execute on function public.friend_lobby_finish(uuid,integer,bigint,integer,integer,integer,integer,integer) to authenticated;

create or replace function public.friend_lobby_leave(p_lobby uuid)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); room public.friend_lobbies%rowtype; next_host uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into room from public.friend_lobbies where id=p_lobby for update;
  if room.id is null then return; end if;
  update public.friend_lobby_members set status='left',ready=false
    where lobby_id=p_lobby and user_id=uid and status in ('active','invited');
  if not found then raise exception 'Not in lobby'; end if;
  if uid=room.host_id then
    select user_id into next_host from public.friend_lobby_members where lobby_id=p_lobby and status='active'
      order by joined_at limit 1;
    if next_host is null then update public.friend_lobbies set status='closed',updated_at=now() where id=p_lobby;
    else update public.friend_lobbies set host_id=next_host,updated_at=now() where id=p_lobby; end if;
  end if;
  if room.status='countdown' and not exists(select 1 from public.friend_lobby_members
     where lobby_id=p_lobby and status='active' and round_number=room.round_number and ready and not finished)
  then update public.friend_lobbies set status='results',updated_at=now() where id=p_lobby; end if;
end $$;
revoke all on function public.friend_lobby_leave(uuid) from public;
grant execute on function public.friend_lobby_leave(uuid) to authenticated;
