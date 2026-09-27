-- Run in Supabase SQL Editor before deploying the matching frontend.
begin;

alter table public.competitive_results
  add column if not exists display_accuracy numeric(4,1)
  check (display_accuracy between 0 and 100);

create or replace function public.record_competitive_display_accuracy(
  p_mode text, p_match uuid, p_round integer, p_accuracy numeric)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_accuracy is null or p_accuracy < 0 or p_accuracy > 100 then
    raise exception 'Invalid accuracy';
  end if;
  update public.competitive_results
  set display_accuracy=p_accuracy
  where user_id=auth.uid() and mode=p_mode and match_id=p_match and round_no=p_round;
  if not found then raise exception 'Competitive result not found'; end if;
end $$;

revoke all on function public.record_competitive_display_accuracy(text,uuid,integer,numeric) from public,anon;
grant execute on function public.record_competitive_display_accuracy(text,uuid,integer,numeric) to authenticated;

commit;
