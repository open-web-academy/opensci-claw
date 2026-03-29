import { NextRequest, NextResponse } from 'next/server';

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    console.log(`[Proxy] Forwarding upload to ${RAG_SERVICE_URL}/upload. File: ${file instanceof File ? file.name : 'Unknown'}`);
    
    // Proxy to local RAG service
    const res = await fetch(`${RAG_SERVICE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'RAG Service Error', detail: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('RAG Proxy Error:', err);
    return NextResponse.json({ error: 'Failed to proxy to RAG service', detail: err.message }, { status: 500 });
  }
}
