'use client';

import { useEffect, useState, useCallback } from 'react';
import styles from './page.module.css';
import { RefreshCw, Clock, ExternalLink, Newspaper, Loader2 } from 'lucide-react';

interface Story {
  id: string;
  source: string;
  title: string;
  link: string;
  image: string | null;

  time?: string;
  timestamp?: number;
  section?: string;
}

function timeAgo(timestamp?: number) {
  if (!timestamp) return 'Just now';

  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  // Negative check (future time)
  if (seconds < 0) return 'Just now';

  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + "y ago";

  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + "mo ago";

  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + "d ago";

  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + "h ago";

  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + "m ago";

  if (seconds < 30) return "Just now";

  return Math.floor(seconds) + "s ago";
}

export default function Home() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchNews = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    setError(null);
    try {
      // Trigger update logic first (on manual refresh or interval)
      // We assume this endpoint handles scraping and updating DB.
      // We await it so we display fresh data.
      // Note: This might take a few seconds on cold start or heavy scrape.
      if (isManual) {
        await fetch('/api/cron');
      } else {
        // Background update logic? If we are in useEffect interval, we want to update.
        // Let's just always update.
        // Optimization: Maybe only update if > 5 minutes since last update?
        // The interval handles the timing.
        await fetch('/api/cron');
      }

      const res = await fetch('/api/news');
      if (!res.ok) {
        throw new Error(`Failed to fetch news: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (data.stories) {
        setStories(data.stories);
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      console.error('Failed to fetch news', err);
      setError(err.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(() => fetchNews(), 300000); // Live update every 5 minutes
    return () => clearInterval(interval);
  }, [fetchNews]);

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Ghana Top News</h1>
          <p className={styles.subtitle}>Unified feed: GhanaWeb, AdomOnline, PeaceFM, MyJoyOnline</p>
        </header>

        <div className={styles.controls}>
          <button
            className={styles.refreshButton}
            onClick={() => fetchNews(true)}
            disabled={isRefreshing}
          >
            <RefreshCw size={16} className={isRefreshing ? styles.spinner : ''} />
            {isRefreshing ? 'Updating...' : 'Refresh'}
          </button>
        </div>

        {error ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Error loading news</p>
            <p>{error}</p>
            <button
              onClick={() => fetchNews(true)}
              style={{ marginTop: '1.5rem', padding: '0.5rem 1rem', background: '#334155', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
            >
              Try Again
            </button>
          </div>
        ) : loading ? (
          <div className={styles.loading}>
            <Loader2 size={40} className={styles.spinner} />
            <p>Scraping latest stories...</p>
          </div>
        ) : stories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            <Newspaper size={48} style={{ margin: '0 auto 1rem', display: 'block' }} />
            <p>No stories found.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              The database might be empty.
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {stories.map((story) => (
              <a
                href={story.link}
                target="_blank"
                rel="noopener noreferrer"
                key={story.id}
                className={styles.card}
              >
                <div className={styles.imageContainer}>
                  {story.image ? (
                    <img
                      src={story.image}
                      alt={story.title}
                      className={styles.image}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#334155' }}>
                      <Newspaper size={48} color="#64748b" />
                    </div>
                  )}
                </div>
                <div className={styles.content}>
                  <div className={`${styles.sourceTag} 
                    ${story.source === 'MyJoyOnline' ? styles.joyTag :
                      story.source === 'CitiNewsRoom' ? styles.citiTag :
                        story.source === 'GhanaWeb' ? styles.gwTag :
                          story.source === 'AdomOnline' ? styles.adomTag :
                            story.source === 'PeaceFM' ? styles.peaceTag : styles.citiTag

                    }`}>
                    {story.source}
                  </div>
                  {story.section && (
                    <div className={styles.categoryTag}>
                      {story.section}
                    </div>
                  )}
                  <h2 className={styles.cardTitle}>{story.title}</h2>
                  <div className={styles.cardMeta}>
                    <Clock size={14} />
                    <span>
                      {story.timestamp ? timeAgo(story.timestamp) : (story.time || 'Just now')}
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        {!loading && lastUpdated && (
          <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--muted)', fontSize: '0.8rem' }}>
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>
    </main>
  );
}
