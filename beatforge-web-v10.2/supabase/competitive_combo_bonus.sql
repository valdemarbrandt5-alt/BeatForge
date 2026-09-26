-- Apply once before deploying the matching frontend. Existing results stay intact.
begin;

alter table public.competitive_results
  drop constraint if exists competitive_results_competition_points_check;
alter table public.competitive_results
  add constraint competitive_results_competition_points_check
  check (competition_points between 0 and 150000);

-- Keep bots on the same expanded point scale. Their raw target is a proxy for
-- accuracy; higher targets are also more likely to sustain the combo bonus.
create or replace function public.competitive_bot_target(p_target bigint,p_chart uuid,p_difficulty text)
returns bigint language plpgsql security definer set search_path=public as $$
declare base_count integer; effective integer; max_raw numeric; factor numeric; cap numeric; quality numeric;
begin
  select greatest(1,jsonb_array_length(coalesce(to_jsonb(notes),'[]'::jsonb))) into base_count
    from public.charts where id=p_chart;
  factor:=case p_difficulty when 'Easy' then .38 when 'Medium' then .65 when 'Hard' then .87 else 1.10 end;
  cap:=case p_difficulty when 'Easy' then .80 when 'Medium' then .88 when 'Hard' then .95 else 1 end;
  effective:=greatest(1,round(coalesce(base_count,1)*factor)::integer);
  max_raw:=least(effective,9)*1000 + greatest(least(effective,19)-9,0)*2000
    + greatest(least(effective,29)-19,0)*3000 + greatest(least(effective,49)-29,0)*4000
    + greatest(effective-49,0)*5000;
  quality:=least(1,greatest(0,coalesce(p_target,0)::numeric/greatest(1,max_raw)));
  return round(cap*(100000*quality+50000*quality*quality))::bigint;
end $$;
revoke all on function public.competitive_bot_target(bigint,uuid,text) from public,anon,authenticated;

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
  values(uid,p_mode,p_match,p_round,p_chart,p_difficulty,least(150000,greatest(0,points))::integer,
    greatest(0,coalesce(p_song_points,0)))
  on conflict(user_id,mode,match_id,round_no) do nothing;
end $$;
grant execute on function public.record_competitive_result(text,uuid,integer,uuid,text,bigint) to authenticated;

commit;
