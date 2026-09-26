-- Run before deploying the matching frontend. Old results without hit counts remain unchanged.
begin;

alter table public.competitive_results
  add column if not exists perfect integer,
  add column if not exists great integer,
  add column if not exists good integer,
  add column if not exists miss integer,
  add column if not exists max_combo integer;

create or replace function public.record_competitive_hit_stats(
  p_mode text,p_match uuid,p_round integer,
  p_perfect integer,p_great integer,p_good integer,p_miss integer,p_max_combo integer)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if least(p_perfect,p_great,p_good,p_miss,p_max_combo)<0 then
    raise exception 'Hit counts cannot be negative';
  end if;
  update public.competitive_results
  set perfect=p_perfect,great=p_great,good=p_good,miss=p_miss,max_combo=p_max_combo
  where user_id=auth.uid() and mode=p_mode and match_id=p_match and round_no=p_round;
  if not found then raise exception 'Competitive result not found'; end if;
end $$;

revoke all on function public.record_competitive_hit_stats(text,uuid,integer,integer,integer,integer,integer,integer) from public,anon;
grant execute on function public.record_competitive_hit_stats(text,uuid,integer,integer,integer,integer,integer,integer) to authenticated;

commit;
