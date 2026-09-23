-- BeatForge casual friend song invites
-- Run once in the Supabase SQL editor.

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
