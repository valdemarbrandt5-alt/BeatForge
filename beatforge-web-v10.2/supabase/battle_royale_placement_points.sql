-- Run after battle_royale_shared_rank.sql.
-- Placement 1 through 8: +60, +40, +20, +10, -5, -10, -15, -25 MMR.
-- Battle Royale and Ranked 1v1 continue to share the same MMR.

create or replace function public.battle_royale_apply_mmr(p_match uuid,p_player uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.battle_royale_players%rowtype;
  delta integer;
begin
  select * into p
  from public.battle_royale_players
  where id=p_player and match_id=p_match
  for update;

  if p.id is null or p.is_bot or p.user_id is null or p.placement is null or p.mmr_applied then return; end if;

  delta:=case p.placement
    when 1 then 60
    when 2 then 40
    when 3 then 20
    when 4 then 10
    when 5 then -5
    when 6 then -10
    when 7 then -15
    when 8 then -25
    else null
  end;
  if delta is null then raise exception 'Invalid Battle Royale placement'; end if;

  insert into public.ranked_players(user_id) values(p.user_id)
  on conflict(user_id) do nothing;

  -- Shared rating: this is the exact same MMR used by normal 1v1 Ranked.
  -- Do not alter duel wins/losses here; those remain actual 1v1 match stats.
  update public.ranked_players
  set mmr=greatest(0,mmr+delta)
  where user_id=p.user_id;

  -- Keep BR-specific record stats, but its legacy mmr column is no longer used.
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
