import { RAG_SERVICE_URL } from '../config.js';

export interface UploadResponse {
  paper_id: string;
  content_hash: string;
  chunks_count: number;
  title: string;
  pages: number;
}

export interface QueryResponse {
  answer: string;
  chunks: Array<{
    text: string;
    page: number;
    chunk_index: number;
  }>;
  paper_id: string;
}

export interface SectionInfo {
  name: string;
  start_page: number;
  content: string;
}

export interface SectionsResponse {
  paper_id: string;
  sections: SectionInfo[];
}

async function ragFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${RAG_SERVICE_URL}${path}`;
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text().catch(() => 'unknown error');
    throw new Error(`RAG engine error (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadPaper(formData: FormData): Promise<UploadResponse> {
  return ragFetch<UploadResponse>('/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function queryPaper(paperId: string, question: string): Promise<QueryResponse> {
  return ragFetch<QueryResponse>('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paper_id: paperId, question }),
  });
}

export async function getPaperSections(paperId: string): Promise<SectionsResponse> {
  return ragFetch<SectionsResponse>(`/papers/${paperId}/sections`);
}

export async function searchPapers(query: string): Promise<{ results: any[] }> {
  return ragFetch<{ results: any[] }>(`/search?q=${encodeURIComponent(query)}`);
}
