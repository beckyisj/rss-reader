import type { VercelRequest, VercelResponse } from '@vercel/node';
import Parser from 'rss-parser';

const parser = new Parser();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;

  if (typeof url !== 'string') {
    return res.status(400).send('URL parameter is required');
  }

  try {
    const feed = await parser.parseURL(url);
    // Send the entire feed object back to the frontend
    res.status(200).json(feed);
  } catch (error: any) {
    console.error(`Failed to parse feed from URL: ${url}`, error);
    res.status(500).send(`Failed to parse feed: ${error.message}`);
  }
} 