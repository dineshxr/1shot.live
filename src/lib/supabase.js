// Supabase client initialization
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabaseClient = () => {
  const supabaseUrl = window.PUBLIC_ENV.supabaseUrl;
  const supabaseKey = window.PUBLIC_ENV.supabaseKey;
  
  return createClient(supabaseUrl, supabaseKey);
};
