-- BeatForge ranked result performance comparison
-- Run once in Supabase SQL Editor.
-- Adds final hit statistics for human PvP and a read-only simulated performance for ranked bots.

alter table public.ranked_matches
  add column if not exists player_1_perf_ready boolean not null default false,
  add column if not exists player_2_perf_ready boolean not null default false,
  add column if not exists player_1_perfect integer not null default 0,
  add column if not exists player_2_perfect integer not null default 0,
  add column if not exists player_1_great integer not null default 0,
  add column if not exists player_2_great integer not null default 0,
  add column if not exists player_1_good integer not null default 0,
  add column if not exists player_2_good integer not null default 0,
  add column if not exists player_1_final_miss integer not null default 0,
  add column if not exists player_2_final_miss integer not null default 0,
  add column if not exists player_1_max_combo integer not null default 0,
  add column if not exists player_2_max_combo integer not null default 0;

create or replace function public.submit_ranked_performance(
  p_match uuid,
  p_perfect integer,
  p_great integer,
  p_good integer,
  p_miss integer,
  p_max_combo integer
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  m public.ranked_matches%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.ranked_matches where id=p_match for update;
  if m.id is null then raise exception 'Match not found'; end if;
  if uid not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;
  if m.status not in ('playing','finished') then raise exception 'Match has not been played'; end if;

  if uid=m.player_1 then
    update public.ranked_matches set
      player_1_perf_ready=true,
      player_1_perfect=greatest(0,coalesce(p_perfect,0)),
      player_1_great=greatest(0,coalesce(p_great,0)),
      player_1_good=greatest(0,coalesce(p_good,0)),
      player_1_final_miss=greatest(0,coalesce(p_miss,0)),
      player_1_max_combo=greatest(0,coalesce(p_max_combo,0)),
      updated_at=now()
    where id=p_match;
  else
    update public.ranked_matches set
      player_2_perf_ready=true,
      player_2_perfect=greatest(0,coalesce(p_perfect,0)),
      player_2_great=greatest(0,coalesce(p_great,0)),
      player_2_good=greatest(0,coalesce(p_good,0)),
      player_2_final_miss=greatest(0,coalesce(p_miss,0)),
      player_2_max_combo=greatest(0,coalesce(p_max_combo,0)),
      updated_at=now()
    where id=p_match;
  end if;
end $$;

grant execute on function public.submit_ranked_performance(uuid,integer,integer,integer,integer,integer) to authenticated;

create or replace function public.get_ranked_performance(p_match uuid)
returns table(
  player_1 uuid,
  player_2 uuid,
  player_1_score bigint,
  player_2_score bigint,
  player_1_perf_ready boolean,
  player_2_perf_ready boolean,
  player_1_perfect integer,
  player_2_perfect integer,
  player_1_great integer,
  player_2_great integer,
  player_1_good integer,
  player_2_good integer,
  player_1_miss integer,
  player_2_miss integer,
  player_1_max_combo integer,
  player_2_max_combo integer
)
language plpgsql
security definer
set search_path=public
as $$
declare m public.ranked_matches%rowtype;
begin
  select * into m from public.ranked_matches where id=p_match;
  if m.id is null then raise exception 'Match not found'; end if;
  if auth.uid() not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;

  return query select
    m.player_1,m.player_2,
    m.player_1_score,m.player_2_score,
    m.player_1_perf_ready,m.player_2_perf_ready,
    m.player_1_perfect,m.player_2_perfect,
    m.player_1_great,m.player_2_great,
    m.player_1_good,m.player_2_good,
    m.player_1_final_miss,m.player_2_final_miss,
    m.player_1_max_combo,m.player_2_max_combo;
end $$;

grant execute on function public.get_ranked_performance(uuid) to authenticated;

-- Returns a stable, plausible performance line for a ranked bot.
-- The bot already has a server-authoritative final score; these stats are presentation data only.
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
  base_count integer := 0;
  total_notes integer := 1;
  hits integer := 0;
  misses integer := 0;
  perfects integer := 0;
  greats integer := 0;
  goods integer := 0;
  max_combo integer := 0;
  factor numeric := 1;
  hit_rate numeric := 0.88;
  perfect_share numeric := 0.62;
  jitter numeric := 0;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into m from public.ranked_bot_matches where id=p_match;
  if m.id is null or m.user_id<>uid then raise exception 'Not in bot match'; end if;

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

  -- Deterministic +/- 2.5 percentage point variation based on this match id.
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

  if misses=0 then
    max_combo:=hits;
  else
    max_combo:=least(hits,greatest(1,round((hits::numeric/(misses+1)::numeric)*1.8::numeric)::integer));
  end if;

  return query select m.bot_score,perfects,greats,goods,misses,max_combo;
end $$;

grant execute on function public.get_ranked_bot_performance(uuid) to authenticated;
