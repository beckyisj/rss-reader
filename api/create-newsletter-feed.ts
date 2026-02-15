import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title } = req.body;
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const response = await fetch('https://kill-the-newsletter.com/feeds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: `title=${encodeURIComponent(title.trim())}`,
    });

    if (!response.ok) {
      throw new Error(`Kill the Newsletter returned ${response.status}`);
    }

    const data = await response.json();
    // data = { feedId, email, feed }
    res.status(200).json({
      email: data.email,
      feedUrl: data.feed,
      feedId: data.feedId,
    });
  } catch (error: any) {
    console.error('Error creating newsletter feed:', error);
    res.status(500).json({ error: `Failed to create newsletter feed: ${error.message}` });
  }
}
