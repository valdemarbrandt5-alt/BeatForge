-- BeatForge ranked synchronized start
-- Run this once in the Supabase SQL editor after ranked_multiplayer.sql.

alter table public.ranked_matches
  add column if not exists player_1_ready boolean not null default false,
  add column if not exists player_2_ready boolean not null default false,
  add column if not exists start_at timestamptz;

create or replace function public.ready_ranked_match(p_match uuid)
returns table(start_at timestamptz, server_now timestamptz, both_ready boolean)
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.ranked_matches%rowtype;
  chosen_start timestamptz;
begin
  select * into m from public.ranked_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if auth.uid() not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
  if m.selected_chart_id is null then raise exception 'Song has not been selected'; end if;

  if auth.uid()=m.player_1 then
    update public.ranked_matches set player_1_ready=true,updated_at=now() where id=p_match;
  else
    update public.ranked_matches set player_2_ready=true,updated_at=now() where id=p_match;
  end if;

  select * into m from public.ranked_matches where id=p_match;
  if m.player_1_ready and m.player_2_ready then
    chosen_start:=coalesce(m.start_at,now()+interval '5 seconds');
    update public.ranked_matches
      set start_at=chosen_start,status='playing',updated_at=now()
      where id=p_match;
  else
    chosen_start:=m.start_at;
  end if;

  return query select chosen_start,now(),(m.player_1_ready and m.player_2_ready);
end $$;

grant execute on function public.ready_ranked_match(uuid) to authenticated;

create or replace function public.get_ranked_start(p_match uuid)
returns table(start_at timestamptz, server_now timestamptz, player_1_ready boolean, player_2_ready boolean, status text)
language plpgsql
security definer
set search_path=public
as $$
declare m public.ranked_matches%rowtype;
begin
  select * into m from public.ranked_matches where id=p_match;
  if m.id is null then raise exception 'Match not found'; end if;
  if auth.uid() not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
  return query select m.start_at,now(),m.player_1_ready,m.player_2_ready,m.status;
end $$;

grant execute on function public.get_ranked_start(uuid) to authenticated;
