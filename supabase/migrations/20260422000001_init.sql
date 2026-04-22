-- ============================================================
-- SciGate — initial schema
-- Creates: papers, chunks, usage_trials, pending_records
-- Requires extension: pgvector
-- ============================================================

create extension if not exists vector;

-- ── papers ────────────────────────────────────────────────────
create table if not exists public.papers (
  id              text primary key,                -- sha256 with 0x prefix
  title           text not null,
  author          text not null,                   -- wallet address (lowercase)
  price_query     numeric(10, 4) not null default 0.01,
  price_full      numeric(10, 4) not null default 0.10,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists papers_author_idx on public.papers (lower(author));
create index if not exists papers_active_idx on public.papers (active) where active = true;

-- ── chunks (vector store) ────────────────────────────────────
create table if not exists public.chunks (
  id              bigserial primary key,
  paper_id        text not null references public.papers(id) on delete cascade,
  chunk_index     integer not null,
  page            integer,
  content         text not null,
  embedding       vector(768),                     -- Gemini embedding-001 dim
  created_at      timestamptz not null default now()
);

create index if not exists chunks_paper_idx on public.chunks (paper_id, chunk_index);
create index if not exists chunks_embedding_ivfflat
  on public.chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ── usage_trials (free-trial persistence) ────────────────────
create table if not exists public.usage_trials (
  user_id         text not null,
  kind            text not null check (kind in ('query', 'full')),
  count           integer not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (user_id, kind)
);

-- ── pending_records (queue for on-chain recordAccess retries) ─
create table if not exists public.pending_records (
  id              bigserial primary key,
  paper_id        text not null,
  access_type     text not null,
  amount          text not null,                   -- string to preserve bigint precision
  attempts        integer not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index if not exists pending_records_unresolved_idx
  on public.pending_records (created_at) where resolved_at is null;
