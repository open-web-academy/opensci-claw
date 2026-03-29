import { NextResponse } from 'next/server';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://127.0.0.1:3001';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paper_id: string }> }
) {
  try {
    const paperId = (await params).paper_id;
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Proxy to local Hono server
    const url = `${SERVER_URL.replace('localhost', '127.0.0.1')}/papers/${encodeURIComponent(paperId)}/query`;
    console.log(`[Proxy] POST RAG Query -> ${url}`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 402) {
      // Direct pass-through for Payment Required
      return NextResponse.json({ error: 'Payment Required' }, { status: 402 });
    }

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json(
        { error: 'Failed to query paper', detail: errBody },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Query Proxy Error:', err);
    return NextResponse.json({ error: 'Internal Server Error', detail: err.message }, { status: 500 });
  }
}
