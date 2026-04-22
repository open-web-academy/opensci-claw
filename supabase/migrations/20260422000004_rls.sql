-- ============================================================
-- Row-Level Security
-- Public can read papers/chunks. Writes are server-only (service role).
-- ============================================================

alter table public.papers enable row level security;
alter table public.chunks enable row level security;
alter table public.usage_trials enable row level security;
alter table public.pending_records enable row level security;

-- Public read of catalog
create policy papers_public_read on public.papers
  for select using (active = true);

create policy chunks_public_read on public.chunks
  for select using (true);

-- Writes: only service role (RLS is bypassed by service role keys).
-- No anon policies for writes, trials, or pending_records.
