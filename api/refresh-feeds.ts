import type { VercelRequest, VercelResponse } from '@vercel/node';
import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';

const parser = new Parser();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function normalizeLink(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch { return url; }
}

async function refreshFeeds() {
  const { data: feeds, error: feedsError } = await supabase.from('feeds').select('*');
  if (feedsError) throw feedsError;

  let newArticlesCount = 0;

  for (const feed of feeds) {
    try {
      const parsedFeed = await parser.parseURL(feed.url);
      if (!parsedFeed?.items) continue;

      // Fetch existing articles for dedup — check both link AND title
      const { data: existingArticles, error: articlesError } = await supabase
        .from('articles')
        .select('link, title')
        .eq('feed_id', feed.id);

      if (articlesError) {
        console.error(`Error fetching existing articles for feed ${feed.id}:`, articlesError);
        continue;
      }

      const existingLinks = new Set(existingArticles.map(a => normalizeLink(a.link)));
      const existingTitles = new Set(existingArticles.map(a => a.title));

      // Only import articles newer than our most recent one (prevents importing old backlog)
      const { data: latestArticle } = await supabase
        .from('articles')
        .select('pub_date')
        .eq('feed_id', feed.id)
        .order('pub_date', { ascending: false })
        .limit(1);
      const cutoff = latestArticle?.[0]?.pub_date ? new Date(latestArticle[0].pub_date) : null;

      const newArticles = parsedFeed.items
        .filter(item => {
          if (!item.link) return false;
          // Skip if normalized link match (strips query params/hashes)
          if (existingLinks.has(normalizeLink(item.link))) return false;
          // Skip if same title exists for this feed
          if (item.title && existingTitles.has(item.title)) return false;
          // Skip if older than our newest existing article
          const itemDate = item.isoDate || item.pubDate;
          if (cutoff && itemDate && new Date(itemDate) <= cutoff) return false;
          return true;
        })
        .slice(0, 10)
        .map(item => {
          const fullContent = item['content:encoded'] || item.content || item.contentSnippet || '';
          return {
            feed_id: feed.id,
            title: item.title,
            link: item.link,
            description: fullContent,
            pub_date: item.isoDate || item.pubDate,
            is_read: false,
          };
        });

      if (newArticles.length > 0) {
        const { error: insertError } = await supabase.from('articles').insert(newArticles);
        if (insertError) {
          console.error(`Error inserting new articles for feed ${feed.id}:`, insertError);
        } else {
          newArticlesCount += newArticles.length;
        }
      }

      await supabase.from('feeds').update({ last_fetched: new Date().toISOString() }).eq('id', feed.id);

    } catch (parseError) {
      console.error(`Failed to parse or process feed ${feed.url}:`, parseError);
    }
  }

  // ---- Auto-prune: delete read, non-saved articles older than 90 days ----
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error: pruneError, count: pruneCount } = await supabase
    .from('articles')
    .delete({ count: 'exact' })
    .eq('is_read', true)
    .eq('is_saved', false)
    .lt('pub_date', ninetyDaysAgo);

  if (pruneError) {
    console.error('Error pruning old articles:', pruneError);
  } else if (pruneCount && pruneCount > 0) {
    console.log(`Pruned ${pruneCount} old articles`);
  }

  return { newArticlesCount };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { newArticlesCount } = await refreshFeeds();
    const message = `Refresh complete. Added ${newArticlesCount} new articles.`;
    console.log(message);
    res.status(200).send(message);
  } catch (error: any) {
    console.error('Error in refreshFeeds handler:', error);
    res.status(500).send(`Error refreshing feeds: ${error.message}`);
  }
}
