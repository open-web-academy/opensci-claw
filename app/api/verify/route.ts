import { NextRequest, NextResponse } from 'next/server';

const WORLD_APP_ID = process.env.WORLD_APP_ID ?? process.env.NEXT_PUBLIC_WORLD_APP_ID ?? 'app_8d3e4ef96e0ef911d19e2e42107b16fb';
const RP_ID = process.env.NEXT_PUBLIC_WORLD_RP_ID ?? process.env.RP_ID ?? process.env.WORLD_ID_RP_ID ?? process.env.NEXT_PUBLIC_RP_ID ?? 'rp_9ca69f8de419f87b';
const DEMO_MODE =
  process.env.DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { proof, wallet_address } = body;

  if (!proof || !wallet_address) {
    return NextResponse.json(
      { error: 'proof and wallet_address are required' },
      { status: 400 }
    );
  }

  // ── IDKit v4 format: proof has protocol_version, nonce, action, responses[] ──
  // ── Legacy v3 format: proof has nullifier_hash, merkle_root, proof, verification_level ──
  const isIDKitResult = proof.protocol_version && proof.responses;

  if (!RP_ID && !WORLD_APP_ID) {
    if (DEMO_MODE) {
      return NextResponse.json({
        success: true,
        demo: true,
        nullifier_hash: '0x' + 'a'.repeat(64),
      });
    }
    return NextResponse.json({ error: 'WORLD_APP_ID not configured' }, { status: 500 });
  }

  try {
    if (isIDKitResult) {
      // ── New IDKit v4 verification flow ──
      // Send the full IDKit result to the v4 verify endpoint
      const verifyRes = await fetch(
        `https://developer.world.org/api/v4/verify/${WORLD_APP_ID}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(proof),
        }
      );

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        console.error('[verify] World ID v4 rejected:', err);

        if (DEMO_MODE) {
          return NextResponse.json({
            success: true,
            demo: true,
            nullifier_hash: '0x' + 'a'.repeat(64),
            upstreamError: err,
          });
        }

        return NextResponse.json(
          { success: false, error: 'World ID v4 verification failed', detail: err },
          { status: 400 }
        );
      }

      const data = await verifyRes.json();
      // Extract nullifier from first response
      const nullifier = proof.responses?.[0]?.nullifier ?? data.nullifier_hash ?? 'verified';
      return NextResponse.json({ success: true, nullifier_hash: nullifier });

    } else {
      // ── Legacy v3 flow (fallback) ──
      const { nullifier_hash, merkle_root, proof: zkProof, verification_level } = proof;

      const verifyRes = await fetch(
        `https://developer.world.org/api/v4/verify/${WORLD_APP_ID}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nullifier_hash,
            merkle_root,
            proof: zkProof,
            verification_level: verification_level ?? 'orb',
            action: 'verify-author',
            signal: wallet_address.toLowerCase(),
          }),
        }
      );

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        console.error('[verify] World ID legacy rejected:', err);

        if (DEMO_MODE) {
          return NextResponse.json({
            success: true,
            demo: true,
            nullifier_hash: '0x' + 'a'.repeat(64),
            upstreamError: err,
          });
        }

        return NextResponse.json(
          { success: false, error: 'World ID verification failed', detail: err },
          { status: 400 }
        );
      }

      const data = await verifyRes.json();
      return NextResponse.json({ success: true, nullifier_hash: data.nullifier_hash });
    }
  } catch (err: any) {
    console.error('[verify] Unexpected error:', err);
    if (DEMO_MODE) {
      return NextResponse.json({
        success: true,
        demo: true,
        nullifier_hash: '0x' + 'a'.repeat(64),
      });
    }
    return NextResponse.json(
      { success: false, error: 'Internal verification error', detail: err.message },
      { status: 500 }
    );
  }
}
