import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

let supabaseClient: ReturnType<typeof createBrowserClient> | null = null;

export const createClient = () => {
  // Only create the client if it doesn't exist and we're in a browser environment
  if (!supabaseClient && typeof window !== 'undefined') {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and key are required');
    }
    supabaseClient = createBrowserClient(supabaseUrl, supabaseKey);
  }
  
  // Return existing client or throw error if not in browser
  if (!supabaseClient) {
    throw new Error('Supabase client not available in this environment');
  }
  
  return supabaseClient;
}; 