-- Run after competitive_combo_bonus.sql. Applies to new Ranked bot matches
-- and future Battle Royale rounds; matches already in progress keep their targets.
create or replace function public.competitive_bot_target(p_target bigint,p_chart uuid,p_difficulty text)
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

  -- The raw target overestimates real competitive performance: players lose
  -- points to timing, broken streaks and fewer high-multiplier hits. Keep the
  -- rank-dependent skill and chart difficulty, but use a more human target.
  -- A typical Diamond Expert bot (~0.8 skill) now aims for ~88k instead of ~112k.
  return greatest(1000,round(cap*(15000+75000*skill+20000*skill*skill)))::bigint;
end $$;
revoke all on function public.competitive_bot_target(bigint,uuid,text) from public,anon,authenticated;
