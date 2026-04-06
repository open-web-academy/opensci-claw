import { NextResponse } from 'next/server';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://127.0.0.1:3001';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paper_id: string }> }
) {
  try {
    const paperId = (await params).paper_id;
    
    // Proxy to local Hono server (Free route)
    const url = `${SERVER_URL.replace('localhost', '127.0.0.1')}/papers/${encodeURIComponent(paperId)}/preview`;
    console.log(`[Proxy] GET Paper Preview -> ${url}`);
    
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch preview' }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Preview Proxy Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
