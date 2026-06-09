import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Check both possible environment variable names
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '').trim();

// Improved check to handle string "undefined" or "null"
const isValid = (val: string) => val && val !== 'undefined' && val !== 'null' && val.length > 10;

if (!isValid(supabaseUrl) || !isValid(supabaseAnonKey)) {
  console.error('CRITICAL: Missing or invalid Supabase environment variables.');
  console.log('URL length:', supabaseUrl.length);
  console.log('Key length:', supabaseAnonKey.length);
}

// Create client only if keys are valid
export const supabase = (isValid(supabaseUrl) && isValid(supabaseAnonKey)) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : (null as any);
