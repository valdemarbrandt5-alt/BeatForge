-- BeatForge ranked lobby leave handling
-- Run once in Supabase SQL Editor.

create or replace function public.leave_ranked_match(p_match uuid)
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

  select * into m
  from public.ranked_matches
  where id = p_match
  for update;

  if m.id is null then return; end if;
  if uid not in (m.player_1,m.player_2) then raise exception 'Not in match'; end if;

  -- Only cancel pre-game lobbies. Never touch a playing/finished match,
  -- so the known-good ranked finish flow remains completely unchanged.
  if m.status in ('voting','ready') then
    update public.ranked_matches
    set status='cancelled', updated_at=now()
    where id=p_match;
  end if;
end
$$;

grant execute on function public.leave_ranked_match(uuid) to authenticated;
