import { NextRequest, NextResponse } from 'next/server';

// Force Node.js runtime (signRequest requires it, NOT Edge)
export const runtime = 'nodejs';

// Acceso dinámico: webpack de Next.js NO puede reemplazar process.env['X'] en build
function getSigningKey(): string {
  const env = process.env;
  const rawKey = env['RP_SIGNING_KEY'] || env['WORLD_ID_SIGNING_KEY'] || '';
  if (!rawKey || rawKey === '0x') return '';
  return rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;
}

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

  const signingKey = getSigningKey();

  if (!signingKey) {
    // Diagnóstico: mostrar qué env vars existen con prefijo WORLD_ o RP_
    const envKeys = Object.keys(process.env).filter(k => 
      k.startsWith('WORLD') || k.startsWith('RP_') || k.startsWith('SIGNING')
    );
    console.error('[rp-signature] No signing key. Available env keys:', envKeys);
    return NextResponse.json(
      { error: `RP_SIGNING_KEY not configured. Available keys: ${envKeys.join(', ') || 'NONE'}` },
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
    console.error('[rp-signature] Failed to sign:', err.message);
    return NextResponse.json(
      { error: `Failed to generate RP signature: ${err.message}` },
      { status: 500 }
    );
  }
}
