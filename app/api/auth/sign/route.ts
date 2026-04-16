import { NextRequest, NextResponse } from 'next/server';
import { signRequest } from '@worldcoin/idkit/signing';

// In a real production app, this key should be in your .env
// For the hackathon staging environment, we use a valid 64-char hex string as fallback
const SIGNING_KEY = process.env.WORLD_ID_SIGNING_KEY || '0000000000000000000000000000000000000000000000000000000000000000';
const RP_ID = process.env.NEXT_PUBLIC_WORLD_RP_ID || 'rp_scigate';

export async function POST(req: NextRequest) {
  try {
    const { action, signal } = await req.json();

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    // Generate the World ID 4.0 RP Signature
    // This signature proves to the World App that the request is coming from your authorized backend
    const { sig, nonce, createdAt, expiresAt } = signRequest({
      action: action,
      signingKeyHex: SIGNING_KEY,
    });

    return NextResponse.json({
      success: true,
      rp_context: {
        rp_id: RP_ID,
        nonce,
        created_at: createdAt,
        expires_at: expiresAt,
        signature: sig,
      }
    });
  } catch (error: any) {
    console.error('Signing Error:', error);
    return NextResponse.json({ error: 'Failed to sign request', detail: error.message }, { status: 500 });
  }
}
