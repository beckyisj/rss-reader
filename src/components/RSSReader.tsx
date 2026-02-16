import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import DOMPurify from 'dompurify';
import './RSSReader.css';
import { databaseService } from '../lib/database';
import { supabase, isSupabaseConfigured, Feed, Article, FEED_COLORS } from '../lib/supabase';

const PAGE_SIZE = 30;
const STALE_HOURS = 48;

function readingTime(html: string): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(w => w.length > 0).length;
  const mins = Math.max(1, Math.round(words / 230));
  return `${mins} min read`;
}

function getFaviconUrl(feedUrl: string): string {
  try {
    const domain = new URL(feedUrl).hostname;
    return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
  } catch { return ''; }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

function isFeedStale(feed: Feed): boolean {
  return Date.now() - new Date(feed.last_fetched).getTime() > STALE_HOURS * 60 * 60 * 1000;
}

interface RSSReaderProps {
  session: Session;
}

type AddMode = 'feed' | 'newsletter';

const RSSReader: React.FC<RSSReaderProps> = ({ session }) => {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortOrder, setSortOrder] = useState<'alphabetical' | 'recent'>('alphabetical');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [addMode, setAddMode] = useState<AddMode>('feed');
  const [overflowFeedId, setOverflowFeedId] = useState<string | null>(null);
  const [overflowPos, setOverflowPos] = useState<{ top: number; left: number } | null>(null);
  const [confirmDeleteFeedId, setConfirmDeleteFeedId] = useState<string | null>(null);
  const [renamingFeedId, setRenamingFeedId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [articleListWidth, setArticleListWidth] = useState(360);
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>(() => {
    return (localStorage.getItem('rss-font-size') as any) || 'medium';
  });
  const [tutorialStep, setTutorialStep] = useState(() => {
    if (new URLSearchParams(window.location.search).has('tutorial')) {
      localStorage.removeItem('rss-tutorial-done');
      window.history.replaceState({}, '', window.location.pathname);
      return 0;
    }
    return localStorage.getItem('rss-tutorial-done') ? -1 : 0;
  });

  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resizingRef = useRef<'sidebar' | 'articles' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const isProcessingRef = useRef(false);
  const hasAutoRefreshed = useRef(false);
  const feedsRef = useRef<Feed[]>([]);
  const visibleArticlesRef = useRef<Article[]>([]);
  const activeIndexRef = useRef(-1);
  const selectedArticleRef = useRef<Article | null>(null);
  const articleListRef = useRef<HTMLDivElement>(null);
  const articleViewRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const opmlInputRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<{ markAsRead: (id: string) => void; toggleSaved: (id: string) => void; toggleArchived: (id: string) => void; toggleReadStatus: (id: string) => void }>({ markAsRead: () => {}, toggleSaved: () => {}, toggleArchived: () => {}, toggleReadStatus: () => {} });
  const tutorialArticleRef = useRef<string | null>(null);

  feedsRef.current = feeds;
  activeIndexRef.current = activeIndex;
  selectedArticleRef.current = selectedArticle;

  // ---- Scroll to top when opening an article ----
  useEffect(() => {
    if (selectedArticle && articleViewRef.current) {
      articleViewRef.current.scrollTo(0, 0);
    }
    setReadingProgress(0);
  }, [selectedArticle]);

  // ---- Reading progress ----
  useEffect(() => {
    const el = articleViewRef.current;
    if (!el || !selectedArticle) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) { setReadingProgress(100); return; }
      setReadingProgress(Math.round((scrollTop / (scrollHeight - clientHeight)) * 100));
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [selectedArticle]);

  // ---- Helpers ----

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    notificationTimeoutRef.current = setTimeout(() => setNotification(null), 3000);
  }, []);

  const getFeedColor = (feedId: string): string | null => {
    return feeds.find(f => f.id === feedId)?.color || null;
  };

  // ---- Data loading ----

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
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { return () => { if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current); }; }, []);

  // ---- Auto-refresh on mount ----

  useEffect(() => {
    if (hasAutoRefreshed.current || feeds.length === 0 || !isSupabaseConfigured) return;
    const mostRecentFetch = Math.max(...feeds.map(f => new Date(f.last_fetched).getTime()));
    if (Date.now() - mostRecentFetch < 60 * 60 * 1000) return;
    hasAutoRefreshed.current = true;
    fetch('/api/refresh-feeds', { method: 'POST' })
      .then(() => databaseService.getArticles())
      .then(updated => { setArticles(updated); showNotification('Feeds refreshed with new articles'); })
      .catch(() => {});
  }, [feeds, showNotification]);

  // ---- Supabase Realtime ----

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel('articles-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'articles' }, (payload) => {
        const newArticle = payload.new as Article;
        if (feedsRef.current.some(f => f.id === newArticle.feed_id)) {
          setArticles(prev => prev.some(a => a.id === newArticle.id) ? prev : [newArticle, ...prev]);
        }
      })
      .subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, []);

  // ---- Close overflow menu on outside click ----

  useEffect(() => {
    if (!overflowFeedId) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowFeedId(null);
        setConfirmDeleteFeedId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowFeedId]);

  // ---- Resizable panels ----

  const startResize = (panel: 'sidebar' | 'articles', e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = panel;
    startXRef.current = e.clientX;
    startWidthRef.current = panel === 'sidebar' ? sidebarWidth : articleListWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - startXRef.current;
      if (resizingRef.current === 'sidebar') {
        setSidebarWidth(Math.max(180, Math.min(400, startWidthRef.current + delta)));
      } else {
        setArticleListWidth(Math.max(220, Math.min(600, startWidthRef.current + delta)));
      }
    };
    const onUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  // ---- Keyboard shortcuts ----

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (document.querySelector('.tutorial-overlay') || document.querySelector('.shortcuts-overlay')) return;
      const visible = visibleArticlesRef.current;
      switch (e.key) {
        case 'j': case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(i => { const n = Math.min(i + 1, visible.length - 1); scrollArticleIntoView(n); return n; });
          break;
        case 'k': case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(i => { const n = Math.max(i - 1, 0); scrollArticleIntoView(n); return n; });
          break;
        case 'Enter': case 'o': {
          e.preventDefault();
          const idx = activeIndexRef.current;
          if (idx >= 0 && idx < visible.length) { const a = visible[idx]; setSelectedArticle(a); actionsRef.current.markAsRead(a.id); }
          break;
        }
        case 'Escape':
          if (selectedArticleRef.current) { e.preventDefault(); setSelectedArticle(null); }
          break;
        case 's': {
          e.preventDefault();
          const art = selectedArticleRef.current;
          if (art) actionsRef.current.toggleSaved(art.id);
          else { const idx = activeIndexRef.current; if (idx >= 0 && idx < visible.length) actionsRef.current.toggleSaved(visible[idx].id); }
          break;
        }
        case 'e': {
          e.preventDefault();
          const art = selectedArticleRef.current;
          if (art) actionsRef.current.toggleArchived(art.id);
          else { const idx = activeIndexRef.current; if (idx >= 0 && idx < visible.length) actionsRef.current.toggleArchived(visible[idx].id); }
          break;
        }
        case 'u': {
          e.preventDefault();
          const art = selectedArticleRef.current;
          if (art) actionsRef.current.toggleReadStatus(art.id);
          else { const idx = activeIndexRef.current; if (idx >= 0 && idx < visible.length) actionsRef.current.toggleReadStatus(visible[idx].id); }
          break;
        }
        case '?':
          e.preventDefault();
          setShowShortcuts(s => !s);
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollArticleIntoView = (index: number) => {
    const list = articleListRef.current;
    if (!list) return;
    const items = list.querySelectorAll('.article-item');
    if (items[index]) items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // ---- Feed operations ----

  const autoDiscoverFeed = async (url: string): Promise<string | null> => {
    let fullUrl = url.trim();
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) fullUrl = `https://${fullUrl}`;
    if (fullUrl.match(/\.xml$/) || fullUrl.match(/\/feed\/?$/) || fullUrl.match(/\/rss\/?$/) || fullUrl.match(/\/atom\/?$/)) return fullUrl;
    if (fullUrl.includes('substack.com')) return new URL('/feed', fullUrl).toString();
    if (fullUrl.includes('medium.com')) { const path = new URL(fullUrl).pathname; return new URL(`/feed${path}`, fullUrl).toString(); }
    if (fullUrl.includes('blogspot.com')) return new URL('/feeds/posts/default', fullUrl).toString();
    try {
      const response = await fetch(`/api/discover?url=${encodeURIComponent(fullUrl)}`);
      if (!response.ok) { const d = await response.json().catch(() => ({ error: 'Unknown error' })); throw new Error(d.error || `HTTP ${response.status}`); }
      return (await response.json()).feedUrl;
    } catch (error) {
      showNotification(error instanceof TypeError && error.message.includes('fetch') ? 'Network error — check your connection' : 'Could not find a feed. Try the RSS URL directly.');
      return null;
    }
  };

  const addFeed = async () => {
    if (!newFeedUrl.trim() || isProcessingRef.current) return;
    isProcessingRef.current = true; setIsDiscovering(true); setLoading(true);
    try {
      const discoveredUrl = await autoDiscoverFeed(newFeedUrl);
      if (!discoveredUrl) return;
      const response = await fetch(`/api/parse?url=${encodeURIComponent(discoveredUrl)}`);
      if (!response.ok) { const d = await response.json().catch(() => ({ message: 'Unknown error' })); throw new Error(d.message || `HTTP ${response.status}`); }
      const data = await response.json();
      if (!data) throw new Error('No data returned');
      const feedTitle = data.title || 'Unknown Feed';
      const savedFeed = await databaseService.addFeed(discoveredUrl, feedTitle);
      if (!savedFeed) throw new Error('Failed to save feed');
      setFeeds(prev => [savedFeed, ...prev]);
      const newArticles: Omit<Article, 'id' | 'created_at'>[] = data.items.slice(0, 5).map((item: any) => ({
        feed_id: savedFeed.id, title: item.title, link: item.link,
        description: item['content:encoded'] || item.content || item.contentSnippet || '',
        pub_date: item.isoDate || item.pubDate, is_read: false, is_saved: false, is_archived: false,
      }));
      const savedArticles = await databaseService.addArticles(newArticles);
      setArticles(prev => [...savedArticles, ...prev]);
      setNewFeedUrl('');
      showNotification(`Added ${feedTitle} with ${savedArticles.length} articles`);
    } catch (error: any) { showNotification(`Error: ${error.message}`); }
    finally { setIsDiscovering(false); setLoading(false); isProcessingRef.current = false; }
  };


  const removeFeed = async (feedId: string) => {
    const success = await databaseService.deleteFeed(feedId);
    if (success) {
      setFeeds(prev => prev.filter(f => f.id !== feedId));
      setArticles(prev => prev.filter(a => a.feed_id !== feedId));
      if (selectedFeedId === feedId) setSelectedFeedId(null);
      setOverflowFeedId(null);
      setConfirmDeleteFeedId(null);
      showNotification('Feed removed');
    }
  };

  const setFeedColor = async (feedId: string, color: string | null) => {
    const success = await databaseService.updateFeedColor(feedId, color);
    if (success) {
      setFeeds(prev => prev.map(f => f.id === feedId ? { ...f, color } : f));
      setOverflowFeedId(null);
    }
  };

  const renameFeed = async (feedId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) { setRenamingFeedId(null); return; }
    const success = await databaseService.renameFeed(feedId, trimmed);
    if (success) {
      setFeeds(prev => prev.map(f => f.id === feedId ? { ...f, title: trimmed } : f));
      showNotification('Feed renamed');
    }
    setRenamingFeedId(null);
  };

  // ---- OPML import ----

  const importOpml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const outlines = doc.querySelectorAll('outline[xmlUrl]');
      if (outlines.length === 0) { showNotification('No feeds found in OPML file'); return; }

      let added = 0;
      for (const outline of Array.from(outlines)) {
        const url = outline.getAttribute('xmlUrl');
        const title = outline.getAttribute('text') || outline.getAttribute('title') || 'Unknown Feed';
        if (!url) continue;
        const savedFeed = await databaseService.addFeed(url, title);
        if (savedFeed) {
          setFeeds(prev => [savedFeed, ...prev]);
          added++;
        }
      }

      showNotification(`Imported ${added} feed${added !== 1 ? 's' : ''}. Refreshing...`);

      // Trigger a refresh to fetch initial articles for imported feeds
      fetch('/api/refresh-feeds', { method: 'POST' })
        .then(() => databaseService.getArticles())
        .then(updated => { setArticles(updated); showNotification(`${added} feeds imported with articles`); })
        .catch(() => {});
    } catch (error) {
      showNotification('Failed to parse OPML file');
    }
    // Reset file input so the same file can be re-selected
    if (opmlInputRef.current) opmlInputRef.current.value = '';
  };

  // ---- Article operations ----

  const markAsRead = async (articleId: string) => {
    await databaseService.markArticleAsRead(articleId);
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, is_read: true } : a));
  };

  const toggleReadStatus = async (articleId: string) => {
    const article = articles.find(a => a.id === articleId);
    if (!article) return;
    const success = await databaseService.toggleReadStatus(articleId, article.is_read);
    if (success) {
      const updated = { ...article, is_read: !article.is_read };
      setArticles(prev => prev.map(a => a.id === articleId ? updated : a));
      if (selectedArticle?.id === articleId) setSelectedArticle(updated);
      showNotification(updated.is_read ? 'Marked as read' : 'Marked as unread');
    }
  };

  const markAllAsRead = async () => {
    const feedIds = feeds.map(f => f.id);
    const success = await databaseService.markAllAsRead(feedIds, selectedFeedId || undefined);
    if (success) {
      setArticles(prev => prev.map(a => {
        if (selectedFeedId && a.feed_id !== selectedFeedId) return a;
        return { ...a, is_read: true };
      }));
      showNotification(selectedFeedId ? 'Marked feed as read' : 'Marked all as read');
    }
  };

  const toggleSaved = async (articleId: string) => {
    const article = articles.find(a => a.id === articleId);
    if (!article) return;
    const success = await databaseService.toggleSaved(articleId, !!article.is_saved);
    if (success) {
      const updated = { ...article, is_saved: !article.is_saved };
      setArticles(prev => prev.map(a => a.id === articleId ? updated : a));
      if (selectedArticle?.id === articleId) setSelectedArticle(updated);
      showNotification(updated.is_saved ? 'Saved' : 'Unsaved');
    }
  };

  const toggleArchived = async (articleId: string) => {
    const article = articles.find(a => a.id === articleId);
    if (!article) return;
    const success = await databaseService.toggleArchived(articleId, !!article.is_archived);
    if (success) {
      const updated = { ...article, is_archived: !article.is_archived };
      setArticles(prev => prev.map(a => a.id === articleId ? updated : a));
      if (selectedArticle?.id === articleId) setSelectedArticle(null);
      showNotification(updated.is_archived ? 'Archived' : 'Unarchived');
    }
  };

  const refreshFeeds = async () => {
    if (isRefreshing || !isSupabaseConfigured) return;
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/refresh-feeds', { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const [updatedFeeds, updatedArticles] = await Promise.all([
        databaseService.getFeeds(),
        databaseService.getArticles(),
      ]);
      setFeeds(updatedFeeds);
      setArticles(updatedArticles);
      showNotification('Feeds refreshed');
    } catch (error: any) {
      showNotification('Failed to refresh feeds');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Keep actionsRef in sync so keyboard handler always has latest closures
  actionsRef.current = { markAsRead, toggleSaved, toggleArchived, toggleReadStatus };

  // ---- Computed values ----

  const unreadCounts: Record<string, number> = {};
  let totalUnread = 0;
  articles.forEach(a => {
    if (!a.is_read && !a.is_archived) {
      unreadCounts[a.feed_id] = (unreadCounts[a.feed_id] || 0) + 1;
      totalUnread++;
    }
  });

  const getMostRecentPubDate = (feedId: string) => {
    const fa = articles.filter(a => a.feed_id === feedId);
    return fa.length === 0 ? 0 : Math.max(...fa.map(a => new Date(a.pub_date).getTime()));
  };

  const sortedFeeds = [...feeds].sort((a, b) =>
    sortOrder === 'alphabetical' ? a.title.localeCompare(b.title) : getMostRecentPubDate(b.id) - getMostRecentPubDate(a.id)
  );

  const filteredArticles = articles
    .filter(a => !selectedFeedId || a.feed_id === selectedFeedId)
    .filter(a => showArchived ? a.is_archived : !a.is_archived)
    .filter(a => !showUnreadOnly || !a.is_read)
    .filter(a => !showSavedOnly || a.is_saved)
    .filter(a => !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => new Date(b.pub_date).getTime() - new Date(a.pub_date).getTime());

  const visibleArticles = filteredArticles.slice(0, visibleCount);
  const hasMore = visibleCount < filteredArticles.length;
  visibleArticlesRef.current = visibleArticles;

  useEffect(() => { setActiveIndex(-1); setVisibleCount(PAGE_SIZE); }, [selectedFeedId, showUnreadOnly, showSavedOnly, showArchived]);

  // ---- Render ----

  return (
    <div className={`rss-reader ${selectedArticle ? 'article-view-active' : ''}`}>
      {notification && <div className="notification-popup">{notification}</div>}
      <input ref={opmlInputRef} type="file" accept=".opml,.xml" style={{ display: 'none' }} onChange={importOpml} />

      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
            <div className="shortcuts-title">
              <h3>Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)}>&times;</button>
            </div>
            <div className="shortcut-row"><div className="shortcut-keys"><kbd>j</kbd> <kbd>k</kbd></div><span>Navigate articles</span></div>
            <div className="shortcut-row"><div className="shortcut-keys"><kbd>o</kbd></div><span>Open article</span></div>
            <div className="shortcut-row"><div className="shortcut-keys"><kbd>Esc</kbd></div><span>Close article</span></div>
            <div className="shortcut-row"><div className="shortcut-keys"><kbd>s</kbd></div><span>Save / unsave</span></div>
            <div className="shortcut-row"><div className="shortcut-keys"><kbd>e</kbd></div><span>Archive / unarchive</span></div>
            <div className="shortcut-row"><div className="shortcut-keys"><kbd>u</kbd></div><span>Toggle read / unread</span></div>
            <div className="shortcut-row"><div className="shortcut-keys"><kbd>?</kbd></div><span>Show this menu</span></div>
            <hr className="shortcuts-divider" />
            <button className="replay-tutorial-btn" onClick={() => { setShowShortcuts(false); localStorage.removeItem('rss-tutorial-done'); setTutorialStep(0); }}>Replay tutorial</button>
          </div>
        </div>
      )}

      {tutorialStep >= 0 && (() => {
        const steps: { title: string; body: string; target: string; prefer: 'above' | 'below' | 'right' | 'none' }[] = [
          {
            title: 'Hey Love 💕',
            body: 'Becky gave this RSS Reader a zhuzh.\nLet me walk you through some new things!',
            target: '', prefer: 'none',
          },
          {
            title: 'Search',
            body: 'Quickly find any article by typing in the search bar. It filters as you type!',
            target: '.search-bar', prefer: 'below',
          },
          {
            title: 'Filter Tabs',
            body: 'Slide between All, Unread, and Saved to quickly filter your articles.',
            target: '.filter-tabs', prefer: 'below',
          },
          {
            title: 'Feed Icons & Unread Counts',
            body: 'Each feed now has its own icon so you can spot them at a glance. Plus unread counts so you know exactly what\'s new!',
            target: '.feeds-list', prefer: 'right',
          },
          {
            title: 'Keyboard Shortcuts',
            body: 'Press ? anytime to see all shortcuts.\n\nj / k — navigate up and down\no — open an article\ns — save it\ne — archive it\nEsc — close',
            target: '.header-icon-btn', prefer: 'below',
          },
          {
            title: 'Resizable Panels',
            body: 'Drag the edges between panels to make them wider or narrower.',
            target: '.resize-handle', prefer: 'right',
          },
          {
            title: 'Article Goodies',
            body: 'When you open an article, you\'ll find:\n\n📖 Reading time estimate\n🔗 Copy link button\n🔤 Font size toggle (S / M / L)\n↗ "Read original" link to the source',
            target: '.article-view-actions', prefer: 'below',
          },
          {
            title: 'Add Newsletters',
            body: 'Some newsletters don\'t have RSS feeds — but we got you.\n\nHit the + button → Newsletter tab for a step-by-step guide using Kill the Newsletter. It turns email newsletters into feeds!',
            target: '.add-feed-toggle', prefer: 'below',
          },
          {
            title: 'Account Settings',
            body: 'Tap the person icon to change your password or sign out.',
            target: '.account-toggle', prefer: 'below',
          },
          {
            title: 'One More Thing...',
            body: 'Check the bottom of the sidebar 🥰',
            target: '.sidebar-footer', prefer: 'above',
          },
        ];
        const step = steps[tutorialStep];
        const isLast = tutorialStep === steps.length - 1;

        let style: React.CSSProperties = {};
        let arrowOffset: number | null = null;
        const BUBBLE_W = 320;
        const BUBBLE_H_EST = 220; // estimated max bubble height
        const PAD = 12;
        // Determine actual placement direction based on available space
        let placement: 'above' | 'below' | 'right' | 'left' | 'center' = 'center';
        if (step.target) {
          const el = document.querySelector(step.target);
          if (el) {
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceRight = window.innerWidth - rect.right;

            // Pick placement: honor preference if it fits, otherwise flip
            if (step.prefer === 'below') {
              placement = spaceBelow > BUBBLE_H_EST + PAD ? 'below' : 'above';
            } else if (step.prefer === 'above') {
              placement = spaceAbove > BUBBLE_H_EST + PAD ? 'above' : 'below';
            } else if (step.prefer === 'right') {
              placement = spaceRight > BUBBLE_W + PAD ? 'right' : 'left';
            }

            if (placement === 'below' || placement === 'above') {
              let left = Math.max(PAD, Math.min(centerX - BUBBLE_W / 2, window.innerWidth - BUBBLE_W - PAD));
              arrowOffset = centerX - left;
              if (placement === 'below') {
                style = { position: 'fixed', top: rect.bottom + PAD, left };
              } else {
                style = { position: 'fixed', bottom: window.innerHeight - rect.top + PAD, left };
              }
            } else if (placement === 'right') {
              let top = Math.max(PAD, Math.min(centerY - BUBBLE_H_EST / 2, window.innerHeight - BUBBLE_H_EST - PAD));
              style = { position: 'fixed', top, left: rect.right + PAD };
            } else if (placement === 'left') {
              let top = Math.max(PAD, Math.min(centerY - BUBBLE_H_EST / 2, window.innerHeight - BUBBLE_H_EST - PAD));
              style = { position: 'fixed', top, right: window.innerWidth - rect.left + PAD };
            }
          }
        }
        // Arrow class: 'top' means arrow at top of bubble (pointing up toward target above)
        const arrowDirMap = { above: 'bottom', below: 'top', right: 'left', left: 'right', center: 'none' } as const;
        const arrowClass = `tutorial-arrow-${arrowDirMap[placement]}`;

        return (
          <div className="tutorial-overlay" onClick={() => { localStorage.setItem('rss-tutorial-done', '1'); setTutorialStep(-1); }}>
            <div className={`tutorial-bubble ${placement === 'center' ? 'tutorial-centered' : arrowClass}`} style={{ ...style, '--arrow-left': arrowOffset != null ? `${arrowOffset}px` : '50%' } as React.CSSProperties} onClick={e => e.stopPropagation()}>
              <div className="tutorial-header">
                <h3>{step.title}</h3>
                <span className="tutorial-counter">{tutorialStep + 1} / {steps.length}</span>
              </div>
              <p className="tutorial-body">{step.body}</p>
              <div className="tutorial-dots">
                {steps.map((_, i) => (
                  <span key={i} className={`tutorial-dot ${i === tutorialStep ? 'active' : ''} ${i < tutorialStep ? 'done' : ''}`} />
                ))}
              </div>
              <div className="tutorial-actions">
                {tutorialStep > 0 && (
                  <button className="tutorial-back" onClick={() => {
                    const prev = tutorialStep - 1;
                    if (prev === 6 && !selectedArticle && articles.length > 0) {
                      setSelectedArticle(articles[0]);
                      tutorialArticleRef.current = articles[0].id;
                    }
                    if (tutorialStep === 6 && tutorialArticleRef.current) {
                      actionsRef.current.toggleReadStatus(tutorialArticleRef.current);
                      tutorialArticleRef.current = null;
                      setSelectedArticle(null);
                    }
                    setTutorialStep(prev);
                  }}>Back</button>
                )}
                <button className="tutorial-next" onClick={() => {
                  if (isLast) { localStorage.setItem('rss-tutorial-done', '1'); setTutorialStep(-1); }
                  else {
                    const next = tutorialStep + 1;
                    // Auto-open first article for "Article Goodies" step (index 6)
                    if (next === 6 && !selectedArticle && articles.length > 0) {
                      setSelectedArticle(articles[0]);
                      tutorialArticleRef.current = articles[0].id;
                    }
                    // Close article and mark unread when leaving that step
                    if (tutorialStep === 6 && tutorialArticleRef.current) {
                      actionsRef.current.toggleReadStatus(tutorialArticleRef.current);
                      tutorialArticleRef.current = null;
                      setSelectedArticle(null);
                    }
                    setTutorialStep(next);
                  }
                }}>
                  {isLast ? 'Got it! 💕' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="app-body">
        {/* ======== Sidebar ======== */}
        <div className="sidebar" style={{ width: sidebarWidth }}>
          {session?.user && (
            <div className="sidebar-user">
              <div className="sidebar-user-row">
                <span className="sidebar-user-email">{session.user.email}</span>
                <button className="account-toggle" onClick={() => setShowAccount(!showAccount)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="4.5" r="3"/><path d="M2 14.5c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
                </button>
              </div>
              {showAccount && (
                <div className="account-panel">
                  <div className="account-section">
                    <label className="account-label">Change password</label>
                    <input type="password" placeholder="New password" value={newPassword}
                      onChange={e => setNewPassword(e.target.value)} />
                    <input type="password" placeholder="Confirm password" value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)} />
                    <button className="account-save-btn" disabled={!newPassword || newPassword !== confirmPassword || newPassword.length < 6}
                      onClick={async () => {
                        const { error } = await supabase!.auth.updateUser({ password: newPassword });
                        if (error) showNotification(`Error: ${error.message}`);
                        else { showNotification('Password updated'); setNewPassword(''); setConfirmPassword(''); setShowAccount(false); }
                      }}>
                      {newPassword && confirmPassword && newPassword !== confirmPassword ? 'Passwords don\'t match' : 'Update password'}
                    </button>
                  </div>
                  <button className="account-signout" onClick={() => supabase?.auth.signOut()}>Sign out</button>
                </div>
              )}
            </div>
          )}

          <div className="feed-management">
            <div className="feeds-header">
              <h3>Feeds</h3>
              <div className="feeds-header-actions">
                <select id="feed-sort-order" value={sortOrder} onChange={e => setSortOrder(e.target.value as any)}>
                  <option value="alphabetical">A-Z</option>
                  <option value="recent">Recent</option>
                </select>
                <button className={`add-feed-toggle ${showAddFeed ? 'active' : ''}`} onClick={() => setShowAddFeed(!showAddFeed)}>
                  {showAddFeed ? '\u00d7' : '+'}
                </button>
              </div>
            </div>

            {showAddFeed && (
              <div className="add-feed-panel">
                <div className="add-mode-toggle">
                  <button className={addMode === 'feed' ? 'active' : ''} onClick={() => setAddMode('feed')}>RSS Feed</button>
                  <button className={addMode === 'newsletter' ? 'active' : ''} onClick={() => setAddMode('newsletter')}>Newsletter</button>
                </div>
                {addMode === 'feed' ? (
                  <div className="add-feed">
                    <input type="text" placeholder="Enter website or feed URL..." value={newFeedUrl}
                      onChange={e => setNewFeedUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addFeed()} />
                    <button onClick={addFeed} disabled={loading}>
                      {isDiscovering ? 'Finding Feed...' : loading ? 'Adding...' : 'Add Feed'}
                    </button>
                    <button className="opml-import-btn" onClick={() => opmlInputRef.current?.click()}>Import OPML</button>
                  </div>
                ) : (
                  <div className="add-feed">
                    <p className="add-feed-hint">Some newsletters don't have RSS feeds — but we can work around that using a free tool called Kill the Newsletter.</p>
                    <div className="newsletter-steps">
                      <div className="newsletter-step">
                        <span className="newsletter-step-num">1</span>
                        <span>Create a feed on Kill the Newsletter:</span>
                      </div>
                      <a className="newsletter-signup-link" href="https://kill-the-newsletter.com" target="_blank" rel="noopener noreferrer">
                        Open Kill the Newsletter &rarr;
                      </a>
                      <div className="newsletter-step">
                        <span className="newsletter-step-num">2</span>
                        <span>Enter the newsletter name and click "Create feed". You'll get an email address and a feed URL.</span>
                      </div>
                      <div className="newsletter-step">
                        <span className="newsletter-step-num">3</span>
                        <span>Subscribe to the newsletter using that email address.</span>
                      </div>
                      <div className="newsletter-step">
                        <span className="newsletter-step-num">4</span>
                        <span>Copy the Atom feed URL and paste it here:</span>
                      </div>
                    </div>
                    <input type="text" placeholder="Paste the feed URL from Kill the Newsletter..." value={newFeedUrl}
                      onChange={e => setNewFeedUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addFeed()} />
                    <button onClick={addFeed} disabled={loading}>
                      {loading ? 'Adding...' : 'Add Feed'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="feeds-list">
              <div className={`feed-item ${!selectedFeedId ? 'selected' : ''}`} onClick={() => setSelectedFeedId(null)}>
                <span className="feed-title">All Feeds</span>
                <span className="feed-item-actions">
                  {totalUnread > 0 && <span className="unread-count">{totalUnread}</span>}
                  <span style={{ width: 22, flexShrink: 0 }} />
                </span>
              </div>
              {sortedFeeds.map(feed => (
                <div key={feed.id} className={`feed-item ${selectedFeedId === feed.id ? 'selected' : ''}`}
                  onClick={() => setSelectedFeedId(feed.id)} title={`Last fetched: ${timeAgo(feed.last_fetched)}`}>
                  <img className="feed-favicon" src={getFaviconUrl(feed.url)} alt="" width="16" height="16" loading="lazy" />
                  {feed.color && <span className="feed-color-dot" style={{ background: feed.color }} />}
                  {isFeedStale(feed) && <span className="feed-stale-dot" title={`Not fetched in ${STALE_HOURS}h+`} />}
                  {renamingFeedId === feed.id ? (
                    <input className="feed-rename-input" autoFocus value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => renameFeed(feed.id, renameValue)}
                      onKeyDown={e => { if (e.key === 'Enter') renameFeed(feed.id, renameValue); if (e.key === 'Escape') setRenamingFeedId(null); }}
                      onClick={e => e.stopPropagation()} />
                  ) : (
                    <span className="feed-title">{feed.title}</span>
                  )}
                  <span className="feed-item-actions">
                    {(unreadCounts[feed.id] || 0) > 0 && <span className="unread-count">{unreadCounts[feed.id]}</span>}
                    <button className="overflow-trigger"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (overflowFeedId === feed.id) { setOverflowFeedId(null); }
                        else {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const flipUp = rect.bottom + 260 > window.innerHeight;
                          setOverflowPos({ top: flipUp ? rect.top : rect.bottom + 4, left: rect.right - 180 });
                          setOverflowFeedId(feed.id);
                        }
                        setConfirmDeleteFeedId(null);
                      }}>
                      &hellip;
                    </button>
                  </span>
                  {overflowFeedId === feed.id && (
                    <div className="overflow-menu" ref={overflowRef} onClick={e => e.stopPropagation()}
                      style={overflowPos ? { position: 'fixed', top: overflowPos.top, left: overflowPos.left, right: 'auto', transform: overflowPos.top < 300 ? 'none' : 'translateY(-100%)' } : undefined}>
                      <div className="overflow-section">
                        <span className="overflow-label">Color</span>
                        <div className="color-swatches">
                          <button className={`color-swatch none ${!feed.color ? 'active' : ''}`} onClick={() => setFeedColor(feed.id, null)} title="No color" />
                          {FEED_COLORS.map(c => (
                            <button key={c} className={`color-swatch ${feed.color === c ? 'active' : ''}`}
                              style={{ background: c }} onClick={() => setFeedColor(feed.id, c)} />
                          ))}
                        </div>
                      </div>
                      <div className="overflow-section overflow-meta">
                        Last fetched: {timeAgo(feed.last_fetched)}
                        {isFeedStale(feed) && <span className="stale-warning"> — may be broken</span>}
                      </div>
                      <button className="overflow-item" onClick={() => { setRenamingFeedId(feed.id); setRenameValue(feed.title); setOverflowFeedId(null); }}>Rename feed</button>
                      {confirmDeleteFeedId === feed.id ? (
                        <div className="confirm-delete">
                          <span>Delete this feed and all its articles?</span>
                          <div className="confirm-delete-actions">
                            <button className="confirm-delete-yes" onClick={() => removeFeed(feed.id)}>Delete</button>
                            <button className="confirm-delete-no" onClick={() => setConfirmDeleteFeedId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button className="overflow-item danger" onClick={() => setConfirmDeleteFeedId(feed.id)}>Delete feed</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="sidebar-footer">
            <button className="shortcut-hint-btn" onClick={() => setShowShortcuts(true)}><kbd>?</kbd> Shortcuts</button>
            <span className="made-for">I love you Bubz &lt;3</span>
          </div>
        </div>
        <div className="resize-handle" onMouseDown={e => startResize('sidebar', e)} />

        {/* ======== Main content ======== */}
        <div className="main-content">
          <div className="articles-list" ref={articleListRef} style={{ width: articleListWidth }}>
            <div className="search-bar">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>
              <input type="text" placeholder="Search articles..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              {searchQuery && <button className="search-clear" onClick={() => setSearchQuery('')}>&times;</button>}
            </div>
            <div className="articles-header">
              <div className="filter-tabs">
                <button className={`filter-tab ${!showUnreadOnly && !showSavedOnly && !showArchived ? 'active' : ''}`}
                  onClick={() => { setShowUnreadOnly(false); setShowSavedOnly(false); setShowArchived(false); }}>
                  All{!showUnreadOnly && !showSavedOnly && !showArchived ? ` (${filteredArticles.length})` : ''}
                </button>
                <button className={`filter-tab ${showUnreadOnly ? 'active' : ''}`}
                  onClick={() => { setShowUnreadOnly(true); setShowSavedOnly(false); setShowArchived(false); }}>
                  Unread{showUnreadOnly ? ` (${filteredArticles.length})` : ''}
                </button>
                <button className={`filter-tab ${showSavedOnly ? 'active' : ''}`}
                  onClick={() => { setShowSavedOnly(true); setShowUnreadOnly(false); setShowArchived(false); }}>
                  Saved{showSavedOnly ? ` (${filteredArticles.length})` : ''}
                </button>
                <button className={`filter-tab ${showArchived ? 'active' : ''}`}
                  onClick={() => { setShowArchived(true); setShowUnreadOnly(false); setShowSavedOnly(false); }}>
                  Archive{showArchived ? ` (${filteredArticles.length})` : ''}
                </button>
              </div>
              <div className="articles-header-actions">
                {!showArchived && (
                  <button onClick={markAllAsRead} className="header-icon-btn" title={selectedFeedId ? 'Mark feed as read' : 'Mark all as read'}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2 8.5 6 12.5 14 4.5" />
                    </svg>
                  </button>
                )}
                {isSupabaseConfigured && (
                  <button onClick={refreshFeeds} disabled={isRefreshing} className="header-icon-btn" title="Refresh feeds">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={isRefreshing ? 'spin' : ''}>
                      <path d="M1.5 8a6.5 6.5 0 0111.48-4.17" />
                      <polyline points="13 1 13 4.5 9.5 4.5" />
                      <path d="M14.5 8a6.5 6.5 0 01-11.48 4.17" />
                      <polyline points="3 15 3 11.5 6.5 11.5" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {visibleArticles.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">
                  {feeds.length === 0 ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                  ) : showUnreadOnly ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="4 12 9 17 20 6"/></svg>
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
                  )}
                </div>
                <p className="empty-state-title">
                  {feeds.length === 0 ? 'No feeds yet' : showArchived ? 'No archived articles' : showSavedOnly ? 'No saved articles' : showUnreadOnly ? 'All caught up' : 'No articles yet'}
                </p>
                <p className="empty-state-sub">
                  {feeds.length === 0 ? 'Hit + to add your first feed' : showUnreadOnly ? "You've read everything" : ''}
                </p>
              </div>
            )}

            {visibleArticles.map((article, index) => {
              const feedColor = getFeedColor(article.feed_id);
              return (
                <div key={article.id}
                  className={['article-item', article.is_read ? 'read' : 'unread', article.is_saved ? 'saved' : '', index === activeIndex ? 'active' : ''].filter(Boolean).join(' ')}
                  onClick={() => { setSelectedArticle(article); setActiveIndex(index); markAsRead(article.id); }}>
                  <h4>
                    {article.is_saved && <span className="saved-marker">&#9733;</span>}
                    {article.title}
                  </h4>
                  <div className="article-meta">
                    <span className="feed-name" style={feedColor ? { background: feedColor + '15', color: feedColor } : undefined}>
                      {feeds.find(f => f.id === article.feed_id)?.title || 'Unknown'}
                    </span>
                    <span className="pub-date">{timeAgo(article.pub_date)}</span>
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <button className="show-more" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                Show more ({filteredArticles.length - visibleCount} remaining)
              </button>
            )}
          </div>
          <div className="resize-handle" onMouseDown={e => startResize('articles', e)} />

          {selectedArticle && (
            <div className="article-view" ref={articleViewRef}>
              <div className="reading-progress-bar" style={{ width: `${readingProgress}%` }} />
              <div className="article-view-inner">
                <div className="article-view-toolbar">
                  <button className="back-button" onClick={() => setSelectedArticle(null)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5"/></svg>
                    Back
                  </button>
                  <div className="article-view-actions">
                    <button className={`icon-btn ${!selectedArticle.is_read ? 'active' : ''}`}
                      onClick={() => toggleReadStatus(selectedArticle.id)}
                      title={selectedArticle.is_read ? 'Mark as unread' : 'Mark as read'}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        {selectedArticle.is_read ? (
                          <><rect x="1.5" y="3.5" width="13" height="9" rx="1"/><polyline points="1.5 4.5 8 9 14.5 4.5"/></>
                        ) : (
                          <><rect x="1.5" y="3.5" width="13" height="9" rx="1"/><path d="M1.5 3.5L8 8.5l6.5-5"/></>
                        )}
                      </svg>
                    </button>
                    <button className={`icon-btn ${selectedArticle.is_saved ? 'active' : ''}`}
                      onClick={() => toggleSaved(selectedArticle.id)}
                      title={selectedArticle.is_saved ? 'Unsave' : 'Save'}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill={selectedArticle.is_saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5"><path d="M3 2.5A1.5 1.5 0 014.5 1h7A1.5 1.5 0 0113 2.5v12l-5-3.5-5 3.5V2.5z"/></svg>
                    </button>
                    <button className={`icon-btn ${selectedArticle.is_archived ? 'active' : ''}`}
                      onClick={() => toggleArchived(selectedArticle.id)}
                      title={selectedArticle.is_archived ? 'Unarchive' : 'Archive'}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1.5" y="2" width="13" height="3.5" rx="0.75"/><path d="M3 5.5v7.5h10V5.5"/><path d="M6.5 9h3"/></svg>
                    </button>
                    <button className="icon-btn" onClick={() => { navigator.clipboard.writeText(selectedArticle.link); showNotification('Link copied!'); }} title="Copy link">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6.5 9.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5l-1 1"/><path d="M9.5 6.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5l1-1"/></svg>
                    </button>
                    <span className="toolbar-divider" />
                    <button className={`icon-btn font-size-btn ${fontSize === 'small' ? 'active' : ''}`}
                      onClick={() => { const s = 'small'; setFontSize(s); localStorage.setItem('rss-font-size', s); }}
                      title="Small text"><span style={{ fontSize: 11 }}>A</span></button>
                    <button className={`icon-btn font-size-btn ${fontSize === 'medium' ? 'active' : ''}`}
                      onClick={() => { const s = 'medium'; setFontSize(s); localStorage.setItem('rss-font-size', s); }}
                      title="Medium text"><span style={{ fontSize: 14 }}>A</span></button>
                    <button className={`icon-btn font-size-btn ${fontSize === 'large' ? 'active' : ''}`}
                      onClick={() => { const s = 'large'; setFontSize(s); localStorage.setItem('rss-font-size', s); }}
                      title="Large text"><span style={{ fontSize: 17 }}>A</span></button>
                  </div>
                </div>

                <div className="article-header">
                  <a href={selectedArticle.link} target="_blank" rel="noopener noreferrer"><h2>{selectedArticle.title}</h2></a>
                  <div className="article-meta">
                    <span className="feed-name">{feeds.find(f => f.id === selectedArticle.feed_id)?.title || 'Unknown Feed'}</span>
                    <span className="pub-date">{timeAgo(selectedArticle.pub_date)}</span>
                    <span className="reading-time">{readingTime(selectedArticle.description)}</span>
                    <a href={selectedArticle.link} target="_blank" rel="noopener noreferrer" className="read-original">Read original &rarr;</a>
                    {(() => { const feedUrl = feeds.find(f => f.id === selectedArticle.feed_id)?.url || ''; const ktnMatch = feedUrl.match(/kill-the-newsletter\.com\/feeds\/([^/.]+)/); return ktnMatch ? <a href={`https://kill-the-newsletter.com/feeds/${ktnMatch[1]}`} target="_blank" rel="noopener noreferrer" className="read-original">KtN settings</a> : null; })()}
                  </div>
                </div>

                <div className={`article-content font-${fontSize}`} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedArticle.description, { ADD_ATTR: ['style', 'target', 'bgcolor', 'align', 'valign', 'width', 'height', 'cellpadding', 'cellspacing', 'border'], ADD_TAGS: ['center'] }) }} />
                <a href={selectedArticle.link} target="_blank" rel="noopener noreferrer" className="read-more">Read full article &rarr;</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RSSReader;
