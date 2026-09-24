-- Apply after battle_royale.sql, battle_royale_v2.sql and battle_royale_shared_rank.sql.
-- A full lobby remains open for three seconds; leaving resets it for replacements.

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
    update public.battle_royale_matches set lobby_deadline=now()+interval '3 seconds',next_bot_at=now(),updated_at=now() where id=mid;
  end if;

  return mid;
end $$;
grant execute on function public.join_battle_royale() to authenticated;

create or replace function public.battle_royale_tick(p_match uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  humans integer;
  total_players integer;
  add_count integer:=0;
  i integer;
  chart_id uuid;
  names text[]:=array['NOVA','Echo','Pulse','Mira','Vex','Luna','Riff','Kairo','Neon','Astra','Flux','Jinx','Orbit','Sora','Nyx','Tempo'];
  chosen_name text;
  chosen_mmr integer;
  diff text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.battle_royale_players where match_id=p_match and user_id=uid) then raise exception 'Not in Battle Royale'; end if;

  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null or m.status<>'lobby' then return; end if;

  select count(*) filter(where not is_bot),count(*)
    into humans,total_players
    from public.battle_royale_players where match_id=p_match;

  if humans=0 then
    update public.battle_royale_matches set status='cancelled',updated_at=now() where id=p_match;
    return;
  end if;

  -- Before 20 seconds, only real players can enter. From 20-30 seconds,
  -- synthetic opponents arrive in small staggered groups so the lobby fills naturally.
  if total_players<8 then
    if now()>=m.created_at+interval '30 seconds' then
      add_count:=8-total_players;
    elsif now()>=coalesce(m.next_bot_at,m.created_at+interval '20 seconds') then
      add_count:=least(8-total_players,case when random()<0.24 then 2 else 1 end);
    else
      return;
    end if;

    for i in 1..add_count loop
      select n into chosen_name
      from unnest(names) as n
      where not exists(
        select 1 from public.battle_royale_players p
        where p.match_id=p_match and lower(coalesce(p.bot_name,''))=lower(n)
      )
      order by random() limit 1;
      if chosen_name is null then chosen_name:='Player '||(total_players+i+1)::text; end if;

      chosen_mmr:=greatest(500,m.rating_center + floor(random()*281)::integer - 140);
      diff:=case
        when chosen_mmr<800 then 'Easy'
        when chosen_mmr<1050 then 'Medium'
        when chosen_mmr<1350 then 'Hard'
        else 'Expert'
      end;

      insert into public.battle_royale_players(match_id,is_bot,bot_name,difficulty,ready,bot_mmr)
      values(p_match,true,chosen_name,diff,true,chosen_mmr);
    end loop;

    select count(*) into total_players from public.battle_royale_players where match_id=p_match;
    if total_players>=8 then
      update public.battle_royale_matches set lobby_deadline=now()+interval '3 seconds',updated_at=now() where id=p_match;
      return;
    end if;
    if total_players<8 then
      update public.battle_royale_matches set
        next_bot_at=now()+(1.4+random()*3.2)*interval '1 second',
        updated_at=now()
      where id=p_match;
      return;
    end if;
  end if;

  -- Hold a full lobby for three seconds. A departure resets this deadline.
  if m.lobby_deadline > now() then return; end if;

  select id into chart_id from public.rank_candidate_charts() order by random() limit 1;
  if chart_id is null then raise exception 'Need community charts before Battle Royale can start'; end if;

  update public.battle_royale_matches set
    status='loading',round_no=1,current_chart_id=chart_id,start_at=null,round_resolved_at=null,updated_at=now()
  where id=p_match;
end $$;
grant execute on function public.battle_royale_tick(uuid) to authenticated;

create or replace function public.battle_royale_leave(p_match uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  m public.battle_royale_matches%rowtype;
  alive_count integer;
  humans_left integer;
  pid uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then return; end if;

  select count(*) into alive_count from public.battle_royale_players where match_id=p_match and not eliminated;
  select id into pid from public.battle_royale_players where match_id=p_match and user_id=uid and not eliminated limit 1;
  if pid is null then return; end if;

  if m.status='lobby' then
    delete from public.battle_royale_players where id=pid;
    update public.battle_royale_matches set lobby_deadline=now()+interval '30 seconds',updated_at=now() where id=p_match;
  else
  update public.battle_royale_players set eliminated=true,finished=true,ready=false,
    placement=case when m.status='lobby' then placement else coalesce(placement,alive_count) end
  where id=pid;
  end if;

  if pid is not null and m.status<>'lobby' then
    perform public.battle_royale_apply_mmr(p_match,pid);
  end if;

  select count(*) into humans_left from public.battle_royale_players where match_id=p_match and not is_bot and not eliminated;
  if humans_left=0 then
    update public.battle_royale_matches set status='cancelled',updated_at=now() where id=p_match;
  end if;
end $$;
grant execute on function public.battle_royale_leave(uuid) to authenticated;

create or replace function public.get_battle_royale_profile(p_user uuid)
returns table(wins integer,games integer,top4 integer)
language sql security definer set search_path=public
as $$
  select r.wins,r.games,r.top4 from public.battle_royale_ratings r
  where r.user_id=p_user and auth.uid() is not null
$$;
grant execute on function public.get_battle_royale_profile(uuid) to authenticated;
