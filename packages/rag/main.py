import os
import hashlib
import asyncio
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from services.pdf_parser import extract_text_and_metadata
from services.chunker import split_text
from services.embedder import create_embeddings, query_embeddings, get_sections
from services.qa import answer_question

load_dotenv()

app = FastAPI(
    title="SciGate RAG Engine",
    description="PDF ingestion and query engine for academic papers",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    paper_id: str
    question: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "scigate-rag"}


@app.post("/upload")
async def upload_paper(file: UploadFile = File(...)):
    """
    Ingest a PDF paper:
    1. Parse text with PyMuPDF
    2. Compute SHA256 content hash (used as paper_id)
    3. Split into semantic chunks
    4. Generate embeddings and store in ChromaDB
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    print(f"--- RAG UPLOAD START: {file.filename} ---")
    contents = await file.read()
    print(f"File size: {len(contents)} bytes")
    if len(contents) == 0:
        print("Error: Empty file")
        raise HTTPException(status_code=400, detail="Empty file")

    # Compute content hash (this matches what the smart contract uses)
    content_hash = "0x" + hashlib.sha256(contents).hexdigest()
    paper_id = content_hash

    try:
        # Parse PDF
        print("Parsing PDF...")
        parsed = extract_text_and_metadata(contents)
        print(f"Parsed successful. Pages: {parsed['page_count']}")

        # Split into chunks
        print("Splitting into chunks...")
        chunks = split_text(parsed["full_text"], paper_id=paper_id, pages=parsed["pages"])
        print(f"Created {len(chunks)} chunks")

        # Store in ChromaDB
        print("Creating embeddings and storing in ChromaDB...")
        await asyncio.to_thread(create_embeddings, chunks, paper_id)
        print("ChromaDB storage complete")

        return {
            "paper_id": paper_id,
            "content_hash": content_hash,
            "chunks_count": len(chunks),
            "title": parsed.get("title", file.filename),
            "pages": parsed["page_count"],
        }
    except Exception as e:
        print(f"--- RAG UPLOAD ERROR: {str(e)} ---")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
async def query_paper(req: QueryRequest):
    """
    Answer a natural language question about a paper using RAG.
    Returns the answer with cited chunks and page numbers.
    """
    if len(req.question.strip()) < 5:
        raise HTTPException(status_code=400, detail="Question must be at least 5 characters")

    # Retrieve relevant chunks from ChromaDB
    relevant_chunks = await asyncio.to_thread(query_embeddings, req.paper_id, req.question, n=4)

    if not relevant_chunks:
        raise HTTPException(status_code=404, detail=f"Paper '{req.paper_id}' not found or has no content")

    # Generate answer via LLM
    answer = await answer_question(req.question, relevant_chunks)

    return {
        "paper_id": req.paper_id,
        "answer": answer,
        "chunks": relevant_chunks,
    }


@app.get("/papers/{paper_id}/sections")
async def paper_sections(paper_id: str):
    """
    Return detected sections of a paper (abstract, introduction, etc.)
    """
    sections = await asyncio.to_thread(get_sections, paper_id)
    if not sections:
        raise HTTPException(status_code=404, detail=f"Paper '{paper_id}' not found")

    return {"paper_id": paper_id, "sections": sections}


@app.get("/search")
async def search_papers(q: str):
    """
    Semantic search across all papers in the catalog.
    Returns metadata snippets from matching chunks.
    """
    if len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query too short")

    from services.embedder import search_all
    results = await asyncio.to_thread(search_all, q, n=10)
    return {"query": q, "results": results}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
