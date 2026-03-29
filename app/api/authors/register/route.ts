import { NextRequest, NextResponse } from 'next/server';

const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001').replace('localhost', '127.0.0.1');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Proxy to local Hono server
    const res = await fetch(`${SERVER_URL}/authors/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: 'Server Error', detail: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Authors Proxy Error:', err);
    return NextResponse.json({ error: 'Failed to proxy to Hono server', detail: err.message }, { status: 500 });
  }
}
