import { NextResponse } from 'next/server';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://127.0.0.1:3001';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const address = (await params).address;
    
    // Proxy to local Hono server (using 127.0.0.1 to avoid Windows IPv6 localhost issues)
    const url = SERVER_URL.replace('localhost', '127.0.0.1') + `/authors/${address}/papers`;
    
    console.log(`[Proxy] GET Dashboard Papers -> ${url}`);
    
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    });

    if (!res.ok) {
      const errBody = await res.text();
      return NextResponse.json(
        { error: 'Failed to fetch from backend', detail: errBody },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Papers Proxy Error:', err);
    return NextResponse.json({ error: 'Internal Server Error', detail: err.message }, { status: 500 });
  }
}
