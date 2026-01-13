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

function formatDate(timestamp?: number, timeString?: string) {
  // If time string is explicitly empty, don't show date
  if (timeString === '') {
    return '';
  }

  // Prefer the time string if it's available and not "Recent"
  if (timeString && timeString !== 'Recent') {
    return timeString;
  }

  // Otherwise format the timestamp
  if (!timestamp) return 'Just now';

  const date = new Date(timestamp);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  // If today, show time
  if (diffInHours < 24 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // If yesterday
  if (diffInHours < 48 && date.getDate() === now.getDate() - 1) {
    return 'Yesterday';
  }

  // If this year, show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Otherwise show full date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      // Note: We no longer trigger /api/cron here as it is handled by GitHub Actions

      const res = await fetch('/api/news', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to fetch news: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      if (data.stories) {
        setStories(data.stories);
        setLastUpdated(new Date());

        // Update news-feed.json file when manually refreshing
        if (isManual) {
          try {
            await fetch('/api/update-json', { method: 'POST' });
            console.log('news-feed.json updated');
          } catch (err) {
            console.error('Failed to update news-feed.json:', err);
          }
        }
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
          <h1 className={styles.title}>Ghana Top News (Vercel Test)</h1>
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
                  {formatDate(story.timestamp, story.time) && (
                    <div className={styles.cardMeta}>
                      <Clock size={14} />
                      <span>
                        {formatDate(story.timestamp, story.time)}
                      </span>
                    </div>
                  )}
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
