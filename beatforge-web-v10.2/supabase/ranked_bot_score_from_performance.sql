-- Run after ranked_bot_persisted_stats.sql and ranks_bots_stars.sql.
-- Bot score and the Head to head hit breakdown derive from one performance.
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
  -- Penalize dense charts, especially Expert charts with extreme note density.
  density_penalty:=least(.16,greatest(0,notes*60/song_duration-130)/1000);
  jitter:=((((hashtext(p_match::text)::bigint+2147483648)%101)::numeric/100)-.5)*.05;
  hit_rate:=greatest(.62,least(.992,.79+((p_mmr-600)::numeric/1400)*.20+jitter-density_penalty));
  perfect_share:=greatest(.40,least(.84,.53+((p_mmr-600)::numeric/1400)*.24-density_penalty*.45));
  hits:=greatest(0,least(notes,round(notes*hit_rate)::integer));
  miss:=notes-hits;
  perfect:=greatest(0,least(hits,round(hits*perfect_share)::integer));
  great:=greatest(0,least(hits-perfect,round((hits-perfect)*.68)::integer));
  good:=hits-perfect-great;
  max_combo:=least(hits,greatest(1,round(
    ln(greatest(2,notes*(1-hit_rate)))/(-ln(hit_rate))
    *(.85+((((hashtext(p_match::text)::bigint+2147483648)%37)::numeric/36)*.30)
  )::integer));
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

create or replace function public.competitive_ranked_bot_target()
returns trigger language plpgsql security definer set search_path=public as $$
declare simulated record;
begin
  if new.bot_target_score>0 and old.bot_target_score<>new.bot_target_score
     and new.selected_chart_id is not null then
    select * into simulated
      from public.ranked_bot_simulated_performance(new.id,new.selected_chart_id,new.bot_difficulty,new.bot_mmr);
    new.bot_target_score:=simulated.target_score;
    new.bot_perfect:=simulated.perfect;
    new.bot_great:=simulated.great;
    new.bot_good:=simulated.good;
    new.bot_miss:=simulated.miss;
    new.bot_max_combo:=simulated.max_combo;
  end if;
  return new;
end $$;

create or replace function public.update_ranked_bot_score(
  p_match uuid,p_score bigint,p_finished boolean default false
)
returns table(bot_score bigint,match_status text,my_mmr integer,mmr_delta integer)
language plpgsql security definer set search_path=public as $$
declare
  uid uuid:=auth.uid();
  m public.ranked_bot_matches%rowtype;
  song_duration numeric:=1;
  progress numeric:=0;
  current_bot bigint:=0;
  delta integer:=0;
  new_mmr integer;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.ranked_bot_matches where id=p_match for update;
  if m.id is null or m.user_id<>uid then raise exception 'Not in bot match'; end if;
  if m.status not in ('playing','finished') then raise exception 'Bot match is not playing'; end if;
  if m.status='finished' then
    select mmr into new_mmr from public.ranked_players where user_id=uid;
    return query select m.bot_score,m.status,new_mmr,coalesce(m.mmr_delta,0);
    return;
  end if;

  update public.ranked_bot_matches set
    user_score=greatest(user_score,greatest(0,p_score)),
    user_finished=user_finished or p_finished,
    updated_at=now()
  where id=p_match;
  select * into m from public.ranked_bot_matches where id=p_match for update;
  select greatest(coalesce(c.duration,1)::numeric,1::numeric)
    into song_duration from public.charts c where c.id=m.selected_chart_id;
  progress:=least(1::numeric,greatest(0::numeric,extract(epoch from (now()-m.start_at))::numeric-5.55)/song_duration);
  current_bot:=least(m.bot_target_score,floor(m.bot_target_score::numeric*power(progress::double precision,1.06))::bigint);
  if p_finished then current_bot:=m.bot_target_score; end if;
  update public.ranked_bot_matches set
    bot_score=current_bot,
    bot_combo=least(bot_max_combo,floor(bot_max_combo*current_bot::numeric/greatest(1,bot_target_score))::integer),
    updated_at=now()
  where id=p_match;

  if p_finished then
    if m.user_score=current_bot then
      delta:=0;
      update public.ranked_players set draws=draws+1,updated_at=now() where user_id=uid;
    elsif m.user_score>current_bot then
      delta:=20;
      update public.ranked_players set mmr=greatest(0,mmr+20),wins=wins+1,updated_at=now() where user_id=uid;
    else
      delta:=-20;
      update public.ranked_players set mmr=greatest(0,mmr-20),losses=losses+1,updated_at=now() where user_id=uid;
    end if;
    update public.ranked_bot_matches set status='finished',mmr_delta=delta,updated_at=now() where id=p_match;
  end if;
  select * into m from public.ranked_bot_matches where id=p_match;
  select mmr into new_mmr from public.ranked_players where user_id=uid;
  return query select m.bot_score,m.status,new_mmr,coalesce(m.mmr_delta,0);
end $$;

-- Battle Royale bots use this score target without a stored note breakdown.
create or replace function public.competitive_bot_target(
  p_target bigint,p_chart uuid,p_difficulty text
)
returns bigint language plpgsql security definer set search_path=public as $$
declare
  base_count integer;
  song_duration numeric;
  effective integer;
  max_raw numeric;
  factor numeric;
  cap numeric;
  skill numeric;
  density numeric;
begin
  select greatest(1,jsonb_array_length(coalesce(to_jsonb(notes),'[]'::jsonb))),
         greatest(coalesce(duration,1)::numeric,1)
    into base_count,song_duration from public.charts where id=p_chart;
  factor:=case p_difficulty when 'Easy' then .38 when 'Medium' then .65 when 'Hard' then .87 else 1.10 end;
  cap:=case p_difficulty when 'Easy' then .80 when 'Medium' then .88 when 'Hard' then .95 else 1 end;
  effective:=greatest(1,round(coalesce(base_count,1)*factor)::integer);
  max_raw:=least(effective,9)*1000 + greatest(least(effective,19)-9,0)*2000
    + greatest(least(effective,29)-19,0)*3000 + greatest(least(effective,49)-29,0)*4000
    + greatest(effective-49,0)*5000;
  skill:=least(1,greatest(0,coalesce(p_target,0)::numeric/greatest(1,max_raw)));
  density:=least(.15,greatest(0,effective*60/coalesce(song_duration,1)-130)/1200);
  return greatest(1000,round(least(max_raw*(.40+.55*skill),
    cap*(10000+65000*skill+90000*skill*skill*skill))*(1-density)))::bigint;
end $$;
revoke all on function public.competitive_bot_target(bigint,uuid,text) from public,anon,authenticated;

commit;
