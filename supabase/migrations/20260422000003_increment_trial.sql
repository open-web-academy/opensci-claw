-- ============================================================
-- increment_trial RPC — atomic upsert+increment of free-trial counter
-- Returns the new count.
-- ============================================================

create or replace function public.increment_trial(p_user_id text, p_kind text)
returns integer
language plpgsql
as $$
declare
  new_count integer;
begin
  insert into public.usage_trials as t (user_id, kind, count, updated_at)
  values (p_user_id, p_kind, 1, now())
  on conflict (user_id, kind) do update
    set count = t.count + 1,
        updated_at = now()
  returning count into new_count;

  return new_count;
end;
$$;
