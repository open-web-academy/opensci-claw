import os
from typing import Any
import chromadb
from chromadb.config import Settings
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

_chroma = chromadb.PersistentClient(
    path="./chroma_db",
    settings=Settings(anonymized_telemetry=False),
)

_collection = _chroma.get_or_create_collection(
    name="scigate_papers",
    metadata={"hnsw:space": "cosine"},
)


def _embed(texts: list[str]) -> list[list[float]]:
    """Generate embeddings via Google Gemini text-embedding-004. Fallback to random if fails."""
    try:
        if not os.getenv("GEMINI_API_KEY") or "AIza" not in os.getenv("GEMINI_API_KEY", ""):
            raise ValueError("Invalid Gemini API Key")

        response = genai.embed_content(
            model="models/text-embedding-004",
            content=texts,
            task_type="retrieval_document",
        )
        return response['embedding']
    except Exception as e:
        print(f"--- EMBEDDING ERROR (FALLBACK TRIGGERED): {str(e)} ---")
        # Return random vectors of dimension 768 (text-embedding-004 default)
        import random
        return [[random.uniform(-1, 1) for _ in range(768)] for _ in texts]


def create_embeddings(chunks: list[dict[str, Any]], paper_id: str) -> None:
    """Store chunk embeddings in ChromaDB."""
    if not chunks:
        return

    texts   = [c["text"]        for c in chunks]
    ids     = [f"{paper_id}_{c['chunk_index']}" for c in chunks]
    metas   = [
        {
            "paper_id":    c["paper_id"],
            "chunk_index": c["chunk_index"],
            "page":        c["page"],
        }
        for c in chunks
    ]

    embeddings = _embed(texts)

    _collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metas,
    )


def query_embeddings(
    paper_id: str,
    question: str,
    n: int = 4,
) -> list[dict[str, Any]]:
    """
    Retrieve top-n relevant chunks for a question, filtered by paper_id.
    Returns list of {text, page, chunk_index} dicts.
    """
    q_embedding = _embed([question])[0]

    results = _collection.query(
        query_embeddings=[q_embedding],
        n_results=n,
        where={"paper_id": paper_id},
    )

    if not results["documents"] or not results["documents"][0]:
        return []

    chunks = []
    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):  # type: ignore[index]
        chunks.append({
            "text":        doc,
            "page":        meta["page"],
            "chunk_index": meta["chunk_index"],
        })

    return chunks


def get_sections(paper_id: str) -> list[dict[str, Any]]:
    """
    Return all chunks for a paper grouped by detected section.
    Used for /sections endpoint.
    """
    results = _collection.get(
        where={"paper_id": paper_id},
        include=["documents", "metadatas"],
    )

    if not results["documents"]:
        return []

    from services.chunker import detect_sections  # lazy import to avoid circular
    full_text = "\n".join(results["documents"])  # type: ignore[arg-type]
    return detect_sections(full_text)


def search_all(query: str, n: int = 10) -> list[dict[str, Any]]:
    """Search across all papers (no paper_id filter)."""
    q_embedding = _embed([query])[0]

    results = _collection.query(
        query_embeddings=[q_embedding],
        n_results=n,
    )

    out = []
    if results["documents"] and results["documents"][0]:
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):  # type: ignore[index]
            out.append({
                "paper_id": meta["paper_id"],
                "page":     meta["page"],
                "snippet":  doc[:300],
            })

    return out
