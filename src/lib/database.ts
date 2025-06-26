import { supabase, Feed, Article } from './supabase';

export const databaseService = {
  // Feed operations
  async getFeeds(): Promise<Feed[]> {
    if (!supabase) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('feeds')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching feeds:', error);
      return [];
    }
    return data || [];
  },

  async addFeed(url: string, title: string): Promise<Feed | null> {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('feeds')
      .insert({
        user_id: user.id,
        url,
        title,
        last_fetched: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding feed:', error);
      return null;
    }
    return data;
  },

  async deleteFeed(feedId: string): Promise<boolean> {
    if (!supabase) return false;
    // First delete all articles for this feed
    await supabase
      .from('articles')
      .delete()
      .eq('feed_id', feedId);

    // Then delete the feed
    const { error } = await supabase
      .from('feeds')
      .delete()
      .eq('id', feedId);

    if (error) {
      console.error('Error deleting feed:', error);
      return false;
    }
    return true;
  },

  // Article operations
  async getArticles(): Promise<Article[]> {
    if (!supabase) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('articles')
      .select(`
        *,
        feeds!inner(user_id)
      `)
      .eq('feeds.user_id', user.id)
      .order('pub_date', { ascending: false });

    if (error) {
      console.error('Error fetching articles:', error);
      return [];
    }
    return data || [];
  },

  async addArticles(articles: Omit<Article, 'id' | 'created_at'>[]): Promise<Article[]> {
    if (!supabase) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    
    const { data, error } = await supabase
      .from('articles')
      .insert(articles)
      .select();

    if (error) {
      console.error('Error adding articles:', error);
      return [];
    }
    return data || [];
  },

  async markArticleAsRead(articleId: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('articles')
      .update({ is_read: true })
      .eq('id', articleId);

    if (error) {
      console.error('Error marking article as read:', error);
      return false;
    }
    return true;
  },

  async markAllArticlesAsRead(): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('articles')
      .update({ is_read: true })
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all articles as read:', error);
      return false;
    }
    return true;
  }
}; 