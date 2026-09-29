-- Apply after battle_royale_intermission.sql and battle_royale_ready_deadline_guard.sql.
-- Six songs per round, one vote per active human; bots cannot vote.

alter table public.battle_royale_matches add column if not exists vote_opens_at timestamptz;

create table if not exists public.battle_royale_song_choices (
  match_id uuid not null references public.battle_royale_matches(id) on delete cascade,
  round_no integer not null,
  chart_id uuid not null references public.charts(id) on delete cascade,
  primary key (match_id,round_no,chart_id)
);
create table if not exists public.battle_royale_song_votes (
  match_id uuid not null references public.battle_royale_matches(id) on delete cascade,
  round_no integer not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  chart_id uuid not null,
  primary key (match_id,round_no,user_id),
  foreign key (match_id,round_no,chart_id)
    references public.battle_royale_song_choices(match_id,round_no,chart_id) on delete cascade
);
alter table public.battle_royale_song_choices enable row level security;
alter table public.battle_royale_song_votes enable row level security;

create or replace function public.battle_royale_ensure_songs(p_match uuid,p_round integer)
returns void language plpgsql security definer set search_path=public as $$
declare previous_url text; previous_key text; inserted_count integer;
begin
  if exists(select 1 from public.battle_royale_song_choices where match_id=p_match and round_no=p_round) then return; end if;
  select c.youtube_url,m.current_chart_id::text into previous_url,previous_key from public.battle_royale_matches m
    join public.charts c on c.id=m.current_chart_id where m.id=p_match;
  previous_key:=coalesce(substring(previous_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),previous_key);
  insert into public.battle_royale_song_choices(match_id,round_no,chart_id)
  select p_match,p_round,id from (
    select distinct on (song_key) id,song_key from (
      select c.id,c.play_count,
        coalesce(substring(c.youtube_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),c.id::text) as song_key
      from public.charts c
      where c.youtube_url is not null and
        coalesce(substring(c.youtube_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})'),c.id::text)
          is distinct from previous_key
        and jsonb_array_length(coalesce(to_jsonb(c.notes),'[]'::jsonb))>=4
      order by c.play_count desc nulls last,c.created_at desc limit 400
    ) candidates order by song_key,play_count desc nulls last
  ) unique_songs order by random() limit 6
  on conflict do nothing;
  get diagnostics inserted_count=row_count;
  if inserted_count<>6 then raise exception 'Six distinct playable songs are required for Battle Royale'; end if;
end $$;
revoke all on function public.battle_royale_ensure_songs(uuid,integer) from public,anon,authenticated;

