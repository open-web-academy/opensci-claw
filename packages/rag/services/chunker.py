import re
from typing import Any

SECTION_HEADERS = [
    "abstract", "introduction", "background", "related work",
    "methodology", "methods", "approach", "experiments",
    "results", "discussion", "conclusion", "conclusions",
    "future work", "acknowledgements", "acknowledgments", "references",
]

def split_text(
    full_text: str,
    paper_id: str,
    pages: list[dict[str, Any]],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[dict[str, Any]]:
    """
    Split paper text into chunks using a simple native Python splitter (no LangChain needed).
    Each chunk carries paper_id, chunk_index, and approximate page number.
    """
    
    # Simple recursive-like splitter implementation
    raw_chunks = []
    start = 0
    while start < len(full_text):
        end = start + chunk_size
        if end > len(full_text):
            end = len(full_text)
        
        chunk = full_text[start:end]
        raw_chunks.append(chunk)
        
        if end == len(full_text):
            break
        start = end - chunk_overlap

    # Build a rough page lookup: character offset → page number
    page_offsets: list[tuple[int, int]] = []
    offset = 0
    for page in pages:
        page_offsets.append((offset, page["page"]))
        offset += len(page["text"])

    def get_page(char_offset: int) -> int:
        page_num = 1
        for (start_off, pnum) in page_offsets:
            if char_offset >= start_off:
                page_num = pnum
            else:
                break
        return page_num

    chunks = []
    char_offset = 0
    for idx, chunk_text in enumerate(raw_chunks):
        chunks.append({
            "paper_id": paper_id,
            "chunk_index": idx,
            "text": chunk_text,
            "page": get_page(char_offset),
            "char_offset": char_offset,
        })
        char_offset += len(chunk_text) - chunk_overlap

    return chunks

def detect_sections(full_text: str) -> list[dict[str, Any]]:
    """Detect section headers in the paper text."""
    lines = full_text.split("\n")
    sections = []
    current_section = None
    current_content: list[str] = []

    for line in lines:
        stripped = line.strip().lower()
        # Check if this line looks like a section header
        matched = None
        for header in SECTION_HEADERS:
            pattern = rf"^(\d+\.?\s+)?{re.escape(header)}[\s:]*$"
            if re.match(pattern, stripped):
                matched = header
                break

        if matched:
            if current_section:
                sections.append({
                    "name": current_section,
                    "content": "\n".join(current_content).strip(),
                    "start_page": 1,
                })
            current_section = matched.capitalize()
            current_content = []
        elif current_section:
            current_content.append(line)
        else:
            # Lines before the first section (e.g. title/authors)
            pass

    if current_section:
        sections.append({
            "name": current_section,
            "content": "\n".join(current_content).strip(),
            "start_page": 1,
        })

    return sections
