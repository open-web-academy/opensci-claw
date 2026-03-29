import fitz  # PyMuPDF
import re
from typing import Any


def extract_text_and_metadata(pdf_bytes: bytes) -> dict[str, Any]:
    """
    Extract text, page count, and basic metadata from a PDF.
    Returns a dict with: full_text, title, pages (list), page_count.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    # Try to get title from PDF metadata
    meta = doc.metadata or {}
    title = meta.get("title", "").strip()

    pages = []
    full_text_parts = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")
        if text.strip():
            pages.append({"page": page_num + 1, "text": text})
            full_text_parts.append(text)

    full_text = "\n".join(full_text_parts)

    # If no title in metadata, try to extract from first page
    if not title and pages:
        first_lines = pages[0]["text"].strip().split("\n")
        # Usually the title is the longest line in the first few lines
        candidate_lines = [l.strip() for l in first_lines[:10] if len(l.strip()) > 10]
        if candidate_lines:
            title = max(candidate_lines, key=len)

    page_count = len(doc)
    doc.close()

    return {
        "full_text": full_text,
        "title": title or "Untitled Paper",
        "pages": pages,
        "page_count": page_count,
    }