create or replace function public.battle_royale_picked_song(p_match uuid,p_round integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare picked uuid;
begin
  perform public.battle_royale_ensure_songs(p_match,p_round);
  select c.chart_id into picked from public.battle_royale_song_choices c
    left join public.battle_royale_song_votes v
      on v.match_id=c.match_id and v.round_no=c.round_no and v.chart_id=c.chart_id
    where c.match_id=p_match and c.round_no=p_round
    group by c.chart_id order by count(v.user_id) desc,random() limit 1;
  return picked;
end $$;
revoke all on function public.battle_royale_picked_song(uuid,integer) from public,anon,authenticated;

create or replace function public.get_battle_royale_song_vote(p_match uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.battle_royale_matches%rowtype; target_round integer; result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.battle_royale_players
    where match_id=p_match and user_id=auth.uid()) then raise exception 'Not in match'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.status not in ('lobby','round_result') then return null; end if;
  target_round:=case when m.status='lobby' then 1 else m.round_no+1 end;
  perform public.battle_royale_ensure_songs(p_match,target_round);
  select jsonb_build_object('round_no',target_round,'deadline',
      case when m.status='lobby' then m.lobby_deadline else m.round_resolved_at+interval '30 seconds' end,
      'server_now',now(),
      'my_vote',(select v.chart_id from public.battle_royale_song_votes v
        where v.match_id=p_match and v.round_no=target_round and v.user_id=auth.uid()),
      'songs',coalesce(jsonb_agg(jsonb_build_object('id',c.chart_id,'title',ch.title,
        'artist',ch.artist,'youtube_url',ch.youtube_url,'votes',
        (select count(*) from public.battle_royale_song_votes v
          where v.match_id=p_match and v.round_no=target_round and v.chart_id=c.chart_id)
      ) order by ch.title),'[]'::jsonb)) into result
  from public.battle_royale_song_choices c join public.charts ch on ch.id=c.chart_id
  where c.match_id=p_match and c.round_no=target_round;
  return result;
end $$;
grant execute on function public.get_battle_royale_song_vote(uuid) to authenticated;

create or replace function public.vote_battle_royale_song(p_match uuid,p_chart uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m public.battle_royale_matches%rowtype; target_round integer;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if not exists(select 1 from public.battle_royale_players
    where match_id=p_match and user_id=auth.uid() and not is_bot and not eliminated) then
    raise exception 'Only active players may vote';
  end if;
  if m.status='lobby' and now()<m.lobby_deadline then target_round:=1;
  elsif m.status='round_result' and now()<m.round_resolved_at+interval '30 seconds' then target_round:=m.round_no+1;
  else raise exception 'Voting is closed'; end if;
  perform public.battle_royale_ensure_songs(p_match,target_round);
  if not exists(select 1 from public.battle_royale_song_choices
    where match_id=p_match and round_no=target_round and chart_id=p_chart) then raise exception 'Song is not a choice'; end if;
  insert into public.battle_royale_song_votes(match_id,round_no,user_id,chart_id)
  values(p_match,target_round,auth.uid(),p_chart)
  on conflict(match_id,round_no,user_id) do update set chart_id=excluded.chart_id;
end $$;
grant execute on function public.vote_battle_royale_song(uuid,uuid) to authenticated;

-- Keep the staggered bot lobby, fixed loading timer and intermission intact.
create or replace function public.battle_royale_tick(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid(); m public.battle_royale_matches%rowtype;
  humans integer; total_players integer; add_count integer:=0; i integer;
  chart_id uuid;
  names text[]:=array['NOVA','Echo','Pulse','Mira','Vex','Luna','Riff','Kairo','Neon','Astra','Flux','Jinx','Orbit','Sora','Nyx','Tempo'];
  chosen_name text; chosen_mmr integer; diff text;
begin
  if uid is null or not exists(select 1 from public.battle_royale_players
    where match_id=p_match and user_id=uid) then raise exception 'Not in Battle Royale'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then return; end if;
  if m.status='loading' then
    if now()>=coalesce(m.ready_deadline,m.updated_at+interval '15 seconds') then
      update public.battle_royale_players set difficulty=coalesce(difficulty,'Medium'),ready=true
      where match_id=p_match and not eliminated and not is_bot and not ready;
      perform public.battle_royale_start_round(p_match);
    end if;
    return;
  end if;
  if m.status<>'lobby' then return; end if;
  select count(*) filter(where not is_bot),count(*) into humans,total_players
    from public.battle_royale_players where match_id=p_match;
  if humans=0 then
    update public.battle_royale_matches set status='cancelled',updated_at=now() where id=p_match;
    return;
  end if;
  if total_players<8 then
    if now()>=m.created_at+interval '30 seconds' then add_count:=8-total_players;
    elsif now()>=coalesce(m.next_bot_at,m.created_at+interval '20 seconds') then
      add_count:=least(8-total_players,case when random()<0.24 then 2 else 1 end);
    else return; end if;
    for i in 1..add_count loop
      select n into chosen_name from unnest(names) as n
      where not exists(select 1 from public.battle_royale_players p
        where p.match_id=p_match and lower(coalesce(p.bot_name,''))=lower(n))
      order by random() limit 1;
      if chosen_name is null then chosen_name:='Player '||(total_players+i+1)::text; end if;
      chosen_mmr:=greatest(500,m.rating_center+floor(random()*281)::integer-140);
      diff:=case when chosen_mmr<800 then 'Easy' when chosen_mmr<1050 then 'Medium'
        when chosen_mmr<1350 then 'Hard' else 'Expert' end;
      insert into public.battle_royale_players(match_id,is_bot,bot_name,difficulty,ready,bot_mmr)
      values(p_match,true,chosen_name,diff,true,chosen_mmr);
    end loop;
    select count(*) into total_players from public.battle_royale_players where match_id=p_match;
    if total_players>=8 then
      update public.battle_royale_matches set lobby_deadline=now()+interval '3 seconds',updated_at=now() where id=p_match;
    else
      update public.battle_royale_matches set next_bot_at=now()+(1.4+random()*3.2)*interval '1 second',updated_at=now()
      where id=p_match;
    end if;
    return;
  end if;
  if m.vote_opens_at is null then
    update public.battle_royale_matches set vote_opens_at=now(),lobby_deadline=now()+interval '15 seconds',updated_at=now()
    where id=p_match;
    perform public.battle_royale_ensure_songs(p_match,1);
    return;
  end if;
  if m.lobby_deadline>now() then return; end if;
  chart_id:=public.battle_royale_picked_song(p_match,1);
  update public.battle_royale_matches set status='loading',round_no=1,current_chart_id=chart_id,
    start_at=null,round_resolved_at=null,updated_at=now() where id=p_match;
end $$;
grant execute on function public.battle_royale_tick(uuid) to authenticated;

create or replace function public.battle_royale_next_round(p_match uuid)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); m public.battle_royale_matches%rowtype; chart_id uuid;
begin
  if uid is null or not exists(select 1 from public.battle_royale_players
    where match_id=p_match and user_id=uid and not eliminated) then raise exception 'You were eliminated'; end if;
  select * into m from public.battle_royale_matches where id=p_match for update;
  if m.id is null then raise exception 'Battle Royale not found'; end if;
  if m.status='loading' then return; end if;
  if m.status<>'round_result' then raise exception 'Round is not complete'; end if;
  if m.round_resolved_at is null or now()<m.round_resolved_at+interval '30 seconds' then
    raise exception 'Intermission is still running'; end if;
  chart_id:=public.battle_royale_picked_song(p_match,m.round_no+1);
  update public.battle_royale_players set difficulty=case when is_bot then difficulty else null end,
    ready=is_bot,score=0,combo=0,max_combo=0,finished=false,bot_target_score=0
  where match_id=p_match and not eliminated;
  update public.battle_royale_matches set status='loading',round_no=round_no+1,
    current_chart_id=chart_id,start_at=null,round_resolved_at=null,updated_at=now() where id=p_match;
end $$;
grant execute on function public.battle_royale_next_round(uuid) to authenticated;
