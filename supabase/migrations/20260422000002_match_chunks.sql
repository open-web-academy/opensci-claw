-- ============================================================
-- match_chunks RPC — vector similarity search with optional paper scoping
-- When p_paper_id is NULL, searches the entire catalog.
-- ============================================================

create or replace function public.match_chunks(
  query_embedding vector(768),
  match_threshold float default 0.3,
  match_count int default 10,
  p_paper_id text default null
)
returns table (
  id bigint,
  paper_id text,
  chunk_index int,
  page int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.paper_id,
    c.chunk_index,
    c.page,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where
    (p_paper_id is null or c.paper_id = p_paper_id)
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
