import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase is not configured. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY environment variables.');
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export interface Feed {
  id: string;
  user_id: string;
  url: string;
  title: string;
  color: string | null;
  position: number | null;
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
  is_saved: boolean;
  is_archived: boolean;
  created_at: string;
}

export const FEED_COLORS = [
  '#c67b4e', // terracotta
  '#d4564e', // coral
  '#e09040', // amber
  '#5ba368', // sage
  '#4a90a4', // teal
  '#6b7db3', // slate blue
  '#9b6ba3', // plum
  '#c47a98', // rose
];
