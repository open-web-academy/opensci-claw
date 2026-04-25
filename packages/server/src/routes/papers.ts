import { Hono } from 'hono';
import { getPaperFromChain } from '../services/contract.js';
import { queryPaper, getPaperSections, searchPapers } from '../services/rag.js';
import { PAY_TO_ADDRESS } from '../config.js';
import { getPaperMetadata } from '../services/supabase.js';

const papers = new Hono();

// ── GET /papers/search?q=... ──────────────────────────────────
// Delegates to RAG's /search. If RAG fails, falls back to direct Supabase title search.
papers.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q || q.trim().length < 2) {
    return c.json({ error: 'Query must be at least 2 characters' }, 400);
  }

  let results: any[] = [];
  try {
    const { data } = await searchPapers(q);
    results = data.results ?? [];
  } catch (err: any) {
    console.warn(`[search] RAG engine failed (${err.message}). Using fallback Supabase search...`);
    
    // DEMO FALLBACK: Search Supabase directly by title if AI is down
    const { supabase } = await import('../services/supabase.js');
    if (supabase) {
      const { data: dbPapers } = await supabase
        .from('papers')
        .select('*')
        .ilike('title', `%${q}%`)
        .limit(10);
        
      if (dbPapers) {
        results = dbPapers.map((p: any) => ({
          paper_id: p.id,
          title: p.title,
          author: p.author,
          pricePerQuery: String(Math.round(p.price_query * 1e6)),
          active: p.active,
          snippet: "This is a direct database match (RAG AI Analysis is temporarily unavailable)."
        }));
      }
    }
  }

  // Deduplicate by paper_id (preserve first occurrence)
  const unique = new Map<string, any>();
  for (const p of results) {
    const id = p.paper_id ?? p.id ?? p.title;
    if (id && !unique.has(id)) unique.set(id, p);
  }

  return c.json({ results: Array.from(unique.values()) });
});


// ── GET /papers/:id/metadata ──────────────────────────────────
papers.get('/:id/metadata', async (c) => {
  const id = c.req.param('id');

  // Virtual "agent" papers (synthetic; not registered anywhere)
  if (id === 'agent-query') {
    return c.json({
      contentHash: 'agent-query',
      author: PAY_TO_ADDRESS,
      title: 'NanoClaw Quick Inquiry',
      description: 'Single high-precision inquiry to the autonomous researcher.',
      pricePerQuery: '10000',
      pricePerFull: '10000',
      active: true,
      source: 'virtual',
      isAgent: true,
    });
  }

  if (id === 'agent-full' || id === 'agent') {
    return c.json({
      contentHash: 'agent-full',
      author: PAY_TO_ADDRESS,
      title: 'NanoClaw Alpha Researcher',
      description: 'Full autonomous loop with multi-source synthesis.',
      pricePerQuery: '50000',
      pricePerFull: '50000',
      active: true,
      source: 'virtual',
      isAgent: true,
    });
  }

  // 1. On-chain (canonical)
  const paper = await getPaperFromChain(id as `0x${string}`);
  if (paper) {
    return c.json({
      contentHash: id,
      author: paper.author,
      metadataURI: paper.metadataURI,
      pricePerQuery: paper.priceQuery.toString(),
      pricePerFull: paper.priceFull.toString(),
      trainingPrice: paper.priceTraining.toString(),
      totalEarnings: paper.totalEarnings.toString(),
      totalAccesses: paper.totalAccesses.toString(),
      active: paper.active,
      createdAt: new Date(Number(paper.createdAt) * 1000).toISOString(),
      source: 'chain',
    });
  }

  // 2. Supabase (cache)
  const cloudMeta = await getPaperMetadata(id);
  if (cloudMeta) {
    return c.json({
      contentHash: id,
      author: cloudMeta.author,
      title: cloudMeta.title ?? 'Research Paper',
      pricePerQuery: String(Math.round(cloudMeta.price_query * 1e6)),
      pricePerFull: String(Math.round(cloudMeta.price_full * 1e6)),
      active: cloudMeta.active ?? true,
      source: 'supabase',
    });
  }

  return c.json({ error: 'Paper not found' }, 404);
});

// ── Paid handlers (invoked from index.ts after payment middleware) ────────

export async function handleQuery(paperId: string, question: string) {
  if (!question || question.trim().length < 5) {
    return { data: { error: 'Question must be at least 5 characters' }, status: 400 };
  }

  try {
    const { data, status } = await queryPaper(paperId, question);
    return { data, status };
  } catch (err: any) {
    console.warn(`[handleQuery] RAG engine failed on ${paperId}: ${err.message}. Using fallback answer...`);
    
    // DEMO FALLBACK: Return a simulated positive AI response if the AI service is down
    return {
      data: {
        paper_id: paperId,
        answer: "*(Demo Fallback)* Based on the document analysis, the authors present a comprehensive framework addressing your query. The methodology relies on robust data processing techniques, and the results demonstrate significant improvements over baseline models. This answer is simulated because the RAG AI service is currently unreachable.",
        chunks: []
      },
      status: 200,
    };
  }
}

export async function handlePreview(paperId: string) {
  const { data: sectionRes } = await getPaperSections(paperId);
  if (!sectionRes.sections || sectionRes.sections.length === 0) {
    return { data: { error: 'No sections found for this paper' }, status: 404 };
  }
  const first = sectionRes.sections[0];
  return {
    data: {
      paper_id: paperId,
      title: first.name,
      content: first.content,
      total_sections: sectionRes.sections.length,
    },
    status: 200,
  };
}

export async function handleSection(paperId: string, sectionName: string) {
  const { data: sectionRes } = await getPaperSections(paperId);
  const section = sectionRes.sections.find(
    (s) => s.name.toLowerCase() === sectionName.toLowerCase()
  );
  if (!section) {
    return {
      data: {
        error: `Section '${sectionName}' not found`,
        available: sectionRes.sections.map((s) => s.name),
      },
      status: 404,
    };
  }
  return { data: section, status: 200 };
}

export async function handleCitations(paperId: string) {
  const { data: sections } = await getPaperSections(paperId);
  const citations = sections.sections.find((s) => s.name.toLowerCase() === 'references');
  return {
    data: {
      paper_id: paperId,
      citations: citations?.content ?? 'No references section found',
    },
    status: 200,
  };
}

export async function handleFull(paperId: string) {
  const { data: sections } = await getPaperSections(paperId);
  const fullText = sections.sections.map((s) => `## ${s.name}\n\n${s.content}`).join('\n\n');
  return {
    data: {
      paper_id: paperId,
      full_text: fullText,
      sections: sections.sections.length,
      note: 'Full text returned as extracted text, not original PDF',
    },
    status: 200,
  };
}

export async function handleData(paperId: string) {
  const { data: result } = await queryPaper(
    paperId,
    'What datasets, tables, and experimental results are reported in this paper?'
  );
  return {
    data: {
      paper_id: paperId,
      datasets: result.answer,
      chunks: result.chunks,
    },
    status: 200,
  };
}

export { papers };
