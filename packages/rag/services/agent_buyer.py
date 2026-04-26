import os
from typing import List, Dict, Any
import httpx

# Lazy import of x402_handler happens below so this module itself can be
# imported without an agent wallet configured.

SCIGATE_API_URL = os.getenv("SCIGATE_API_URL", "https://scigate.onrender.com")


async def search_and_buy_context(query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Autonomously searches for relevant papers and "buys" queries for them using x402.
    Raises RuntimeError if the agent wallet is not configured.
    """
    # Lazy import — fail only if actually invoked without a configured wallet.
    try:
        from .x402_handler import x402_handler
    except Exception as e:
        raise RuntimeError(f"x402 handler not initialized: {e}")

    print(f"🕵️  Agent Buyer: searching catalog for '{query}'")

    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
        try:
            # Corregimos la ruta de /papers/search a /search (que es la que tiene el RAG)
            search_resp = await client.get(
                f"{SCIGATE_API_URL}/search", params={"q": query}
            )
        except Exception as e:
            print(f"[agent_buyer] search request failed: {e}")
            return []
        if search_resp.status_code != 200:
            return []
        results = search_resp.json().get("results", [])

    # Unique paper ids (top N)
    seen: set[str] = set()
    paper_ids: list[str] = []
    for r in results:
        pid = r.get("paper_id") or r.get("id")
        if pid and pid not in seen:
            seen.add(pid)
            paper_ids.append(pid)
            if len(paper_ids) >= limit:
                break

    purchased_context: list[dict[str, Any]] = []
    for paper_id in paper_ids:
        print(f"💰 Agent Buyer: buying query for {paper_id[:10]}…")
        try:
            resp = await x402_handler.post(
                f"{SCIGATE_API_URL}/papers/{paper_id}/query",
                json={"question": query},
            )
            if resp.status_code == 200:
                data = resp.json()
                purchased_context.append(
                    {
                        "paper_id": paper_id,
                        "answer": data.get("answer"),
                        "chunks": data.get("chunks", []),
                    }
                )
                print(f"✅ bought {paper_id[:10]}…")
            else:
                print(f"❌ failed {paper_id[:10]}… (status {resp.status_code})")
        except Exception as e:
            print(f"⚠️  error on {paper_id[:10]}…: {e}")

    return purchased_context
