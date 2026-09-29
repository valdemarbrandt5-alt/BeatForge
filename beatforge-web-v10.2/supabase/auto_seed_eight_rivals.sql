-- Run once in the Supabase SQL Editor. Backfills existing charts and automatically
-- maintains eight modest leaderboard rivals per chart and difficulty thereafter.
-- Actual player scores and play counts are never modified.
begin;

create table if not exists public.chart_rival_scores (
  chart_id uuid not null references public.charts(id) on delete cascade,
  difficulty text not null check (difficulty in ('Easy','Medium','Hard','Expert')),
  slot smallint not null check (slot between 1 and 8),
  rival_name text not null,
  score bigint not null check (score >= 0),
  max_combo integer not null check (max_combo >= 0),
  primary key (chart_id,difficulty,slot)
);

alter table public.chart_rival_scores enable row level security;
drop policy if exists "chart rivals are visible" on public.chart_rival_scores;
create policy "chart rivals are visible" on public.chart_rival_scores for select using (true);
grant select on public.chart_rival_scores to anon, authenticated;

create or replace function public.refresh_chart_rivals(p_chart_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.chart_rival_scores
    (chart_id,difficulty,slot,rival_name,score,max_combo)
  with counts as (
    select c.id,
      count(note.value) filter (where mod((note.ordinality-1)*37,100)<38)::integer as easy,
      count(note.value) filter (where mod((note.ordinality-1)*37,100)<62)::integer as medium,
      count(note.value) filter (where mod((note.ordinality-1)*37,100)<82)::integer as hard,
      count(note.value)::integer as expert
    from public.charts c
    left join lateral jsonb_array_elements(c.notes) with ordinality as note(value,ordinality) on true
    where c.id=p_chart_id
    group by c.id
  ), note_counts as (
    select counts.id,difficulty.name,difficulty.note_count
    from counts
    cross join lateral (values
      ('Easy',counts.easy),('Medium',counts.medium),
      ('Hard',counts.hard),('Expert',counts.expert)
    ) as difficulty(name,note_count)
  ), potentials as (
    -- Each perfect tap scores 1000 * the combo multiplier. Holds and any
    -- additional gameplay chords can only increase the actual potential.
    select id,name,note_count,
      1000::numeric * (
        least(note_count,9)
        + 2*greatest(least(note_count,19)-9,0)
        + 3*greatest(least(note_count,29)-19,0)
        + 4*greatest(least(note_count,49)-29,0)
        + 5*greatest(note_count-49,0)
      ) as perfect_taps
    from note_counts
  )
  select p.id,p.name,rival.slot,
    (array['Echo','Nova','Pulse','Flux','Astra','Rune','Vex','Kairo'])[rival.slot],
    floor(p.perfect_taps * least(0.85,
      0.84 - (rival.slot-1)*0.065
      + mod((('x'||substr(md5(p.id::text||p.name||rival.slot),1,6))::bit(24)::integer),10)/1000.0
    ))::bigint,
    round(p.note_count * (0.84 - (rival.slot-1)*0.065))::integer
  from potentials p
  cross join generate_series(1,8) as rival(slot)
  on conflict (chart_id,difficulty,slot) do update
    set rival_name=excluded.rival_name,
        score=excluded.score,
        max_combo=excluded.max_combo;
end $$;

revoke all on function public.refresh_chart_rivals(uuid) from public,anon,authenticated;

create or replace function public.refresh_chart_rivals_on_notes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.refresh_chart_rivals(new.id);
  return new;
end $$;

revoke all on function public.refresh_chart_rivals_on_notes() from public,anon,authenticated;
drop trigger if exists refresh_chart_rivals_after_notes on public.charts;
create trigger refresh_chart_rivals_after_notes
  after insert or update of notes on public.charts
  for each row execute function public.refresh_chart_rivals_on_notes();

-- The initial backfill also replaces older, excessively high rivals. Allow
-- large libraries to complete even if the SQL Editor has a short timeout.
set local statement_timeout = 0;
do $$
declare chart_record record;
begin
  for chart_record in select id from public.charts loop
    perform public.refresh_chart_rivals(chart_record.id);
  end loop;
end $$;

commit;
