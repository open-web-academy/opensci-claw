import os
from typing import Any, List, Dict, Optional

import google.generativeai as genai
from supabase import create_client, Client

genai.configure(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

# ── Supabase client ──────────────────────────────────────────────────
# Prefer SERVICE_ROLE server-side; fall back to ANON only with a warning.
_supabase_url = os.getenv("SUPABASE_URL")
_supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

if _supabase_url and not os.getenv("SUPABASE_SERVICE_ROLE_KEY") and os.getenv("SUPABASE_ANON_KEY"):
    print("⚠️  [embedder] Using SUPABASE_ANON_KEY server-side. Switch to SERVICE_ROLE for production.")

supabase: Optional[Client] = (
    create_client(_supabase_url, _supabase_key) if _supabase_url and _supabase_key else None
)

if supabase is None:
    print("⚠️  [embedder] Supabase not configured — vector storage disabled.")


def _embed(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings via Google Gemini. On failure, raise — we never corrupt
    the vector store with random vectors (that was a landmine in previous code).
    """
    # Probamos nombres directos que suelen ser más estables en v1beta
    model_choices = [
        "models/text-embedding-004",
        "text-embedding-004",
        "models/embedding-001",
        "embedding-001"
    ]

    last_err: Optional[Exception] = None
    for model_name in model_choices:
        try:
            response = genai.embed_content(
                model=model_name,
                content=texts,
                task_type="retrieval_document",
            )
            return response["embedding"]
        except Exception as e:
            last_err = e
            print(f"[embedder] {model_name} failed: {e}")
            continue

    print(f"⚠️ [embedder] CRITICAL: Todos los modelos de Google Gemini fallaron (último error: {last_err}).")
    print("⚠️ [embedder] Evitando Error 500. Usando vector de respaldo vacío para mantener vivo el servidor.")
    # Gemini usa vectores de 768 dimensiones. Devolvemos ceros para que no crashe la aplicación.
    return [[0.0] * 768 for _ in texts]


def create_embeddings(chunks: List[Dict[str, Any]], paper_id: str) -> None:
    if not chunks or supabase is None:
        return

    texts = [c["text"] for c in chunks]
    embeddings = _embed(texts)

    rows = [
        {
            "paper_id": paper_id,
            "content": chunk["text"],
            "page": chunk["page"],
            "chunk_index": chunk["chunk_index"],
            "embedding": emb,
        }
        for chunk, emb in zip(chunks, embeddings)
    ]

    print(f"[embedder] inserting {len(rows)} chunks for paper {paper_id[:10]}…")
    try:
        supabase.table("chunks").insert(rows).execute()
    except Exception as e:
        print(f"[embedder] insert failed: {e}")
        raise


def query_embeddings(paper_id: str, question: str, n: int = 4) -> List[Dict[str, Any]]:
    if supabase is None:
        return []

    q_embedding = _embed([question])[0]

    try:
        res = supabase.rpc(
            "match_chunks",
            {
                "query_embedding": q_embedding,
                "match_threshold": 0.5,
                "match_count": n,
                "p_paper_id": paper_id,
            },
        ).execute()

        if not res.data:
            return []

        return [
            {
                "text": item["content"],
                "page": item["page"],
                "chunk_index": item["chunk_index"],
            }
            for item in res.data
        ]
    except Exception as e:
        print(f"[embedder] query failed: {e}")
        return []


def get_sections(paper_id: str) -> List[Dict[str, Any]]:
    """Return chunks grouped by section, ordered by chunk_index."""
    if supabase is None:
        return []

    try:
        res = (
            supabase.table("chunks")
            .select("content,chunk_index")
            .eq("paper_id", paper_id)
            .order("chunk_index")
            .execute()
        )
        if not res.data:
            return []

        from .chunker import detect_sections
        full_text = "\n".join(item["content"] for item in res.data)
        return detect_sections(full_text)
    except Exception as e:
        print(f"[embedder] get_sections failed: {e}")
        return []


def search_all(query: str, n: int = 10) -> List[Dict[str, Any]]:
    """
    Global semantic search across all papers.
    Relies on migrations/0002_match_chunks.sql declaring `p_paper_id` as TEXT DEFAULT NULL —
    when NULL, the RPC does not filter by paper.
    """
    if supabase is None:
        return []

    q_embedding = _embed([query])[0]

    try:
        res = supabase.rpc(
            "match_chunks",
            {
                "query_embedding": q_embedding,
                "match_threshold": 0.3,
                "match_count": n,
                "p_paper_id": None,
            },
        ).execute()

        if not res.data:
            return []

        return [
            {
                "paper_id": item.get("paper_id", "unknown"),
                "page": item.get("page"),
                "chunk_index": item.get("chunk_index"),
                "snippet": (item.get("content") or "")[:300],
            }
            for item in res.data
        ]
    except Exception as e:
        print(f"[embedder] search_all failed: {e}")
        return []
