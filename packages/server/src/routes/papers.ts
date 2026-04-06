import { Hono } from 'hono';
import { getPaperFromChain } from '../services/contract.js';
import { queryPaper, getPaperSections, searchPapers } from '../services/rag.js';

/**
 * Papers routes — FREE (no x402)
 * The paid endpoints are declared in index.ts as x402 routes;
 * the actual handler logic lives here and is imported.
 */
const papers = new Hono();

import { PAY_TO_ADDRESS } from '../config.js';

// ── GET /papers/search?q=... ──────────────────────────────────────────────────
papers.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q || q.trim().length < 2) {
    return c.json({ error: 'Query must be at least 2 characters' }, 400);
  }
  const results = await searchPapers(q);
  return c.json(results);
});

// ── GET /papers/:id/metadata ──────────────────────────────────────────────────
papers.get('/:id/metadata', async (c) => {
  const id = c.req.param('id') as `0x${string}`;
  const paper = await getPaperFromChain(id);

  // --- HACKATHON HYBRID FIX: Return mock metadata for local papers ---
  if (!paper) {
    return c.json({
      contentHash: id,
      author: PAY_TO_ADDRESS,
      metadataURI: 'ipfs://local-rag-resource',
      pricePerQuery: '10000', // $0.01 (6 decimals)
      pricePerFull: '100000', // $0.10
      trainingPrice: '0',
      totalEarnings: '0',
      totalAccesses: '0',
      active: true,
      createdAt: new Date().toISOString(),
      isLocal: true,
      title: 'Local Paper (RAG Engine)'
    });
  }

  return c.json({
    contentHash: id,
    author: paper.author,
    metadataURI: paper.metadataURI,
    pricePerQuery: paper.pricePerQuery.toString(),
    pricePerFull: paper.pricePerFull.toString(),
    trainingPrice: paper.trainingPrice.toString(),
    totalEarnings: paper.totalEarnings.toString(),
    totalAccesses: paper.totalAccesses.toString(),
    active: paper.active,
    createdAt: new Date(Number(paper.createdAt) * 1000).toISOString(),
  });
});

// ── Paid endpoint handlers (used by index.ts x402 routes) ────────────────────

export async function handleQuery(paperId: string, question: string) {
  if (!question || question.trim().length < 5) {
    return { error: 'Question must be at least 5 characters' };
  }
  return queryPaper(paperId, question);
}

export async function handlePreview(paperId: string) {
  const sectionRes = await getPaperSections(paperId);
  if (!sectionRes.sections || sectionRes.sections.length === 0) {
    return { error: 'No sections found for this paper' };
  }
  // Return the first section as preview (Abstract/Intro)
  const first = sectionRes.sections[0];
  return {
    paper_id: paperId,
    title: first.name,
    content: first.content,
    total_sections: sectionRes.sections.length
  };
}

export async function handleSection(paperId: string, sectionName: string) {
  const sectionRes = await getPaperSections(paperId);
  const section = sectionRes.sections.find(
    (s) => s.name.toLowerCase() === sectionName.toLowerCase()
  );
  if (!section) {
    return { error: `Section '${sectionName}' not found`, available: sectionRes.sections.map((s) => s.name) };
  }
  return section;
}

export async function handleCitations(paperId: string) {
  // For MVP, returns sections which includes references
  const sections = await getPaperSections(paperId);
  const citations = sections.sections.find((s) => s.name.toLowerCase() === 'references');
  return {
    paper_id: paperId,
    citations: citations?.content ?? 'No references section found',
  };
}

export async function handleFull(paperId: string) {
  const sections = await getPaperSections(paperId);
  const fullText = sections.sections.map((s) => `## ${s.name}\n\n${s.content}`).join('\n\n');
  return {
    paper_id: paperId,
    full_text: fullText,
    sections: sections.sections.length,
    note: 'Full text returned as extracted text, not original PDF',
  };
}

export async function handleData(paperId: string) {
  // Query specifically for tables and datasets
  const result = await queryPaper(paperId, 'What datasets, tables, and experimental results are reported in this paper?');
  return {
    paper_id: paperId,
    datasets: result.answer,
    chunks: result.chunks,
  };
}

export { papers };
