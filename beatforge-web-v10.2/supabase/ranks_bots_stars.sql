-- Run once in Supabase SQL Editor before promoting the matching frontend.
begin;

create index if not exists ranked_players_world_rank_idx
  on public.ranked_players(mmr desc,user_id);

alter table public.scores
  add column if not exists star_rating smallint
  check (star_rating between 0 and 5);

alter table public.competitive_results
  add column if not exists star_rating smallint
  check (star_rating between 0 and 5);

-- The existing ranked and Battle Royale triggers call this for new bot targets.
-- Bronze stays approachable; Diamond and above challenge strong players.
create or replace function public.competitive_bot_target(
  p_target bigint,p_chart uuid,p_difficulty text)
returns bigint language plpgsql security definer set search_path=public as $$
declare base_count integer; effective integer; max_raw numeric; factor numeric; cap numeric; skill numeric;
begin
  select greatest(1,jsonb_array_length(coalesce(to_jsonb(notes),'[]'::jsonb))) into base_count
    from public.charts where id=p_chart;
  factor:=case p_difficulty when 'Easy' then .38 when 'Medium' then .65 when 'Hard' then .87 else 1.10 end;
  cap:=case p_difficulty when 'Easy' then .80 when 'Medium' then .88 when 'Hard' then .95 else 1 end;
  effective:=greatest(1,round(coalesce(base_count,1)*factor)::integer);
  max_raw:=least(effective,9)*1000 + greatest(least(effective,19)-9,0)*2000
    + greatest(least(effective,29)-19,0)*3000 + greatest(least(effective,49)-29,0)*4000
    + greatest(effective-49,0)*5000;
  skill:=least(1,greatest(0,coalesce(p_target,0)::numeric/greatest(1,max_raw)));
  return greatest(1000,least(round(max_raw*(.40+.55*skill)),
    round(cap*(10000+65000*skill+90000*skill*skill*skill))))::bigint;
end $$;
revoke all on function public.competitive_bot_target(bigint,uuid,text) from public,anon,authenticated;

create or replace function public.record_competitive_stars(
  p_mode text,p_match uuid,p_round integer,p_stars integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_stars is null or p_stars<0 or p_stars>5 then raise exception 'Invalid star rating'; end if;
  update public.competitive_results set star_rating=p_stars
  where user_id=auth.uid() and mode=p_mode and match_id=p_match and round_no=p_round;
  if not found then raise exception 'Competitive result not found'; end if;
end $$;
revoke all on function public.record_competitive_stars(text,uuid,integer,integer) from public,anon;
grant execute on function public.record_competitive_stars(text,uuid,integer,integer) to authenticated;

commit;
