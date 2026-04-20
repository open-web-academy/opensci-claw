import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('--- WARNING: SUPABASE CONFIGURATION MISSING IN SERVER ---');
}

export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

/**
 * Metadata for a Research Paper
 */
export interface PaperMetadata {
  id: string;
  title: string;
  author: string;
  price_query: number;
  price_full: number;
}

/**
 * Saves or updates paper metadata in Supabase Cloud
 */
export async function savePaperMetadata(metadata: PaperMetadata) {
  if (!supabase) return;
  
  console.log(`--- SUPABASE: Saving metadata for ${metadata.id} ---`);
  const { error } = await supabase
    .from('papers')
    .upsert(metadata);

  if (error) {
    console.error(`--- SUPABASE SAVE ERROR: ${error.message} ---`);
    throw error;
  }
}

/**
 * Retrieves paper metadata from Supabase Cloud
 */
export async function getPaperMetadata(paperId: string): Promise<PaperMetadata | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('papers')
    .select('*')
    .eq('id', paperId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error(`--- SUPABASE GET ERROR: ${error.message} ---`);
    return null;
  }
  return data as PaperMetadata;
}

/**
 * Retrieves all papers registered by a specific author wallet
 */
export async function getPapersByAuthor(wallet: string): Promise<PaperMetadata[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('papers')
    .select('*')
    .eq('author', wallet.toLowerCase());

  if (error) {
    console.error(`--- SUPABASE AUTHOR SEARCH ERROR: ${error.message} ---`);
    return [];
  }

  return data || [];
}
