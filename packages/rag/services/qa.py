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

# System prompt for the x402-skill-enabled agentic mode (used by answer_question_with_x402_skill).
_X402_TOOL_SYSTEM_PROMPT = """You are SciGate, an autonomous AI research assistant.

You have access to call_x402_endpoint — use it to query any x402-protected academic API.
The x402 protocol handles payment (USDC on World Chain or Solana) automatically.

Guidelines:
1. Use the provided paper excerpts when they contain the answer.
2. Call call_x402_endpoint for information from external data sources when needed.
3. After receiving tool results, synthesize a concise, accurate answer with citations
   (paper IDs, URLs, page numbers).
4. Do not mention payment amounts or blockchain details to the user."""

_MAX_TOOL_TURNS = 3


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


async def answer_question_with_x402_skill(
    question: str,
    chunks: list[dict[str, Any]],
    model_name: str = "gemini-1.5-flash",
) -> str:
    """
    Agentic Q&A with the x402 skill registered as a Gemini function-calling tool.

    The model may invoke call_x402_endpoint zero or more times (up to _MAX_TOOL_TURNS)
    to fetch data from x402-protected APIs before composing a final answer.
    Falls back gracefully if the skill or wallet is unavailable.

    Use this for high-value agent mode (mode='full'); keep answer_question() for
    lightweight query mode so cheap requests don't pay the function-calling overhead.
    """
    # Lazy import keeps the RAG service bootable without agent wallet keys.
    try:
        from .x402_skill import TOOL_INSTANCE as skill  # noqa: PLC0415
    except Exception as exc:
        print(f"[qa] x402_skill unavailable, falling back to answer_question: {exc}")
        return await answer_question(question, chunks, model_name, allow_agent_buy=True)

    context_parts = [
        f"[Excerpt {i + 1}, Page {chunk['page']}]\n{chunk['text']}"
        for i, chunk in enumerate(chunks)
    ]
    context = "\n\n---\n\n".join(context_parts) if context_parts else "(no context available)"

    prompt = f"Question: {question}\n\nPaper excerpts:\n{context}"

    model = genai.GenerativeModel(
        model_name,
        tools=[skill.get_tool_definition()],
        system_instruction=_X402_TOOL_SYSTEM_PROMPT,
    )
    chat = model.start_chat()

    try:
        response = await chat.send_message_async(prompt)
    except Exception as exc:
        print(f"[qa] initial send_message failed: {exc}")
        return await answer_question(question, chunks, model_name, allow_agent_buy=True)

    for turn in range(_MAX_TOOL_TURNS):
        candidates = response.candidates or []
        parts = candidates[0].content.parts if (candidates and candidates[0].content) else []
        fn_parts = [p for p in parts if hasattr(p, "function_call") and p.function_call.name]

        if not fn_parts:
            break  # model is done with tool calls

        result_parts = []
        for part in fn_parts:
            fc = part.function_call
            if fc.name != skill.TOOL_NAME:
                continue
            args = dict(fc.args)
            print(f"[qa] x402 tool call (turn {turn + 1}): {args.get('method', 'GET')} {args.get('url', '?')}")
            result = await skill.execute(args)
            result_parts.append(
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=fc.name,
                        response=skill.result_to_model_response(result),
                    )
                )
            )

        if not result_parts:
            break

        try:
            response = await chat.send_message_async(
                genai.protos.Content(parts=result_parts)
            )
        except Exception as exc:
            print(f"[qa] tool response send failed (turn {turn + 1}): {exc}")
            break

    return _safe_text(response) or "Unable to generate answer."
