import type { VercelRequest, VercelResponse } from '@vercel/node';
import { formidable } from 'formidable';
import { simpleParser } from 'mailparser';
import { supabase } from './src/lib/supabase';
import { databaseService } from './src/lib/database';

// Disable Vercel's default body parser so we can use formidable
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const form = formidable({});
    const [fields, files] = await form.parse(req);

    const rawEmail = fields.email?.[0] || files.email?.[0]?.filepath;

    if (!rawEmail) {
      console.error('No email content found in webhook payload');
      return res.status(400).send('No email content found');
    }

    const parsedEmail = await simpleParser(rawEmail);
    const toAddress = (parsedEmail.to as any)?.value[0]?.address;

    if (!toAddress) {
      console.error('Could not determine recipient from email');
      return res.status(400).send('Could not determine recipient');
    }
    
    // This is where you'd look up the user by the secret part of the email
    // For now, we'll assume we found a user and add it to their articles
    // TODO: Implement logic to extract user identifier from `toAddress`
    
    const { data: { user } } = await supabase!.auth.getUser(); // In a real scenario, you'd look up user by email alias
    
    if (!user) {
        console.error('Could not find user for email address:', toAddress);
        return res.status(404).send('User not found');
    }

    const newArticle = {
      // In a real app, you'd associate this with a "Newsletters" feed
      feed_id: 'UUID_OF_A_GENERIC_NEWSLETTER_FEED', // TODO: Implement generic feed
      title: parsedEmail.subject || 'Untitled Newsletter',
      link: parsedEmail.messageId || `urn:uuid:${crypto.randomUUID()}`,
      description: parsedEmail.html || parsedEmail.textAsHtml || '',
      pub_date: parsedEmail.date?.toISOString() || new Date().toISOString(),
      is_read: false,
    };

    const added = await databaseService.addArticles([newArticle]);

    if (!added || added.length === 0) {
        console.error('Failed to save newsletter as article');
        return res.status(500).send('Failed to save article');
    }

    console.log(`Successfully processed newsletter: "${newArticle.title}" for user ${user.id}`);
    res.status(200).send('Email processed successfully');

  } catch (error: any) {
    console.error('Error processing email webhook:', error);
    res.status(500).send(`Error processing email: ${error.message}`);
  }
} 