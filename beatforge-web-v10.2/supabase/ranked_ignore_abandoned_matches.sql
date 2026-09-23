-- BeatForge: never let a new queue search reuse an abandoned old match.
-- Run once in Supabase SQL Editor.

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

  -- A fresh FIND MATCH is a new matchmaking session. Any unfinished match this
  -- user left behind must not be rediscovered by the frontend polling code.
  update public.ranked_matches
     set status = 'finished'
   where (player_1 = me or player_2 = me)
     and status in ('voting','ready','playing')
     and created_at < now() - interval '5 seconds';

  -- Dead queue searches cannot be opponents.
  delete from public.ranked_queue
   where joined_at < now() - interval '6 seconds';

  -- Claim only somebody whose browser is actively heartbeating FIND MATCH.
  select * into opponent
    from public.ranked_queue q
   where q.user_id <> me
     and q.joined_at > now() - interval '6 seconds'
   order by abs(q.mmr-my_mmr), q.joined_at
   for update skip locked
   limit 1;

  if opponent.user_id is null then
    insert into public.ranked_queue(user_id,mmr,joined_at)
    values(me,my_mmr,now())
    on conflict(user_id) do update
      set mmr=excluded.mmr, joined_at=excluded.joined_at;
    return null;
  end if;

  select coalesce(array_agg(id),'{}'::uuid[])
    into choices
    from public.rank_candidate_charts();

  if coalesce(array_length(choices,1),0) < 3 then
    raise exception 'Need at least 3 community charts for ranked voting';
  end if;

  insert into public.ranked_matches(
    player_1,player_2,candidate_chart_ids,voting_ends_at,
    player_1_mmr_before,player_2_mmr_before
  ) values(
    opponent.user_id,me,choices,now()+interval '15 seconds',
    opponent.mmr,my_mmr
  ) returning id into new_match;

  delete from public.ranked_queue where user_id in (me,opponent.user_id);
  return new_match;
end;
$$;

grant execute on function public.join_ranked_queue() to authenticated;
