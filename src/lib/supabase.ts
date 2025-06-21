import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Feed {
  id: string;
  user_id: string;
  url: string;
  title: string;
  last_fetched: string;
  created_at: string;
}

export interface Article {
  id: string;
  feed_id: string;
  title: string;
  link: string;
  description: string;
  pub_date: string;
  is_read: boolean;
  created_at: string;
} 