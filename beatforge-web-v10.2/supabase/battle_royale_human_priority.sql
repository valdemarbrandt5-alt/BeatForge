-- Run after battle_royale_lobby_profile.sql in the Supabase SQL Editor.
-- Fill existing lobbies with humans regardless of rank. A human may replace
-- a bot while a full lobby is still in its three-second grace period.

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

  insert into public.ranked_players(user_id) values(uid)
  on conflict(user_id) do nothing;
  select r.mmr into my_mmr from public.ranked_players r where r.user_id=uid;

  insert into public.battle_royale_ratings(user_id) values(uid)
  on conflict(user_id) do nothing;

  -- Serialize joins so simultaneous players do not create separate lobbies.
  perform pg_advisory_xact_lock(814274,1);

  select p.match_id into existing
  from public.battle_royale_players p
  join public.battle_royale_matches m on m.id=p.match_id
  where p.user_id=uid
    and not p.eliminated
    and m.status in ('lobby','loading','playing','round_result')
  order by m.created_at desc limit 1;
  if existing is not null then return existing; end if;

  -- Prefer the lobby with the most humans; MMR only breaks ties.
  -- Eight players can include bots, so keep those lobbies available to humans.
  select m.id into mid
  from public.battle_royale_matches m
  cross join lateral (
    select count(*) filter(where not p.is_bot) as humans,count(*) as total
    from public.battle_royale_players p where p.match_id=m.id
  ) slots
  where m.status='lobby' and slots.humans<8 and slots.total<=8
  order by slots.humans desc,abs(coalesce(m.rating_center,1000)-my_mmr),m.created_at
  limit 1
  for update of m;

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

  select count(*) into total_players
  from public.battle_royale_players where match_id=mid;
  if total_players=8 then
    delete from public.battle_royale_players
    where id=(
      select id from public.battle_royale_players
      where match_id=mid and is_bot
      order by joined_at desc limit 1
    );
  end if;

  insert into public.battle_royale_players(match_id,user_id,is_bot,mmr_before)
  values(mid,uid,false,my_mmr);

  select round(avg(p.mmr_before))::integer into new_center
  from public.battle_royale_players p
  where p.match_id=mid and not p.is_bot;

  select count(*) into total_players
  from public.battle_royale_players where match_id=mid;
  update public.battle_royale_matches set
    rating_center=coalesce(new_center,my_mmr),
    lobby_deadline=case when total_players=8 then now()+interval '3 seconds' else lobby_deadline end,
    next_bot_at=case when total_players=8 then now() else next_bot_at end,
    updated_at=now()
  where id=mid;

  return mid;
end $$;
grant execute on function public.join_battle_royale() to authenticated;
