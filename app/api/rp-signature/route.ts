import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime (signRequest requires it, NOT Edge)
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action } = body;

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  // Leer en runtime, NO al nivel del módulo (Next.js reemplaza process.env en build)
  const rawKey = process.env.RP_SIGNING_KEY || process.env.WORLD_ID_SIGNING_KEY || '';
  const signingKey = rawKey && rawKey !== '0x'
    ? (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`)
    : '';

  if (!signingKey) {
    console.error('[rp-signature] No signing key. RP_SIGNING_KEY:', typeof process.env.RP_SIGNING_KEY, 'WORLD_ID_SIGNING_KEY:', typeof process.env.WORLD_ID_SIGNING_KEY);
    return NextResponse.json(
      { error: `RP_SIGNING_KEY not configured. RAW_KEY length: ${rawKey.length}` },
      { status: 500 }
    );
  }

  try {
    const { signRequest } = await import('@worldcoin/idkit-core/signing');

    const { sig, nonce, createdAt, expiresAt } = signRequest({
      signingKeyHex: signingKey,
      action,
    });

    return NextResponse.json({
      sig,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    console.error('[rp-signature] Failed to sign:', err.message, err.stack);
    return NextResponse.json(
      { error: `Failed to generate RP signature: ${err.message}` },
      { status: 500 }
    );
  }
}
