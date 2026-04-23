import os
from typing import Any
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

SYSTEM_PROMPT = """You are SciGate, an AI assistant that helps users understand academic papers.
You answer questions based on the provided paper excerpts.

DYNAMICS:
1. If the answer is in the excerpts, provide it with page citations.
2. If the answer is NOT in the excerpts, but you think it might be in related papers in the catalog,
   respond with the exact phrase: "NEED_GLOBAL_SEARCH: [Search Query]" where [Search Query] is a keyword search to find relevant info.
3. Be concise and accurate."""


def _safe_text(response: Any) -> str:
    """
    Extract text from a Gemini response defensively. Gemini may:
      - block the response on safety rules (response.text raises)
      - return candidates without text
    We surface a clear string rather than 500-ing the endpoint.
    """
    try:
        return response.text or ""
    except Exception as e:
        print(f"[qa] response.text raised: {e}")
        block_reason = getattr(getattr(response, "prompt_feedback", None), "block_reason", None)
        if block_reason:
            return f"[Model refused: {block_reason}]"
        return "[Model returned no text]"


async def answer_question(
    question: str,
    chunks: list[dict[str, Any]],
    model_name: str = "gemini-1.5-flash-latest",
    allow_agent_buy: bool = True,
) -> str:
    """
    RAG answer. If the model asks for a global search AND allow_agent_buy=True,
    we lazily import the agent buyer (so the RAG service can start even when
    the agent wallet is not configured).
    """
    context_parts = [
        f"[Excerpt {i + 1}, Page {chunk['page']}]\n{chunk['text']}"
        for i, chunk in enumerate(chunks)
    ]
    context = "\n\n---\n\n".join(context_parts) if context_parts else "(no context available)"

    prompt = (
        f"{SYSTEM_PROMPT}\n\n"
        f"Based on these excerpts from the current paper, answer: {question}\n\n"
        f"Paper excerpts:\n{context}"
    )

    model = genai.GenerativeModel(model_name)
    response = await model.generate_content_async(prompt)
    answer = _safe_text(response) or "Unable to generate answer."

    if "NEED_GLOBAL_SEARCH:" not in answer or not allow_agent_buy:
        return answer

    search_query = answer.split("NEED_GLOBAL_SEARCH:", 1)[1].strip()
    print(f"[qa] Agentic flow: buying context for '{search_query}'")

    # Lazy import — only load the x402 agent buyer when it's actually needed.
    # This keeps the RAG service bootable without RAG_AGENT_PRIVATE_KEY.
    try:
        from .agent_buyer import search_and_buy_context
    except Exception as e:
        print(f"[qa] agent buyer unavailable: {e}")
        return answer

    try:
        purchased_data = await search_and_buy_context(search_query)
    except Exception as e:
        print(f"[qa] agent buyer failed: {e}")
        return answer

    if not purchased_data:
        return answer

    extra_info = "\n\n--- BOUGHT CONTEXT FROM OTHER PAPERS ---\n"
    for p in purchased_data:
        extra_info += f"\n[Paper {p['paper_id']}]: {p['answer']}\n"

    final_prompt = (
        "I have purchased extra information to help you. Combine it with the original "
        "paper excerpts to answer the user.\n\n"
        f"Question: {question}\n"
        f"Original Context:\n{context}\n"
        f"Purchased Context:\n{extra_info}\n\n"
        "Final Answer:"
    )
    final_resp = await model.generate_content_async(final_prompt)
    return _safe_text(final_resp) or answer
