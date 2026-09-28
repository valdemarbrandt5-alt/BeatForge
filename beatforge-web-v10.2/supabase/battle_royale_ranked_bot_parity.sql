-- Run after competitive_points.sql and ranked_bot_score_from_performance.sql.
-- Battle Royale bots now use Ranked bots' MMR difficulty bands and simulated
-- hit/quality/combo score. Existing rounds retain their already set targets.
begin;

create or replace function public.battle_royale_ranked_bot_difficulty()
returns trigger language plpgsql security definer set search_path=public as $$
declare effective_mmr integer;
begin
  if not new.is_bot then return new; end if;

  effective_mmr:=new.bot_mmr;
  if effective_mmr is null then
    select rating_center into effective_mmr
    from public.battle_royale_matches where id=new.match_id;
  end if;
  effective_mmr:=coalesce(effective_mmr,1000);

  new.difficulty:=case
    when effective_mmr<850 then 'Easy'
    when effective_mmr<1100 then 'Medium'
    when effective_mmr<1400 then 'Hard'
    else 'Expert'
  end;
  return new;
end $$;

drop trigger if exists battle_royale_ranked_bot_difficulty on public.battle_royale_players;
create trigger battle_royale_ranked_bot_difficulty
before insert on public.battle_royale_players
for each row execute function public.battle_royale_ranked_bot_difficulty();

create or replace function public.competitive_battle_bot_target()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  chart uuid;
  rating integer;
  simulated_score bigint;
begin
  if new.is_bot and new.bot_target_score>0 and old.bot_target_score=0 then
    select current_chart_id,rating_center into chart,rating
    from public.battle_royale_matches where id=new.match_id;
    if chart is not null then
      select performance.target_score into simulated_score
      from public.ranked_bot_simulated_performance(
        new.id,chart,new.difficulty,coalesce(new.bot_mmr,rating,1000)
      ) as performance;
      new.bot_target_score:=simulated_score;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists competitive_battle_bot_target on public.battle_royale_players;
create trigger competitive_battle_bot_target
before update on public.battle_royale_players
for each row execute function public.competitive_battle_bot_target();

commit;
