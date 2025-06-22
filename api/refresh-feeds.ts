import type { VercelRequest, VercelResponse } from '@vercel/node';
import Parser from 'rss-parser';
import DOMPurify from 'dompurify';
import { createClient } from '@supabase/supabase-js';

const parser = new Parser();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function refreshFeeds() {
  const { data: feeds, error: feedsError } = await supabase.from('feeds').select('*');
  if (feedsError) throw feedsError;

  let newArticlesCount = 0;

  for (const feed of feeds) {
    try {
      const parsedFeed = await parser.parseURL(feed.url);
      if (!parsedFeed?.items) continue;

      const { data: existingArticles, error: articlesError } = await supabase
        .from('articles')
        .select('link')
        .eq('feed_id', feed.id);

      if (articlesError) {
        console.error(`Error fetching existing articles for feed ${feed.id}:`, articlesError);
        continue;
      }

      const existingLinks = new Set(existingArticles.map(a => a.link));
      
      const newArticles = parsedFeed.items
        .filter(item => item.link && !existingLinks.has(item.link))
        .slice(0, 10)
        .map(item => {
          const fullContent = item['content:encoded'] || item.content || item.contentSnippet || '';
          return {
            feed_id: feed.id,
            title: item.title,
            link: item.link,
            description: DOMPurify.sanitize(fullContent),
            pub_date: item.isoDate || item.pubDate,
            is_read: false
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

  return { newArticlesCount };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const { newArticlesCount } = await refreshFeeds();
    res.status(200).send(`Refresh complete. Added ${newArticlesCount} new articles.`);
  } catch (error: any) {
    console.error('Error in refreshFeeds handler:', error);
    res.status(500).send(`Error refreshing feeds: ${error.message}`);
  }
}
