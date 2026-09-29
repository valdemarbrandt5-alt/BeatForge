-- Run after ranked_bot_score_from_performance.sql and
-- battle_royale_ranked_bot_parity.sql. Applies to newly selected Ranked bot
-- matches and future Battle Royale rounds. Started matches keep their targets.
begin;

create or replace function public.ranked_bot_simulated_performance(
  p_match uuid,p_chart uuid,p_difficulty text,p_mmr integer
)
returns table(target_score bigint,perfect integer,great integer,good integer,miss integer,max_combo integer)
language plpgsql security definer set search_path=public as $$
declare
  base_count integer;
  song_duration numeric;
  notes integer;
  hits integer;
  hit_rate numeric;
  perfect_share numeric;
  jitter numeric;
  factor numeric;
  cap numeric;
  quality numeric;
  combo_bonus numeric;
  density_penalty numeric;
begin
  select coalesce(jsonb_array_length(coalesce(to_jsonb(c.notes),'[]'::jsonb)),0),
         greatest(coalesce(c.duration,1)::numeric,1)
    into base_count,song_duration from public.charts c where c.id=p_chart;
  if base_count is null then raise exception 'Ranked bot chart not found'; end if;

  factor:=case p_difficulty when 'Easy' then .38 when 'Medium' then .65 when 'Hard' then .87 else 1.10 end;
  cap:=case p_difficulty when 'Easy' then .80 when 'Medium' then .88 when 'Hard' then .95 else 1 end;
  notes:=greatest(1,round(base_count*factor)::integer);
  -- Dense charts remain harder, but the bot no longer loses so much accuracy
  -- that strong players can beat it consistently at the same MMR.
  density_penalty:=least(.13,greatest(0,notes*60/song_duration-130)/1100);
  jitter:=((((hashtext(p_match::text)::bigint+2147483648)%101)::numeric/100)-.5)*.05;
  hit_rate:=greatest(.66,least(.982,.835+((p_mmr-600)::numeric/1400)*.20+jitter-density_penalty));
  perfect_share:=greatest(.43,least(.86,.58+((p_mmr-600)::numeric/1400)*.23-density_penalty*.40));
  hits:=greatest(0,least(notes,round(notes*hit_rate)::integer));
  miss:=notes-hits;
  perfect:=greatest(0,least(hits,round(hits*perfect_share)::integer));
  great:=greatest(0,least(hits-perfect,round((hits-perfect)*.68)::integer));
  good:=hits-perfect-great;
  max_combo:=least(hits,greatest(1,round(
    ln(greatest(2,notes*(1-hit_rate)))/(-ln(hit_rate))
    *(.85+((((hashtext(p_match::text)::bigint+2147483648)%37)::numeric/36)*.30)
  ))::integer));
  quality:=(perfect+great*.8+good*.5)/notes::numeric;
  combo_bonus:=least(1,(hits::numeric/notes)/4*(
    case when max_combo>=10 then power(hit_rate,9) else 0 end+
    case when max_combo>=20 then power(hit_rate,19) else 0 end+
    case when max_combo>=30 then power(hit_rate,29) else 0 end+
    case when max_combo>=50 then power(hit_rate,49) else 0 end
  ));
  target_score:=greatest(0,round(cap*(100000*(.85*quality+.15*max_combo::numeric/notes)+50000*combo_bonus)))::bigint;
  return next;
end $$;
revoke all on function public.ranked_bot_simulated_performance(uuid,uuid,text,integer) from public,anon,authenticated;

commit;
