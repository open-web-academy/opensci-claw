import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const env = process.env;
  
  // Mostrar TODAS las env vars que no sean de Node/sistema
  const allKeys = Object.keys(env).sort();
  const relevantKeys = allKeys.filter(k => 
    !k.startsWith('npm_') && 
    !k.startsWith('NODE_') && 
    !k.startsWith('__') &&
    !k.startsWith('PATH') &&
    !k.startsWith('HOME') &&
    !k.startsWith('USER') &&
    !k.startsWith('LANG') &&
    !k.startsWith('SHELL')
  );

  return NextResponse.json({
    total_env_count: allKeys.length,
    relevant_keys: relevantKeys,
    has_RP_SIGNING_KEY: !!env['RP_SIGNING_KEY'],
    has_WORLD_ID_SIGNING_KEY: !!env['WORLD_ID_SIGNING_KEY'],
    rp_key_length: (env['RP_SIGNING_KEY'] || '').length,
  });
}
