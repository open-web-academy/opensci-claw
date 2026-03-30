import os
import json
import numpy as np
from typing import Any, List, Dict
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# ────────────────────────────────────────────────────────────────────────────
# Lightweight In-Memory Storage (Fallback for ChromaDB)
# ────────────────────────────────────────────────────────────────────────────
class LiteMemoryStore:
    def __init__(self, persistence_path: str = "./lite_db.json"):
        self.path = persistence_path
        self.data: List[Dict[str, Any]] = []
        self.load()

    def load(self):
        """Try to load from a JSON file for basic persistence across restarts."""
        if os.path.exists(self.path):
            try:
                with open(self.path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                    print(f"--- LITE-DB: Loaded {len(self.data)} chunks from {self.path} ---")
            except Exception as e:
                print(f"--- LITE-DB: Load error: {e} ---")
                self.data = []

    def save(self):
        """Save to JSON (excluding the raw numpy arrays)."""
        try:
            with open(self.path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"--- LITE-DB: Save error: {e} ---")

    def upsert(self, ids: List[str], embeddings: List[List[float]], documents: List[str], metadatas: List[Dict[str, Any]]):
        """Add or update chunks in memory."""
        for i, (id_val, emb, doc, meta) in enumerate(zip(ids, embeddings, documents, metadatas)):
            # Check if ID already exists and replace, otherwise append
            existing = next((idx for idx, item in enumerate(self.data) if item["id"] == id_val), None)
            record = {
                "id": id_val,
                "embedding": list(emb),
                "text": doc,
                "metadata": meta
            }
            if existing is not None:
                self.data[existing] = record
            else:
                self.data.append(record)
        self.save()

    def query(self, query_embeddings: List[List[float]], n_results: int, where: Dict[str, Any] = None) -> Dict[str, Any]:
        """Perform cosine similarity search across in-memory chunks."""
        q_vec = np.array(query_embeddings[0])
        
        # Filter data based on 'where' (e.g., {"paper_id": "0x..."})
        candidates = self.data
        if where:
            candidates = [
                item for item in self.data 
                if all(item["metadata"].get(k) == v for k, v in where.items())
            ]

        if not candidates:
            return {"documents": [[]], "metadatas": [[]]}

        # Calculate cosine similarities
        scores = []
        for item in candidates:
            item_vec = np.array(item["embedding"])
            # Cosine similarity: (A dot B) / (||A|| * ||B||)
            sim = np.dot(q_vec, item_vec) / (np.linalg.norm(q_vec) * np.linalg.norm(item_vec))
            scores.append((sim, item))

        # Sort by score descending and take top N
        scores.sort(key=lambda x: x[0], reverse=True)
        top_n = scores[:n_results]

        return {
            "documents": [[item["text"] for score, item in top_n]],
            "metadatas": [[item["metadata"] for score, item in top_n]]
        }

    def get(self, where: Dict[str, Any] = None, include: List[str] = None) -> Dict[str, Any]:
        """Fetch records by metadata filters."""
        candidates = self.data
        if where:
            candidates = [
                item for item in self.data 
                if all(item["metadata"].get(k) == v for k, v in where.items())
            ]
        
        return {
            "documents": [item["text"] for item in candidates],
            "metadatas": [item["metadata"] for item in candidates]
        }

# Instantiate the global lite client
_store = LiteMemoryStore()

def _embed(texts: List[str]) -> List[List[float]]:
    """Generate embeddings via Google Gemini text-embedding-004."""
    try:
        response = genai.embed_content(
            model="models/text-embedding-004",
            content=texts,
            task_type="retrieval_document",
        )
        return response['embedding']
    except Exception as e:
        print(f"--- EMBEDDING ERROR: {str(e)} ---")
        import random
        return [[random.uniform(-1, 1) for _ in range(768)] for _ in texts]

def create_embeddings(chunks: List[Dict[str, Any]], paper_id: str) -> None:
    """Store chunk embeddings in MemoryStore."""
    if not chunks:
        return

    texts = [c["text"] for c in chunks]
    ids = [f"{paper_id}_{c['chunk_index']}" for c in chunks]
    metas = [
        {
            "paper_id": c["paper_id"],
            "chunk_index": c["chunk_index"],
            "page": c["page"],
        }
        for c in chunks
    ]

    embeddings = _embed(texts)
    _store.upsert(ids=ids, embeddings=embeddings, documents=texts, metadatas=metas)

def query_embeddings(paper_id: str, question: str, n: int = 4) -> List[Dict[str, Any]]:
    """Retrieve top-n relevant chunks for a question."""
    q_embedding = _embed([question])[0]

    results = _store.query(
        query_embeddings=[q_embedding],
        n_results=n,
        where={"paper_id": paper_id},
    )

    if not results["documents"] or not results["documents"][0]:
        return []

    chunks = []
    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
        chunks.append({
            "text": doc,
            "page": meta["page"],
            "chunk_index": meta["chunk_index"],
        })
    return chunks

def get_sections(paper_id: str) -> List[Dict[str, Any]]:
    """Return chunks grouped by section (supports /sections endpoint)."""
    results = _store.get(where={"paper_id": paper_id}, include=["documents", "metadatas"])
    if not results["documents"]:
        return []

    from .chunker import detect_sections
    full_text = "\n".join(results["documents"])
    return detect_sections(full_text)

def search_all(query: str, n: int = 10) -> List[Dict[str, Any]]:
    """Global semantic search across all papers."""
    q_embedding = _embed([query])[0]
    results = _store.query(query_embeddings=[q_embedding], n_results=n)

    out = []
    if results["documents"] and results["documents"][0]:
        for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
            out.append({
                "paper_id": meta["paper_id"],
                "page": meta["page"],
                "snippet": doc[:300],
            })
    return out
