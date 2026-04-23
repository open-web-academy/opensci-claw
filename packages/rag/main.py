from dotenv import load_dotenv
load_dotenv()

import os
import hashlib
import asyncio
import json
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from services.pdf_parser import extract_text_and_metadata
from services.chunker import split_text
from services.embedder import create_embeddings, query_embeddings, get_sections, search_all
from services.qa import answer_question, answer_question_with_x402_skill

# ── Internal auth (optional) ─────────────────────────────────────────────────
# The RAG service should only be reachable from the Hono gateway in production.
# Set RAG_INTERNAL_TOKEN to enforce this. Leave empty for local dev.
RAG_INTERNAL_TOKEN = os.getenv("RAG_INTERNAL_TOKEN", "")


async def require_internal(x_internal_token: Optional[str] = Header(None)):
    if not RAG_INTERNAL_TOKEN:
        return True
    if x_internal_token != RAG_INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")
    return True


app = FastAPI(
    title="SciGate RAG Engine",
    description="PDF ingestion and query engine for academic papers",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    paper_id: str
    question: str


class AgentRequest(BaseModel):
    topic: str
    mode: Optional[str] = "query"


@app.get("/health")
async def health():
    return {"status": "ok", "service": "scigate-rag", "version": "2.0.0"}


@app.post("/upload")
async def upload_paper(file: UploadFile = File(...)):
    """
    Ingest a PDF paper:
      1. Parse text
      2. Compute sha256 (used as paper_id / contentHash)
      3. Split into semantic chunks
      4. Embed + insert into Supabase vector store
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    content_hash = "0x" + hashlib.sha256(contents).hexdigest()
    paper_id = content_hash

    try:
        parsed = extract_text_and_metadata(contents)
        chunks = split_text(parsed["full_text"], paper_id=paper_id, pages=parsed["pages"])
        await asyncio.to_thread(create_embeddings, chunks, paper_id)
        return {
            "paper_id": paper_id,
            "content_hash": content_hash,
            "chunks_count": len(chunks),
            "title": parsed.get("title", file.filename),
            "pages": parsed["page_count"],
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", dependencies=[Depends(require_internal)])
async def query_paper(req: QueryRequest):
    """
    Answer a question about a paper. Payment enforcement lives in the Hono gateway;
    this endpoint trusts that callers have already paid.
    """
    if len(req.question.strip()) < 5:
        raise HTTPException(status_code=400, detail="Question must be at least 5 characters")

    relevant_chunks = await asyncio.to_thread(query_embeddings, req.paper_id, req.question, n=4)
    if not relevant_chunks:
        raise HTTPException(
            status_code=404, detail=f"Paper '{req.paper_id}' not found or has no content"
        )

    answer = await answer_question(req.question, relevant_chunks)
    return {"paper_id": req.paper_id, "answer": answer, "chunks": relevant_chunks}


@app.get("/papers/{paper_id}/sections", dependencies=[Depends(require_internal)])
async def paper_sections(paper_id: str):
    sections = await asyncio.to_thread(get_sections, paper_id)
    if not sections:
        raise HTTPException(status_code=404, detail=f"Paper '{paper_id}' not found")
    return {"paper_id": paper_id, "sections": sections}


@app.get("/search")
async def search_papers(q: str):
    """Public global semantic search."""
    if len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Query too short")
    results = await asyncio.to_thread(search_all, q, n=10)
    return {"query": q, "results": results}


@app.post("/ask-agent", dependencies=[Depends(require_internal)])
async def ask_agent(req: AgentRequest):
    """
    Autonomous research loop. Streams SSE progress to the caller (Hono gateway).
    Allow agent buy only for `mode=full` to avoid expensive spend on quick queries.
    """
    async def event_generator():
        def sse(payload: dict) -> str:
            return f"data: {json.dumps(payload)}\n\n"

        try:
            yield sse({
                "status": "searching",
                "message": f'NanoClaw: initiating search for "{req.topic}"...',
            })
            await asyncio.sleep(0.25)
            yield sse({
                "status": "analyzing",
                "message": "Processing knowledge and negotiating x402 access...",
            })

            if req.mode == "full":
                # Full mode: Gemini function-calling with x402 skill (pays for external APIs).
                final_answer = await answer_question_with_x402_skill(req.topic, [])
            else:
                # Query mode: lightweight path, no autonomous purchasing.
                final_answer = await answer_question(req.topic, [], allow_agent_buy=False)

            yield sse({
                "status": "done",
                "message": "Research complete.",
                "data": {"answer": final_answer, "paper_id": "GLOBAL_CATALOG"},
            })
        except Exception as e:
            print(f"[ask-agent] error: {e}")
            yield sse({"status": "error", "message": f"Agent failure: {e}"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
