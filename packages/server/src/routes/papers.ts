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
import { getPaperMetadata } from '../services/supabase.js';

// ── GET /papers/search?q=... ──────────────────────────────────────────────────
papers.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q || q.trim().length < 2) {
    return c.json({ error: 'Query must be at least 2 characters' }, 400);
  }
  
  try {
    const { data } = await searchPapers(q);
    const papers = data.results || [];

    // DEDUPLICATION: Group by paper_id to ensure only one card per document
    const uniquePapersMap = new Map();
    for (const p of papers) {
      const id = p.paper_id || p.id || p.title; // Use title as fallback if IDs are missing
      if (!uniquePapersMap.has(id)) {
        uniquePapersMap.set(id, p);
      }
    }
    const uniquePapers = Array.from(uniquePapersMap.values());

    // ENRICHMENT: Fetch fragments only for unique documents
    const enrichedResults = await Promise.all(
      uniquePapers.map(async (p: any) => {
        try {
          const paperId = p.paper_id || p.id;
          if (!paperId) return p;
          const { data: sectionRes } = await getPaperSections(paperId);
          if (sectionRes.sections && sectionRes.sections.length > 0) {
            return { ...p, snippet: sectionRes.sections[0].content };
          }
        } catch (err) {
          console.warn(`[Enrichment] Failed for ${p.id || p.paper_id}:`, err);
        }
        return p;
      })
    );

    return c.json({ results: enrichedResults });
  } catch (err: any) {
    console.error('[Search] Error:', err);
    return c.json({ error: 'Failed to search RAG engine' }, 500);
  }
});

// ── GET /papers/:id/metadata ──────────────────────────────────────────────────
papers.get('/:id/metadata', async (c) => {
  const id = c.req.param('id') as `0x${string}`;

  // 0. SPECIAL CASE: Virtual Agent Metadata
  if (id === 'agent' as any) {
    return c.json({
      contentHash: 'agent',
      author: PAY_TO_ADDRESS,
      title: 'NanoClaw Global AI Researcher',
      description: 'Access the autonomous research agent across the entire document catalog.',
      pricePerQuery: '50000', // $0.05
      pricePerFull: '50000',  // Single access price
      active: true,
      source: 'virtual',
      isAgent: true
    });
  }

  // 1. PRIMARY SOURCE: Supabase Cloud (Fastest)
  const cloudMeta = await getPaperMetadata(id);
  if (cloudMeta) {
    return c.json({
      contentHash: id,
      author: cloudMeta.author,
      title: cloudMeta.title || 'Research Paper',
      pricePerQuery: String(Math.round(cloudMeta.price_query * 1e6)),
      pricePerFull: String(Math.round(cloudMeta.price_full * 1e6)),
      active: true,
      source: 'cloud'
    });
  }

  // 2. SECONDARY SOURCE: World Chain (Decentralized Truth)
  const paper = await getPaperFromChain(id);
  if (paper) {
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
      source: 'blockchain'
    });
  }

  // 3. FALLBACK: Mock/Local
  return c.json({
    contentHash: id,
    author: PAY_TO_ADDRESS,
    metadataURI: 'ipfs://local-rag-resource',
    pricePerQuery: '10000',
    pricePerFull: '100000',
    trainingPrice: '0',
    totalEarnings: '0',
    totalAccesses: '0',
    active: true,
    createdAt: new Date().toISOString(),
    isLocal: true,
    title: 'Local Paper (RAG Engine)',
    source: 'fallback'
  });
});

// ── Paid endpoint handlers (used by index.ts x402 routes) ────────────────────

export async function handleQuery(paperId: string, question: string) {
  if (!question || question.trim().length < 5) {
    return { data: { error: 'Question must be at least 5 characters' }, status: 400 };
  }
  
  console.log(`🤖 [RAG] Querying paper ${paperId} with: "${question}"`);
  try {
    const { data, status } = await queryPaper(paperId, question);
    
    if (status === 402) {
      console.log(`💳 [x402] Payment Required for ${paperId}`);
      return { data, status: 402 };
    }

    console.log(`✅ [RAG] Response received for ${paperId}`);
    return { data, status: 200 };
  } catch (err: any) {
    console.error(`❌ [RAG] Error querying paper ${paperId}:`, err.message);
    
    // SAFETY SHIELD: Handle Quota Exceeded (429) or Service Busy (503)
    if (err.message.includes('429') || err.message.includes('503') || err.message.includes('500')) {
      console.warn(`[SAFETY SHIELD] Gemini quota exceeded or busy. Generating smart fallback...`);
      try {
        // Attempt to get the first section for context
        const { data: sectionData } = await getPaperSections(paperId);
        const firstSec = sectionData.sections?.[0];
        const title = firstSec?.name || 'Scientific Abstract';
        const snippet = firstSec?.content?.substring(0, 500) || 'This paper provides a detailed analysis of the subject matter using RAG technology.';

        return {
          data: {
            answer: `[ANALYSIS MODE: DEMO] Based on the document structure and the section '${title}': ${snippet}... (Note: The deep analysis engine is currently in high demand, providing an intelligent summary from the abstract).`,
            chunks: [{ text: snippet, page: 1, chunk_index: 0 }],
            paper_id: paperId,
            is_simulated: true
          },
          status: 200
        };
      } catch (innerErr) {
        return { 
          data: { 
            error: 'Analysis Engine Temporarily Unavailable',
            detail: 'High demand on Gemini API clusters. Please try again in a few minutes.'
          },
          status: 503
        };
      }
    }

    return { 
      data: { 
        error: 'RAG Engine unreachable', 
        detail: err.message,
        hint: 'The RAG service is active but the upstream AI provider is busy.'
      },
      status: 500
    };
  }
}

export async function handlePreview(paperId: string) {
  const { data: sectionRes } = await getPaperSections(paperId);
  if (!sectionRes.sections || sectionRes.sections.length === 0) {
    return { data: { error: 'No sections found for this paper' }, status: 404 };
  }
  // Return the first section as preview (Abstract/Intro)
  const first = sectionRes.sections[0];
  return {
    data: {
      paper_id: paperId,
      title: first.name,
      content: first.content,
      total_sections: sectionRes.sections.length
    },
    status: 200
  };
}

export async function handleSection(paperId: string, sectionName: string) {
  const { data: sectionRes } = await getPaperSections(paperId);
  const section = sectionRes.sections.find(
    (s) => s.name.toLowerCase() === sectionName.toLowerCase()
  );
  if (!section) {
    return { data: { error: `Section '${sectionName}' not found`, available: sectionRes.sections.map((s) => s.name) }, status: 404 };
  }
  return { data: section, status: 200 };
}

export async function handleCitations(paperId: string) {
  // For MVP, returns sections which includes references
  const { data: sections } = await getPaperSections(paperId);
  const citations = sections.sections.find((s) => s.name.toLowerCase() === 'references');
  return {
    data: {
      paper_id: paperId,
      citations: citations?.content ?? 'No references section found',
    },
    status: 200
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
    status: 200
  };
}

export async function handleData(paperId: string) {
  // Query specifically for tables and datasets
  const { data: result } = await queryPaper(paperId, 'What datasets, tables, and experimental results are reported in this paper?');
  return {
    data: {
      paper_id: paperId,
      datasets: result.answer,
      chunks: result.chunks,
    },
    status: 200
  };
}

export { papers };
