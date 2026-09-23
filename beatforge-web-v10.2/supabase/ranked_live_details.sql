-- BeatForge ranked live opponent details
-- Run once in Supabase SQL Editor.

alter table public.ranked_matches
  add column if not exists player_1_combo integer not null default 0,
  add column if not exists player_2_combo integer not null default 0,
  add column if not exists player_1_last_judge text,
  add column if not exists player_2_last_judge text,
  add column if not exists player_1_misses integer not null default 0,
  add column if not exists player_2_misses integer not null default 0;

create or replace function public.update_ranked_live_details(
  p_match uuid,
  p_score bigint,
  p_combo integer,
  p_judge text,
  p_misses integer
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  m public.ranked_matches%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.ranked_matches where id=p_match;
  if m.id is null then raise exception 'Match not found'; end if;
  if uid not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
  if uid=m.player_1 then
    update public.ranked_matches set
      player_1_score=greatest(player_1_score,greatest(0,p_score)),
      player_1_combo=greatest(0,p_combo),
      player_1_last_judge=left(coalesce(p_judge,''),16),
      player_1_misses=greatest(player_1_misses,greatest(0,p_misses)),
      updated_at=now()
    where id=p_match;
  else
    update public.ranked_matches set
      player_2_score=greatest(player_2_score,greatest(0,p_score)),
      player_2_combo=greatest(0,p_combo),
      player_2_last_judge=left(coalesce(p_judge,''),16),
      player_2_misses=greatest(player_2_misses,greatest(0,p_misses)),
      updated_at=now()
    where id=p_match;
  end if;
end $$;
grant execute on function public.update_ranked_live_details(uuid,bigint,integer,text,integer) to authenticated;

create or replace function public.get_ranked_live_details(p_match uuid)
returns table(
  player_1_score bigint, player_2_score bigint,
  player_1_combo integer, player_2_combo integer,
  player_1_last_judge text, player_2_last_judge text,
  player_1_misses integer, player_2_misses integer,
  player_1_finished boolean, player_2_finished boolean, status text,
  player_1_mmr_delta integer, player_2_mmr_delta integer
)
language plpgsql
security definer
set search_path=public
as $$
declare m public.ranked_matches%rowtype;
begin
  select * into m from public.ranked_matches where id=p_match;
  if m.id is null then raise exception 'Match not found'; end if;
  if auth.uid() not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
  return query select
    m.player_1_score,m.player_2_score,
    m.player_1_combo,m.player_2_combo,
    m.player_1_last_judge,m.player_2_last_judge,
    m.player_1_misses,m.player_2_misses,
    m.player_1_finished,m.player_2_finished,m.status,
    m.player_1_mmr_delta,m.player_2_mmr_delta;
end $$;
grant execute on function public.get_ranked_live_details(uuid) to authenticated;
