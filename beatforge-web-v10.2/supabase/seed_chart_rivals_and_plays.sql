-- Run once in the Supabase SQL editor after deploying the frontend.
-- Safe to run again: only charts that have not been seeded yet are changed.
-- Rival scores are synthetic and intentionally kept outside real scores and profiles.
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

create table if not exists public.chart_rival_seeded (
  chart_id uuid primary key references public.charts(id) on delete cascade,
  seeded_at timestamptz not null default now()
);

alter table public.chart_rival_scores enable row level security;
drop policy if exists "chart rivals are visible" on public.chart_rival_scores;
create policy "chart rivals are visible" on public.chart_rival_scores for select using (true);
grant select on public.chart_rival_scores to anon, authenticated;

create temporary table new_chart_rival_seeds on commit drop as
select chart.id as chart_id
from public.charts chart
where not exists (select 1 from public.chart_rival_seeded seeded where seeded.chart_id=chart.id);

insert into public.chart_rival_seeded (chart_id)
select chart_id from new_chart_rival_seeds
on conflict (chart_id) do nothing;

update public.charts c
set play_count=greatest(coalesce(c.play_count,0),1001 + mod((('x'||substr(md5(coalesce(nullif(c.youtube_url,''),lower(c.title)||'|'||lower(coalesce(c.artist,'')))),1,6))::bit(24)::int),3500))
from new_chart_rival_seeds fresh
where c.id=fresh.chart_id;

insert into public.chart_rival_scores (chart_id,difficulty,slot,rival_name,score,max_combo)
select chart.id, diff.name, rival.slot,
       (array['Echo','Nova','Pulse','Flux','Astra','Rune','Vex','Kairo'])[rival.slot],
       greatest(500,round(potential.perfect_taps * (
         0.18 + rival.slot*0.091 + mod((('x'||substr(md5(chart.id::text||diff.name||rival.slot),1,6))::bit(24)::int),21)/1000.0
       )))::bigint,
       greatest(1,round(note_count.value * (0.29 + rival.slot*0.079)))::integer
from new_chart_rival_seeds fresh
join public.charts chart on chart.id=fresh.chart_id
cross join (values ('Easy',0.30),('Medium',0.50),('Hard',0.72),('Expert',1.0)) as diff(name,ratio)
cross join lateral (select greatest(1,ceil(jsonb_array_length(chart.notes)*diff.ratio))::integer as value) note_count
cross join lateral (
  select coalesce(sum(1000 * case when hit>=50 then 5 when hit>=30 then 4 when hit>=20 then 3 when hit>=10 then 2 else 1 end),1000)::numeric as perfect_taps
  from generate_series(1,note_count.value) hit
) potential
cross join generate_series(1,8) rival(slot)
on conflict (chart_id,difficulty,slot) do nothing;

commit;
