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

    let { data, error } = await supabase!
      .from('feeds')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true, nullsFirst: false });

    // Fallback if position column doesn't exist yet
    if (error?.code === '42703') {
      ({ data, error } = await supabase!.from('feeds').select('*').eq('user_id', userId).order('created_at', { ascending: false }));
    }

    if (error) { console.error('Error fetching feeds:', error); return []; }
    return data || [];
  },

  async addFeed(url: string, title: string): Promise<Feed | null> {
    const userId = await getUserId();
    if (!userId) return null;

    // Assign next position (graceful if column doesn't exist yet)
    const insertObj: Record<string, any> = { user_id: userId, url, title, last_fetched: new Date().toISOString() };
    const { data: maxData, error: posErr } = await supabase!
      .from('feeds')
      .select('position')
      .eq('user_id', userId)
      .order('position', { ascending: false })
      .limit(1);
    if (!posErr) insertObj.position = (maxData?.[0]?.position ?? -1) + 1;

    let { data, error } = await supabase!
      .from('feeds')
      .insert(insertObj)
      .select()
      .single();

    // Retry without position if column doesn't exist
    if (error?.code === '42703') {
      delete insertObj.position;
      ({ data, error } = await supabase!.from('feeds').insert(insertObj).select().single());
    }

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

  async renameFeed(feedId: string, title: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('feeds')
      .update({ title })
      .eq('id', feedId);
    if (error) { console.error('Error renaming feed:', error); return false; }
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

  async updateFeedPositions(updates: { id: string; position: number }[]): Promise<boolean> {
    if (!supabase) return false;
    const results = await Promise.all(
      updates.map(u => supabase!.from('feeds').update({ position: u.position }).eq('id', u.id))
    );
    return results.every(r => !r.error);
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

  async batchUpdateArticles(ids: string[], updates: Partial<Pick<Article, 'is_read' | 'is_saved' | 'is_archived'>>): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('articles')
      .update(updates)
      .in('id', ids);
    if (error) { console.error('Error batch updating articles:', error); return false; }
    return true;
  },
};
