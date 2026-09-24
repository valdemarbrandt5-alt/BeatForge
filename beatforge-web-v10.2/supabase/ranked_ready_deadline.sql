-- Run after ranked_multiplayer.sql, ranked_difficulty.sql and ranked_sync_start.sql.
-- The deadline starts when the song vote resolves, independent of either player's clicks.
alter table public.ranked_matches add column if not exists ready_deadline timestamptz;

create or replace function public.set_ranked_ready_deadline()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='ready' and old.status is distinct from 'ready' then
    new.ready_deadline:=now()+interval '15 seconds';
  end if;
  return new;
end $$;
drop trigger if exists ranked_ready_deadline_trigger on public.ranked_matches;
create trigger ranked_ready_deadline_trigger before update on public.ranked_matches
for each row execute function public.set_ranked_ready_deadline();

-- Existing ready matches receive a deadline when this migration is applied.
update public.ranked_matches set ready_deadline=now()+interval '15 seconds'
where status='ready' and ready_deadline is null;

create or replace function public.ranked_ready_tick(p_match uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.ranked_matches%rowtype; uid uuid:=auth.uid();
begin
  select * into m from public.ranked_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if uid is null or uid not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
  if m.status='ready' and m.ready_deadline is null then
    update public.ranked_matches set ready_deadline=now()+interval '15 seconds' where id=p_match;
  end if;
  if m.status='ready' and now()>=coalesce(m.ready_deadline,now()+interval '15 seconds') then
    update public.ranked_matches set
      player_1_difficulty=coalesce(player_1_difficulty,'Medium'),
      player_2_difficulty=coalesce(player_2_difficulty,'Medium'),
      player_1_ready=true,player_2_ready=true,
      start_at=coalesce(start_at,now()+interval '5 seconds'),
      status='playing',updated_at=now()
    where id=p_match;
  end if;
  select * into m from public.ranked_matches where id=p_match;
  return jsonb_build_object('server_now',now(),'ready_deadline',m.ready_deadline,
    'start_at',m.start_at,'status',m.status,'my_difficulty',
    case when uid=m.player_1 then m.player_1_difficulty else m.player_2_difficulty end,
    'my_ready',case when uid=m.player_1 then m.player_1_ready else m.player_2_ready end,
    'ready_count',m.player_1_ready::int+m.player_2_ready::int);
end $$;
grant execute on function public.ranked_ready_tick(uuid) to authenticated;

-- Difficulty is fixed when the deadline passes, even if a client sends a late RPC.
create or replace function public.set_ranked_difficulty(p_match uuid, p_difficulty text)
returns void language plpgsql security definer set search_path=public as $$
declare m public.ranked_matches%rowtype; uid uuid:=auth.uid(); d text:=initcap(lower(trim(p_difficulty)));
begin
  select * into m from public.ranked_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if uid is null or uid not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
  if d not in ('Easy','Medium','Hard','Expert') then raise exception 'Invalid difficulty'; end if;
  if m.status<>'ready' or now()>=coalesce(m.ready_deadline,now()) then raise exception 'Difficulty deadline passed'; end if;
  if uid=m.player_1 then
    update public.ranked_matches set player_1_difficulty=d,updated_at=now() where id=p_match;
  else
    update public.ranked_matches set player_2_difficulty=d,updated_at=now() where id=p_match;
  end if;
end $$;

-- Ready records the player's choice; the common deadline controls the start.
create or replace function public.ready_ranked_match(p_match uuid)
returns table(start_at timestamptz, server_now timestamptz, both_ready boolean)
language plpgsql security definer set search_path=public as $$
declare m public.ranked_matches%rowtype;
begin
  select * into m from public.ranked_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if auth.uid() is null or auth.uid() not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
  if m.selected_chart_id is null then raise exception 'Song has not been selected'; end if;
  if m.status='ready' and now()<coalesce(m.ready_deadline,now()+interval '15 seconds') then
    if auth.uid()=m.player_1 then
      update public.ranked_matches set player_1_ready=true,updated_at=now() where id=p_match;
    else
      update public.ranked_matches set player_2_ready=true,updated_at=now() where id=p_match;
    end if;
  end if;
  select * into m from public.ranked_matches where id=p_match;
  return query select m.start_at,now(),(m.player_1_ready and m.player_2_ready);
end $$;
