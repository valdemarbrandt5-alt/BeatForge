-- BeatForge Battle Royale shared Ranked MMR
-- Run after battle_royale.sql and battle_royale_v2.sql.
-- Battle Royale now reads/writes public.ranked_players.mmr, so 1v1 Ranked and Battle Royale share one rank.
-- Battle Royale wins/top4/games remain separate statistics only.

create or replace function public.get_battle_royale_rating()
returns table(mmr integer,wins integer,games integer,top4 integer)
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  insert into public.ranked_players(user_id) values(uid)
  on conflict(user_id) do nothing;

  insert into public.battle_royale_ratings(user_id) values(uid)
  on conflict(user_id) do nothing;

  return query
    select rp.mmr,br.wins,br.games,br.top4
    from public.ranked_players rp
    join public.battle_royale_ratings br on br.user_id=rp.user_id
    where rp.user_id=uid;
end $$;
grant execute on function public.get_battle_royale_rating() to authenticated;

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
    when 1 then 30
    when 2 then 20
    when 3 then 12
    when 4 then 5
    when 5 then -5
    when 6 then -12
    when 7 then -20
    else -30
  end;

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

create or replace function public.join_battle_royale()
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  mid uuid;
  existing uuid;
  my_mmr integer;
  total_players integer;
  new_center integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  -- Use the normal Ranked rating for Battle Royale matchmaking.
  insert into public.ranked_players(user_id) values(uid)
  on conflict(user_id) do nothing;
  select r.mmr into my_mmr from public.ranked_players r where r.user_id=uid;

  insert into public.battle_royale_ratings(user_id) values(uid)
  on conflict(user_id) do nothing;

  -- Only resume a Battle Royale when this player is still alive in it.
  -- Eliminated players are free to queue again while the old match continues for survivors.
  select p.match_id into existing
  from public.battle_royale_players p
  join public.battle_royale_matches m on m.id=p.match_id
  where p.user_id=uid
    and not p.eliminated
    and m.status in ('lobby','loading','playing','round_result')
  order by m.created_at desc limit 1;
  if existing is not null then return existing; end if;

  select m.id into mid
  from public.battle_royale_matches m
  where m.status='lobby'
    and (select count(*) from public.battle_royale_players px where px.match_id=m.id)<8
    and abs(coalesce(m.rating_center,1000)-my_mmr)
      <= least(600,180 + greatest(0,floor(extract(epoch from (now()-m.created_at)))::integer)*18)
  order by abs(coalesce(m.rating_center,1000)-my_mmr),m.created_at
  limit 1
  for update of m skip locked;

  if mid is null then
    insert into public.battle_royale_matches(
      rating_center,lobby_deadline,bot_fill_started_at,next_bot_at
    ) values(
      my_mmr,
      now()+interval '30 seconds',
      now()+interval '20 seconds',
      now()+(20+random()*3)*interval '1 second'
    ) returning id into mid;
  end if;

  select count(*) into total_players from public.battle_royale_players where match_id=mid;
  if total_players>=8 then
    insert into public.battle_royale_matches(
      rating_center,lobby_deadline,bot_fill_started_at,next_bot_at
    ) values(
      my_mmr,
      now()+interval '30 seconds',
      now()+interval '20 seconds',
      now()+(20+random()*3)*interval '1 second'
    ) returning id into mid;
  end if;

  insert into public.battle_royale_players(match_id,user_id,is_bot,mmr_before)
  values(mid,uid,false,my_mmr)
  on conflict do nothing;

  select round(avg(coalesce(p.mmr_before,my_mmr)))::integer into new_center
  from public.battle_royale_players p
  where p.match_id=mid and not p.is_bot;

  update public.battle_royale_matches
  set rating_center=coalesce(new_center,my_mmr),updated_at=now()
  where id=mid;

  select count(*) into total_players from public.battle_royale_players where match_id=mid;
  if total_players>=8 then
    update public.battle_royale_matches set next_bot_at=now(),updated_at=now() where id=mid;
  end if;

  return mid;
end $$;
grant execute on function public.join_battle_royale() to authenticated;
