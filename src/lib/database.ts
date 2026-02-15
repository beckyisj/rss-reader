import { supabase, Feed, Article } from './supabase';

const getUserId = async (): Promise<string | null> => {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

export const databaseService = {
  // ---- Feeds ----

  async getFeeds(): Promise<Feed[]> {
    const userId = await getUserId();
    if (!userId) return [];

    const { data, error } = await supabase!
      .from('feeds')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) { console.error('Error fetching feeds:', error); return []; }
    return data || [];
  },

  async addFeed(url: string, title: string): Promise<Feed | null> {
    const userId = await getUserId();
    if (!userId) return null;

    const { data, error } = await supabase!
      .from('feeds')
      .insert({ user_id: userId, url, title, last_fetched: new Date().toISOString() })
      .select()
      .single();

    if (error) { console.error('Error adding feed:', error); return null; }
    return data;
  },

  async deleteFeed(feedId: string): Promise<boolean> {
    if (!supabase) return false;
    await supabase.from('articles').delete().eq('feed_id', feedId);
    const { error } = await supabase.from('feeds').delete().eq('id', feedId);
    if (error) { console.error('Error deleting feed:', error); return false; }
    return true;
  },

  async updateFeedColor(feedId: string, color: string | null): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('feeds')
      .update({ color })
      .eq('id', feedId);
    if (error) { console.error('Error updating feed color:', error); return false; }
    return true;
  },

  // ---- Articles ----

  async getArticles(): Promise<Article[]> {
    const userId = await getUserId();
    if (!userId) return [];

    const { data, error } = await supabase!
      .from('articles')
      .select('*, feeds!inner(user_id)')
      .eq('feeds.user_id', userId)
      .order('pub_date', { ascending: false })
      .limit(500);

    if (error) { console.error('Error fetching articles:', error); return []; }
    return data || [];
  },

  async addArticles(articles: Omit<Article, 'id' | 'created_at'>[]): Promise<Article[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('articles')
      .insert(articles)
      .select();
    if (error) { console.error('Error adding articles:', error); return []; }
    return data || [];
  },

  async markArticleAsRead(articleId: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('articles').update({ is_read: true }).eq('id', articleId);
    if (error) { console.error('Error:', error); return false; }
    return true;
  },

  async toggleReadStatus(articleId: string, currentlyRead: boolean): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('articles').update({ is_read: !currentlyRead }).eq('id', articleId);
    if (error) { console.error('Error:', error); return false; }
    return true;
  },

  async markAllAsRead(feedIds: string[], feedId?: string): Promise<boolean> {
    if (!supabase) return false;
    let query = supabase.from('articles').update({ is_read: true }).eq('is_read', false);
    if (feedId) { query = query.eq('feed_id', feedId); }
    else { query = query.in('feed_id', feedIds); }
    const { error } = await query;
    if (error) { console.error('Error:', error); return false; }
    return true;
  },

  async toggleSaved(articleId: string, currentlySaved: boolean): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('articles').update({ is_saved: !currentlySaved }).eq('id', articleId);
    if (error) { console.error('Error:', error); return false; }
    return true;
  },

  async toggleArchived(articleId: string, currentlyArchived: boolean): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('articles').update({ is_archived: !currentlyArchived }).eq('id', articleId);
    if (error) { console.error('Error:', error); return false; }
    return true;
  },
};
