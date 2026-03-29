import os
from typing import Any
import google.generativeai as genai

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

SYSTEM_PROMPT = """You are SciGate, an AI assistant that helps users understand academic papers.
You answer questions based ONLY on the provided paper excerpts.
Always cite which chunk (by page number) your answer comes from.
Be concise, accurate, and helpful. If the answer is not in the provided excerpts, say so clearly.
Do not hallucinate or add information not present in the excerpts."""


async def answer_question(
    question: str,
    chunks: list[dict[str, Any]],
    model_name: str = "gemini-1.5-flash",
) -> str:
    """
    Generate an answer to a question using the provided RAG chunks via Google Gemini.
    """
    # Format chunks as context
    context_parts = []
    for i, chunk in enumerate(chunks):
        context_parts.append(
            f"[Excerpt {i+1}, Page {chunk['page']}]\n{chunk['text']}"
        )
    context = "\n\n---\n\n".join(context_parts)

    prompt = f"{SYSTEM_PROMPT}\n\nBased on the following excerpts from the paper, answer this question:\n\n" \
             f"Question: {question}\n\n" \
             f"Paper excerpts:\n{context}"

    model = genai.GenerativeModel(model_name)
    
    response = await model.generate_content_async(
        prompt,
        generation_config=genai.types.GenerationConfig(
            temperature=0.1,
            max_output_tokens=1024,
        )
    )

    if not response.text:
       return "Unable to generate answer."
    
    return response.text
