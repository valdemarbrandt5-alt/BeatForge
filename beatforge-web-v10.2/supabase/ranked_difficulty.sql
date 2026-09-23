-- Per-player difficulty for real ranked matches.
alter table public.ranked_matches add column if not exists player_1_difficulty text;
alter table public.ranked_matches add column if not exists player_2_difficulty text;

create or replace function public.set_ranked_difficulty(p_match uuid, p_difficulty text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.ranked_matches%rowtype;
  uid uuid := auth.uid();
  d text := initcap(lower(trim(p_difficulty)));
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if d not in ('Easy','Medium','Hard','Expert') then raise exception 'Invalid difficulty'; end if;
  select * into m from public.ranked_matches where id=p_match;
  if m.id is null then raise exception 'Match not found'; end if;
  if uid=m.player_1 then
    update public.ranked_matches set player_1_difficulty=d,updated_at=now() where id=p_match;
  elsif uid=m.player_2 then
    update public.ranked_matches set player_2_difficulty=d,updated_at=now() where id=p_match;
  else
    raise exception 'Not in match';
  end if;
end $$;
grant execute on function public.set_ranked_difficulty(uuid,text) to authenticated;

create or replace function public.get_ranked_difficulties(p_match uuid)
returns table(my_difficulty text, opponent_difficulty text)
language plpgsql
security definer
set search_path=public
as $$
declare
  m public.ranked_matches%rowtype;
  uid uuid := auth.uid();
begin
  select * into m from public.ranked_matches where id=p_match;
  if m.id is null then raise exception 'Match not found'; end if;
  if uid=m.player_1 then return query select m.player_1_difficulty,m.player_2_difficulty;
  elsif uid=m.player_2 then return query select m.player_2_difficulty,m.player_1_difficulty;
  else raise exception 'Not in match'; end if;
end $$;
grant execute on function public.get_ranked_difficulties(uuid) to authenticated;
