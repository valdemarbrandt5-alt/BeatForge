-- Apply after ranked_bots.sql and battle_royale_ready_deadline_guard.sql.
-- Convert bot targets to the same capped 100,000-point competitive scale as players.
create or replace function public.competitive_bot_target(p_target bigint,p_chart uuid,p_difficulty text)
returns bigint language plpgsql security definer set search_path=public as $$
declare base_count integer; effective integer; max_raw numeric; factor numeric; cap numeric;
begin
  select greatest(1,jsonb_array_length(coalesce(to_jsonb(notes),'[]'::jsonb))) into base_count
    from public.charts where id=p_chart;
  factor:=case p_difficulty when 'Easy' then .38 when 'Medium' then .65 when 'Hard' then .87 else 1.10 end;
  cap:=case p_difficulty when 'Easy' then .80 when 'Medium' then .88 when 'Hard' then .95 else 1 end;
  effective:=greatest(1,round(coalesce(base_count,1)*factor)::integer);
  max_raw:=least(effective,9)*1000 + greatest(least(effective,19)-9,0)*2000
    + greatest(least(effective,29)-19,0)*3000 + greatest(least(effective,49)-29,0)*4000
    + greatest(effective-49,0)*5000;
  return least(round(100000*cap)::bigint,
    greatest(0,round(100000*cap*least(1,p_target::numeric/greatest(1,max_raw)))::bigint));
end $$;
revoke all on function public.competitive_bot_target(bigint,uuid,text) from public,anon,authenticated;

create or replace function public.competitive_ranked_bot_target()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.bot_target_score>0 and old.bot_target_score<>new.bot_target_score
    and new.selected_chart_id is not null then
    new.bot_target_score:=public.competitive_bot_target(new.bot_target_score,new.selected_chart_id,new.bot_difficulty);
  end if;
  return new;
end $$;
drop trigger if exists competitive_ranked_bot_target on public.ranked_bot_matches;
create trigger competitive_ranked_bot_target before update on public.ranked_bot_matches
  for each row execute function public.competitive_ranked_bot_target();

create or replace function public.competitive_battle_bot_target()
returns trigger language plpgsql security definer set search_path=public as $$
declare chart uuid;
begin
  if new.is_bot and new.bot_target_score>0 and old.bot_target_score=0 then
    select current_chart_id into chart from public.battle_royale_matches where id=new.match_id;
    if chart is not null then
      new.bot_target_score:=public.competitive_bot_target(new.bot_target_score,chart,new.difficulty);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists competitive_battle_bot_target on public.battle_royale_players;
create trigger competitive_battle_bot_target before update on public.battle_royale_players
  for each row execute function public.competitive_battle_bot_target();

create table if not exists public.competitive_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check(mode in ('ranked','ranked_bot','battle_royale')),
  match_id uuid not null,
  round_no integer not null default 1,
  chart_id uuid not null references public.charts(id),
  difficulty text not null,
  competition_points integer not null check(competition_points between 0 and 100000),
  song_points bigint not null check(song_points>=0),
  created_at timestamptz not null default now(),
  primary key(user_id,mode,match_id,round_no)
);
create index if not exists competitive_results_user_idx on public.competitive_results(user_id,created_at desc);
alter table public.competitive_results enable row level security;
drop policy if exists "competitive results readable" on public.competitive_results;
create policy "competitive results readable" on public.competitive_results
  for select to authenticated using(true);

create or replace function public.record_competitive_result(
  p_mode text,p_match uuid,p_round integer,p_chart uuid,p_difficulty text,p_song_points bigint)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); points bigint; match_chart uuid; match_url text; chosen_url text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_mode='battle_royale' then
    select p.score,m.current_chart_id into points,match_chart
      from public.battle_royale_players p join public.battle_royale_matches m on m.id=p.match_id
      where p.match_id=p_match and p.user_id=uid and m.round_no=p_round
        and m.status in ('round_result','finished');
  elsif p_mode='ranked' then
    select case when m.player_1=uid then m.player_1_score else m.player_2_score end,m.selected_chart_id
      into points,match_chart from public.ranked_matches m
      where m.id=p_match and uid in(m.player_1,m.player_2) and m.status='finished';
  elsif p_mode='ranked_bot' then
    select m.user_score,m.selected_chart_id into points,match_chart from public.ranked_bot_matches m
      where m.id=p_match and m.user_id=uid and m.status='finished';
  else raise exception 'Invalid mode'; end if;
  if points is null or match_chart is null then raise exception 'Result is not available'; end if;
  select youtube_url into match_url from public.charts where id=match_chart;
  select youtube_url into chosen_url from public.charts where id=p_chart;
  if p_chart<>match_chart and (match_url is null or chosen_url is null or
    substring(match_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})') is distinct from
    substring(chosen_url from '(?:[?&]v=|youtu.be/)([A-Za-z0-9_-]{11})')) then
    raise exception 'Chart does not belong to this song';
  end if;
  insert into public.competitive_results(user_id,mode,match_id,round_no,chart_id,difficulty,competition_points,song_points)
  values(uid,p_mode,p_match,p_round,p_chart,p_difficulty,least(100000,greatest(0,points))::integer,
    greatest(0,coalesce(p_song_points,0)))
  on conflict(user_id,mode,match_id,round_no) do nothing;
end $$;
grant execute on function public.record_competitive_result(text,uuid,integer,uuid,text,bigint) to authenticated;
