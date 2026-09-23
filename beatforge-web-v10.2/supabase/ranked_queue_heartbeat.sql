-- BeatForge ranked queue heartbeat
-- Run once in Supabase SQL Editor.
-- A player can only be matched while their searching screen is actively heartbeating.

create or replace function public.heartbeat_ranked_queue()
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  me uuid := auth.uid();
  my_mmr int;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  insert into public.ranked_players(user_id) values(me) on conflict(user_id) do nothing;
  select mmr into my_mmr from public.ranked_players where user_id=me;
  insert into public.ranked_queue(user_id,mmr,joined_at)
  values(me,my_mmr,now())
  on conflict(user_id) do update set mmr=excluded.mmr, joined_at=excluded.joined_at;
end;
$$;
grant execute on function public.heartbeat_ranked_queue() to authenticated;

create or replace function public.join_ranked_queue()
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  me uuid := auth.uid();
  my_mmr int;
  opponent public.ranked_queue%rowtype;
  new_match uuid;
  choices uuid[];
begin
  if me is null then raise exception 'Not authenticated'; end if;
  insert into public.ranked_players(user_id) values(me) on conflict(user_id) do nothing;
  select mmr into my_mmr from public.ranked_players where user_id=me;

  -- Remove dead searches. The frontend refreshes joined_at every 2 seconds while
  -- SEARCHING is actually visible, so 6 seconds allows normal network jitter.
  delete from public.ranked_queue where joined_at < now()-interval '6 seconds';

  -- Only an actively heartbeating opponent can be claimed.
  select * into opponent
  from public.ranked_queue q
  where q.user_id<>me
    and q.joined_at > now()-interval '6 seconds'
  order by abs(q.mmr-my_mmr), q.joined_at
  for update skip locked
  limit 1;

  if opponent.user_id is null then
    insert into public.ranked_queue(user_id,mmr,joined_at)
    values(me,my_mmr,now())
    on conflict(user_id) do update set mmr=excluded.mmr,joined_at=excluded.joined_at;
    return null;
  end if;

  select coalesce(array_agg(id),'{}'::uuid[]) into choices from public.rank_candidate_charts();
  if coalesce(array_length(choices,1),0) < 3 then
    raise exception 'Need at least 3 community charts for ranked voting';
  end if;

  insert into public.ranked_matches(player_1,player_2,candidate_chart_ids,voting_ends_at,player_1_mmr_before,player_2_mmr_before)
  values(opponent.user_id,me,choices,now()+interval '15 seconds',opponent.mmr,my_mmr)
  returning id into new_match;

  delete from public.ranked_queue where user_id in (me,opponent.user_id);
  return new_match;
end;
$$;
grant execute on function public.join_ranked_queue() to authenticated;
