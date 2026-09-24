-- BeatForge casual friend song invites
-- Safe to run again in the Supabase SQL editor.

create table if not exists public.casual_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  chart_id uuid not null references public.charts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  check (inviter_id <> invitee_id)
);

alter table public.casual_invites add column if not exists inviter_ready boolean not null default false;
alter table public.casual_invites add column if not exists invitee_ready boolean not null default false;
alter table public.casual_invites add column if not exists start_at timestamptz;
alter table public.casual_invites add column if not exists inviter_score bigint not null default 0;
alter table public.casual_invites add column if not exists invitee_score bigint not null default 0;

create index if not exists casual_invites_invitee_status_idx on public.casual_invites(invitee_id,status,created_at desc);
create index if not exists casual_invites_inviter_status_idx on public.casual_invites(inviter_id,status,created_at desc);

alter table public.casual_invites enable row level security;

drop policy if exists "casual invite participants read" on public.casual_invites;
create policy "casual invite participants read" on public.casual_invites
for select to authenticated
using (auth.uid() in (inviter_id,invitee_id));

drop policy if exists "friends can send casual invites" on public.casual_invites;
create policy "friends can send casual invites" on public.casual_invites
for insert to authenticated
with check (
  auth.uid()=inviter_id
  and exists (
    select 1 from public.friendships f
    where f.status='accepted'
      and ((f.requester_id=inviter_id and f.addressee_id=invitee_id)
        or (f.addressee_id=inviter_id and f.requester_id=invitee_id))
  )
);

drop policy if exists "invitee can answer casual invite" on public.casual_invites;
create policy "invitee can answer casual invite" on public.casual_invites
for update to authenticated
using (auth.uid()=invitee_id)
with check (auth.uid()=invitee_id and status in ('accepted','declined'));

drop policy if exists "inviter can cancel casual invite" on public.casual_invites;
create policy "inviter can cancel casual invite" on public.casual_invites
for update to authenticated
using (auth.uid()=inviter_id)
with check (auth.uid()=inviter_id and status='cancelled');

create or replace function public.casual_set_ready(p_invite uuid)
returns table(
  invite_id uuid,
  inviter_ready boolean,
  invitee_ready boolean,
  start_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  r public.casual_invites%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into r from public.casual_invites where id=p_invite for update;
  if r.id is null then raise exception 'Invite not found'; end if;
  if uid not in (r.inviter_id,r.invitee_id) then raise exception 'Not in this casual match'; end if;
  if r.status <> 'accepted' then raise exception 'Invite is not accepted'; end if;

  if uid=r.inviter_id then
    update public.casual_invites set inviter_ready=true where id=p_invite;
  else
    update public.casual_invites set invitee_ready=true where id=p_invite;
  end if;

  select * into r from public.casual_invites where id=p_invite for update;
  if r.inviter_ready and r.invitee_ready and r.start_at is null then
    update public.casual_invites
      set start_at=now()+interval '4 seconds', inviter_score=0, invitee_score=0
      where id=p_invite
      returning * into r;
  end if;

  return query select r.id,r.inviter_ready,r.invitee_ready,r.start_at;
end $$;

grant execute on function public.casual_set_ready(uuid) to authenticated;

create or replace function public.casual_update_score(p_invite uuid,p_score bigint)
returns table(
  invite_id uuid,
  inviter_score bigint,
  invitee_score bigint
)
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  r public.casual_invites%rowtype;
  clean_score bigint := greatest(coalesce(p_score,0),0);
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select * into r from public.casual_invites where id=p_invite for update;
  if r.id is null then raise exception 'Invite not found'; end if;
  if uid not in (r.inviter_id,r.invitee_id) then raise exception 'Not in this casual match'; end if;
  if r.status <> 'accepted' or r.start_at is null then raise exception 'Casual match is not playing'; end if;

  if uid=r.inviter_id then
    update public.casual_invites set inviter_score=greatest(inviter_score,clean_score) where id=p_invite returning * into r;
  else
    update public.casual_invites set invitee_score=greatest(invitee_score,clean_score) where id=p_invite returning * into r;
  end if;

  return query select r.id,r.inviter_score,r.invitee_score;
end $$;

grant execute on function public.casual_update_score(uuid,bigint) to authenticated;
