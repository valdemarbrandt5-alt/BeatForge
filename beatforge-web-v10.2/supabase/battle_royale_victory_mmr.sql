-- Run after battle_royale_human_scaled_mmr.sql in the Supabase SQL Editor.
-- Eight humans: +80, +50, +25, +10, -10, -20, -25, -35.
-- Positive rewards now scale from 75% with one human to 100% with eight.
-- Negative rewards keep the existing 50% to 100% scaling.
-- Only future results change; previously applied MMR is not recalculated.

create or replace function public.battle_royale_apply_mmr(p_match uuid,p_player uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.battle_royale_players%rowtype;
  base_delta integer;
  delta integer;
  human_count integer;
begin
  select * into p
  from public.battle_royale_players
  where id=p_player and match_id=p_match
  for update;

  if p.id is null or p.is_bot or p.user_id is null or p.placement is null or p.mmr_applied then return; end if;

  base_delta:=case p.placement
    when 1 then 80
    when 2 then 50
    when 3 then 25
    when 4 then 10
    when 5 then -10
    when 6 then -20
    when 7 then -25
    when 8 then -35
    else null
  end;
  if base_delta is null then raise exception 'Invalid Battle Royale placement'; end if;

  -- Count all human participants, including those eliminated in earlier rounds.
  select count(*) into human_count
  from public.battle_royale_players
  where match_id=p_match and not is_bot and user_id is not null;

  if base_delta>0 then
    delta:=round(base_delta * (0.75 + (least(8,greatest(1,human_count))-1)::numeric / 28))::integer;
  else
    delta:=round(base_delta * (0.5 + (least(8,greatest(1,human_count))-1)::numeric / 14))::integer;
  end if;

  insert into public.ranked_players(user_id) values(p.user_id)
  on conflict(user_id) do nothing;

  update public.ranked_players
  set mmr=greatest(0,mmr+delta)
  where user_id=p.user_id;

  insert into public.battle_royale_ratings(user_id) values(p.user_id)
  on conflict(user_id) do nothing;

  update public.battle_royale_ratings set
    games=games+1,
    wins=wins+case when p.placement=1 then 1 else 0 end,
    top4=top4+case when p.placement<=4 then 1 else 0 end,
    updated_at=now()
  where user_id=p.user_id;

  update public.battle_royale_players
  set mmr_delta=delta,mmr_applied=true
  where id=p.id;
end $$;
