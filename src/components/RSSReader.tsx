import React, { useState, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import './RSSReader.css';
import { databaseService } from '../lib/database';
import { supabase, isSupabaseConfigured, Feed, Article } from '../lib/supabase';

interface RSSReaderProps {
  session: Session;
}

const RSSReader: React.FC<RSSReaderProps> = ({ session }) => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [feedsData, articlesData] = await Promise.all([
        databaseService.getFeeds(),
        databaseService.getArticles()
      ]);
      setFeeds(feedsData);
      setArticles(articlesData);
    } catch (error) {
      console.error('Error loading data:', error);
      // Fallback to localStorage if database is not available
      loadFromLocalStorage();
    }
  }, []);

  const loadFromLocalStorage = () => {
    const savedFeeds = localStorage.getItem('rss-feeds');
    const savedArticles = localStorage.getItem('rss-articles');
    if (savedFeeds) {
      setFeeds(JSON.parse(savedFeeds));
    }
    if (savedArticles) {
      setArticles(JSON.parse(savedArticles));
    }
  };

  // Load feeds and articles from database on component mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  const autoDiscoverFeed = async (url: string): Promise<string | null> => {
    let fullUrl = url.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = `https://${fullUrl}`;
    }

    // 1. Check for direct feed links first
    if (fullUrl.match(/\/(feed|rss|atom)\.xml$/) || fullUrl.match(/\/feed\/?$/)) {
      return fullUrl;
    }

    // 2. Simple rules for common platforms
    if (fullUrl.includes('substack.com')) {
      return new URL('/feed', fullUrl).toString();
    }
    if (fullUrl.includes('medium.com')) {
      // Handles medium.com/@user and medium.com/publication
      const path = new URL(fullUrl).pathname;
      return new URL(`/feed${path}`, fullUrl).toString();
    }
    if (fullUrl.includes('blogspot.com')) {
      return new URL('/feeds/posts/default', fullUrl).toString();
    }

    // 3. Fallback to the universal scraper
    try {
      const response = await fetch(`/api/discover?url=${encodeURIComponent(fullUrl)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to discover feed.');
      }
      return data.feedUrl;
    } catch (error) {
      console.error(error);
      alert("Sorry, we couldn't automatically find a feed for this site. Please find the exact RSS link and paste it here.");
      return null;
    }
  };

  const addFeed = async () => {
    if (!newFeedUrl.trim()) return;

    setIsDiscovering(true);
    setLoading(true);

    try {
      const discoveredUrl = await autoDiscoverFeed(newFeedUrl);

      if (!discoveredUrl) {
        // Error is handled inside autoDiscoverFeed for now
        return;
      }

      // Determine the API base URL
      const apiBaseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://rss-reader-steel.vercel.app' 
        : '';

      // Fetch RSS feed data using our own parsing API
      const response = await fetch(`${apiBaseUrl}/api/parse?url=${encodeURIComponent(discoveredUrl)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to parse feed');
      }

      if (data) {
        let newFeed: Feed;
        const feedTitle = data.title || 'Unknown Feed';

        if (isSupabaseConfigured) {
          // Save to database
          const savedFeed = await databaseService.addFeed(discoveredUrl, feedTitle);
          if (!savedFeed) throw new Error('Failed to save feed to database');
          newFeed = savedFeed;
          setFeeds(prev => [newFeed, ...prev]);
        } else {
          // Fallback to localStorage
          newFeed = {
            id: Date.now().toString(),
            user_id: 'demo-user-123',
            url: discoveredUrl,
            title: feedTitle,
            last_fetched: new Date().toISOString(),
            created_at: new Date().toISOString()
          };
          const updatedFeeds = [...feeds, newFeed];
          setFeeds(updatedFeeds);
          localStorage.setItem('rss-feeds', JSON.stringify(updatedFeeds));
        }

        // Add articles from the new feed
        const newArticles: Omit<Article, 'id' | 'created_at'>[] = data.items.map((item: any) => ({
          feed_id: newFeed.id,
          title: item.title,
          link: item.link,
          // Use 'content' for full content, fallback to 'contentSnippet'
          description: item.content || item.contentSnippet || '',
          pub_date: item.isoDate || item.pubDate,
          is_read: false
        }));

        if (isSupabaseConfigured) {
          // Save articles to database
          const savedArticles = await databaseService.addArticles(newArticles);
          setArticles(prev => [...savedArticles, ...prev]);
        } else {
          // Fallback to localStorage
          const articlesWithIds = newArticles.map((article, index) => ({
            ...article,
            id: `${newFeed.id}-${index}`,
            created_at: new Date().toISOString()
          }));
          const updatedArticles = [...articlesWithIds, ...articles];
          setArticles(updatedArticles);
          localStorage.setItem('rss-articles', JSON.stringify(updatedArticles));
        }

        setNewFeedUrl('');
      } else {
        alert('Failed to fetch RSS feed. Please check the URL.');
      }
    } catch (error: any) {
      console.error('Error adding feed:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsDiscovering(false);
      setLoading(false);
    }
  };

  const removeFeed = async (feedId: string) => {
    if (isSupabaseConfigured) {
      const success = await databaseService.deleteFeed(feedId);
      if (success) {
        setFeeds(prev => prev.filter(feed => feed.id !== feedId));
        setArticles(prev => prev.filter(article => article.feed_id !== feedId));
      }
    } else {
      // Fallback to localStorage
      const updatedFeeds = feeds.filter(feed => feed.id !== feedId);
      const updatedArticles = articles.filter(article => !article.id.startsWith(feedId));
      setFeeds(updatedFeeds);
      setArticles(updatedArticles);
      localStorage.setItem('rss-feeds', JSON.stringify(updatedFeeds));
      localStorage.setItem('rss-articles', JSON.stringify(updatedArticles));
    }
  };

  const markAsRead = async (articleId: string) => {
    if (isSupabaseConfigured) {
      await databaseService.markArticleAsRead(articleId);
    }
    
    setArticles(prev => 
      prev.map(article => 
        article.id === articleId ? { ...article, is_read: true } : article
      )
    );
  };

  const filteredArticles = showUnreadOnly 
    ? articles.filter(article => !article.is_read)
    : articles;

  const sortedArticles = filteredArticles.sort((a, b) => 
    new Date(b.pub_date).getTime() - new Date(a.pub_date).getTime()
  );

  return (
    <div className="rss-reader">
      <div className="sidebar">
        <div className="feed-management">
          <h3>📡 Feeds</h3>
          <div className="db-status">
            {isSupabaseConfigured ? '☁️ Synced' : '⚠️ Local'}
          </div>
          {!isSupabaseConfigured && (
            <div className="db-warning">
              ⚠️ Using local storage (data won't sync across devices)
            </div>
          )}
          <div className="add-feed">
            <input
              type="text"
              placeholder="Enter website or feed URL..."
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addFeed()}
            />
            <button onClick={addFeed} disabled={loading}>
              {isDiscovering ? 'Finding Feed...' : (loading ? 'Adding...' : 'Add Feed')}
            </button>
          </div>
          
          <div className="feeds-list">
            {feeds.map(feed => (
              <div key={feed.id} className="feed-item">
                <span className="feed-title">{feed.title}</span>
                <button 
                  onClick={() => removeFeed(feed.id)}
                  className="remove-feed"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="filters">
          <label>
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={(e) => setShowUnreadOnly(e.target.checked)}
            />
            Show unread only
          </label>
        </div>

        <div className="user-profile">
          <p>Signed in as: <strong>{session.user.email}</strong></p>
          <button onClick={() => supabase!.auth.signOut()}>Sign Out</button>
        </div>
      </div>

      <div className="main-content">
        <div className="articles-list">
          <h3>📰 Articles ({filteredArticles.length})</h3>
          {sortedArticles.map(article => (
            <div 
              key={article.id} 
              className={`article-item ${article.is_read ? 'read' : 'unread'}`}
              onClick={() => {
                setSelectedArticle(article);
                markAsRead(article.id);
              }}
            >
              <h4>{article.title}</h4>
              <p className="article-meta">
                <span className="feed-name">
                  {feeds.find(f => f.id === article.feed_id)?.title || 'Unknown Feed'}
                </span>
                <span className="pub-date">
                  {new Date(article.pub_date).toLocaleDateString()}
                </span>
              </p>
              <p className="article-excerpt">
                {article.description.replace(/<[^>]*>/g, '').substring(0, 150)}...
              </p>
            </div>
          ))}
        </div>

        {selectedArticle && (
          <div className="article-view">
            <div className="article-header">
              <h2>{selectedArticle.title}</h2>
              <p className="article-meta">
                <span className="feed-name">
                  {feeds.find(f => f.id === selectedArticle.feed_id)?.title || 'Unknown Feed'}
                </span>
                <span className="pub-date">
                  {new Date(selectedArticle.pub_date).toLocaleDateString()}
                </span>
              </p>
            </div>
            <div 
              className="article-content"
              dangerouslySetInnerHTML={{ __html: selectedArticle.description }}
            />
            <a 
              href={selectedArticle.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="read-more"
            >
              Read full article →
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default RSSReader; 