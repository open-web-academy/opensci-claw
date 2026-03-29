import { NextResponse } from 'next/server';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://127.0.0.1:3001';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    
    if (!q) {
      return NextResponse.json({ error: 'Missing search query "q"' }, { status: 400 });
    }

    // Proxy to local Hono server (using 127.0.0.1)
    const url = `${SERVER_URL.replace('localhost', '127.0.0.1')}/papers/search?q=${encodeURIComponent(q)}`;
    console.log(`[Proxy] GET Paper Search -> ${url}`);
    
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json(
        { error: 'Failed to search from backend', detail: errBody },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Search Proxy Error:', err);
    return NextResponse.json({ error: 'Internal Server Error', detail: err.message }, { status: 500 });
  }
}
