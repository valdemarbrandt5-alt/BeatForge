-- BeatForge ranked bot persisted performance
-- Run this once after ranked_bots.sql and ranked_performance_compare.sql.
-- The bot is simulated, but its live combo and final stats are now saved on the match
-- so the result screen matches what the player actually saw during gameplay.

alter table public.ranked_bot_matches
  add column if not exists bot_combo integer not null default 0,
  add column if not exists bot_max_combo integer not null default 0,
  add column if not exists bot_perfect integer not null default 0,
  add column if not exists bot_great integer not null default 0,
  add column if not exists bot_good integer not null default 0,
  add column if not exists bot_miss integer not null default 0;

create or replace function public.update_ranked_bot_score(
  p_match uuid,
  p_score bigint,
  p_finished boolean default false
)
returns table(bot_score bigint,match_status text,my_mmr integer,mmr_delta integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  m public.ranked_bot_matches%rowtype;
  song_duration numeric := 1;
  elapsed numeric := 0;
  progress numeric := 0;
  current_bot bigint := 0;
  current_combo integer := 0;
  delta integer := 0;
  new_mmr integer;

  base_count integer := 0;
  total_notes integer := 1;
  hits integer := 0;
  misses integer := 0;
  perfects integer := 0;
  greats integer := 0;
  goods integer := 0;
  factor numeric := 1;
  hit_rate numeric := 0.88;
  perfect_share numeric := 0.62;
  jitter numeric := 0;
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

  -- PLAY contains BeatForge's count-in + pre-roll before scoring begins.
  elapsed:=greatest(0::numeric,extract(epoch from (now()-m.start_at))::numeric-5.55::numeric);
  progress:=least(1::numeric,elapsed/song_duration);
  current_bot:=least(m.bot_target_score,
    floor(m.bot_target_score::numeric*power(progress::double precision,1.06))::bigint
  );
  if p_finished then current_bot:=m.bot_target_score; end if;

  -- Keep this identical to the combo shown in ranked-bot-ui.ts.
  -- This means max combo on the result screen is the actual maximum combo
  -- that the simulated bot reached during this match, not a newly generated value.
  if current_bot<=0 then
    current_combo:=0;
  else
    current_combo:=(floor(current_bot::numeric/5000::numeric)::integer % 230);
  end if;

  update public.ranked_bot_matches set
    bot_score=current_bot,
    bot_combo=current_combo,
    bot_max_combo=greatest(bot_max_combo,current_combo),
    updated_at=now()
  where id=p_match;

  if p_finished then
    -- Generate the hit breakdown once, at match completion, and persist it.
    -- It is deterministic for this match and will never change between reads.
    select coalesce(jsonb_array_length(coalesce(to_jsonb(c.notes),'[]'::jsonb)),0)
      into base_count
      from public.charts c where c.id=m.selected_chart_id;

    factor := case m.bot_difficulty
      when 'Easy' then 0.38
      when 'Medium' then 0.65
      when 'Hard' then 0.87
      else 1.10
    end;
    total_notes := greatest(1,round(base_count*factor)::integer);

    jitter := ((((hashtext(m.id::text)::bigint + 2147483648) % 101)::numeric / 100::numeric) - 0.5::numeric) * 0.05::numeric;
    hit_rate := greatest(0.70::numeric,least(0.992::numeric,
      0.79::numeric + ((m.bot_mmr-600)::numeric/1400::numeric)*0.20::numeric + jitter
    ));
    perfect_share := greatest(0.45::numeric,least(0.84::numeric,
      0.53::numeric + ((m.bot_mmr-600)::numeric/1400::numeric)*0.24::numeric
    ));

    hits := greatest(0,least(total_notes,round(total_notes*hit_rate)::integer));
    misses := greatest(0,total_notes-hits);
    perfects := greatest(0,least(hits,round(hits*perfect_share)::integer));
    greats := greatest(0,least(hits-perfects,round((hits-perfects)*0.68)::integer));
    goods := greatest(0,hits-perfects-greats);

    update public.ranked_bot_matches set
      bot_perfect=perfects,
      bot_great=greats,
      bot_good=goods,
      bot_miss=misses,
      updated_at=now()
    where id=p_match;

    -- Refresh row after persisted stats/combo updates.
    select * into m from public.ranked_bot_matches where id=p_match for update;

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

    update public.ranked_bot_matches set
      status='finished',bot_score=current_bot,mmr_delta=delta,updated_at=now()
      where id=p_match;
  end if;

  select * into m from public.ranked_bot_matches where id=p_match;
  select mmr into new_mmr from public.ranked_players where user_id=uid;
  return query select m.bot_score,m.status,new_mmr,coalesce(m.mmr_delta,0);
end $$;

grant execute on function public.update_ranked_bot_score(uuid,bigint,boolean) to authenticated;

create or replace function public.get_ranked_bot_performance(p_match uuid)
returns table(
  bot_score bigint,
  bot_perfect integer,
  bot_great integer,
  bot_good integer,
  bot_miss integer,
  bot_max_combo integer
)
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  m public.ranked_bot_matches%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.ranked_bot_matches where id=p_match;
  if m.id is null or m.user_id<>uid then raise exception 'Not in bot match'; end if;

  return query select
    m.bot_score,
    m.bot_perfect,
    m.bot_great,
    m.bot_good,
    m.bot_miss,
    m.bot_max_combo;
end $$;

grant execute on function public.get_ranked_bot_performance(uuid) to authenticated;
