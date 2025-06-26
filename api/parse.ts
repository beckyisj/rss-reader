import type { VercelRequest, VercelResponse } from '@vercel/node';
import Parser from 'rss-parser';

const parser = new Parser();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    const feed = await parser.parseURL(url);
    // Send the entire feed object back to the frontend
    res.status(200).json(feed);
  } catch (error: any) {
    console.error(`Failed to parse feed from URL: ${url}`, error);
    res.status(500).json({ error: `Failed to parse feed: ${error.message}` });
  }
} 