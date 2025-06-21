import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as cheerio from 'cheerio';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;

  if (typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    // Look for standard RSS/Atom link tags
    const rssLink =
      $('link[type="application/rss+xml"]').attr('href') ||
      $('link[type="application/atom+xml"]').attr('href');

    if (rssLink) {
      // If the found link is relative (e.g., /feed.xml), make it absolute
      const absoluteUrl = new URL(rssLink, url).toString();
      return res.status(200).json({ feedUrl: absoluteUrl });
    }

    return res.status(404).json({ error: 'No RSS feed link found on the page.' });

  } catch (error: any) {
    console.error(`Failed to discover feed for URL: ${url}`, error);
    return res.status(500).json({ error: `Failed to process URL: ${error.message}` });
  }
} 