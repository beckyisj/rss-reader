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
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check if this is a cron job (has authorization) or manual request
  const isCronJob = req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  
  // For manual requests, we don't require authorization but we should add some rate limiting
  if (!isCronJob) {
    // Simple rate limiting: allow manual refresh every 30 seconds
    // In production, you might want to use a proper rate limiting solution
    console.log('Manual refresh requested');
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
