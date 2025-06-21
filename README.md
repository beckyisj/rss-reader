# 📰 RSS Reader

A beautiful, modern RSS feed reader built with React and TypeScript. Features include feed management, article reading, and persistent storage with Supabase.

## ✨ Features

- **Feed Management**: Add and remove RSS feeds
- **Article Reading**: Clean, readable interface for articles
- **Read/Unread Tracking**: Visual indicators and filtering
- **Persistent Storage**: Data syncs across devices with Supabase
- **Responsive Design**: Works on desktop and mobile
- **Offline Fallback**: Uses localStorage when database is unavailable

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm start
```

The app will open at `http://localhost:3000`

## 🗄️ Database Setup (Optional)

For persistent storage across devices, set up Supabase:

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Get your project URL and anon key

### 2. Create Database Tables

Run these SQL commands in your Supabase SQL editor:

```sql
-- Create feeds table
CREATE TABLE feeds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  last_fetched TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create articles table
CREATE TABLE articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feed_id UUID REFERENCES feeds(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  description TEXT,
  pub_date TIMESTAMP WITH TIME ZONE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_feeds_user_id ON feeds(user_id);
CREATE INDEX idx_articles_feed_id ON articles(feed_id);
CREATE INDEX idx_articles_pub_date ON articles(pub_date);
```

### 3. Set Environment Variables

Create a `.env` file in the root directory:

```env
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Restart the Development Server
```bash
npm start
```

## 📱 Usage

### Adding RSS Feeds
1. Find the RSS feed URL (usually ends with `.xml` or `/feed`)
2. Enter the URL in the "Add Feed" input
3. Press Enter or click "Add Feed"

### Popular RSS Feeds to Try
- BBC News: `https://feeds.bbci.co.uk/news/rss.xml`
- TechCrunch: `https://feeds.feedburner.com/TechCrunch`
- CNN: `https://rss.cnn.com/rss/edition.rss`
- The Verge: `https://www.theverge.com/rss/index.xml`

### Reading Articles
- Click on any article to read it in full
- Articles are automatically marked as read
- Use "Show unread only" to filter articles

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript
- **Styling**: CSS3 with modern design
- **Database**: Supabase (PostgreSQL)
- **RSS Parsing**: RSS2JSON API
- **Storage**: LocalStorage fallback

## 📦 Deployment

### Deploy to Vercel (Recommended)
1. Push your code to GitHub
2. Connect your repo to [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy!

### Deploy to Netlify
1. Push your code to GitHub
2. Connect your repo to [Netlify](https://netlify.com)
3. Add environment variables in Netlify dashboard
4. Deploy!

## 🔧 Customization

### Adding New Features
- **Email Capture**: Integrate with SendGrid for newsletter emails
- **Categories**: Add feed organization
- **Search**: Implement article search
- **Sharing**: Add social sharing buttons
- **Offline Reading**: Cache articles for offline access

### Styling
Modify `src/components/RSSReader.css` to customize the appearance.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🆘 Support

If you encounter any issues:
1. Check the browser console for errors
2. Ensure your RSS feed URLs are valid
3. Verify Supabase connection if using database features
4. Try refreshing the page

---

Built with ❤️ for reading the web
