import fetch from 'node-fetch';
import type { RequestInit, Response } from 'node-fetch';

interface CacheEntry {
    response: Response;
    etag?: string;
    lastModified?: string;
    timestamp: number;
}

interface FetchOptions extends RequestInit {
    minDelay?: number;
    maxDelay?: number;
    maxRetries?: number;
    cacheTime?: number;
    skipCache?: boolean;
}

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

class RateLimitedFetcher {
    private domainLastRequest: Map<string, number> = new Map();
    private cache: Map<string, CacheEntry> = new Map();
    private userAgentIndex = 0;

    private getDomain(url: string): string {
        try {
            return new URL(url).hostname;
        } catch {
            return 'unknown';
        }
    }

    private getNextUserAgent(): string {
        const ua = USER_AGENTS[this.userAgentIndex];
        this.userAgentIndex = (this.userAgentIndex + 1) % USER_AGENTS.length;
        return ua;
    }

    private async waitForRateLimit(domain: string, minDelay: number, maxDelay: number): Promise<void> {
        const lastRequest = this.domainLastRequest.get(domain) || 0;
        const now = Date.now();
        const timeSinceLastRequest = now - lastRequest;

        // Add randomized jitter
        const delay = minDelay + Math.random() * (maxDelay - minDelay);

        if (timeSinceLastRequest < delay) {
            const waitTime = delay - timeSinceLastRequest;
            console.log(`Rate limiter: waiting ${Math.round(waitTime)}ms for ${domain}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.domainLastRequest.set(domain, Date.now());
    }

    private getCacheKey(url: string): string {
        return url;
    }

    private isCacheValid(entry: CacheEntry, cacheTime: number): boolean {
        return Date.now() - entry.timestamp < cacheTime;
    }

    async fetch(url: string, options: FetchOptions = {}): Promise<Response> {
        const {
            minDelay = 500,
            maxDelay = 1500,
            maxRetries = 3,
            cacheTime = 5 * 60 * 1000, // 5 minutes
            skipCache = false,
            ...fetchOptions
        } = options;

        const domain = this.getDomain(url);
        const cacheKey = this.getCacheKey(url);

        // Check cache first
        if (!skipCache) {
            const cached = this.cache.get(cacheKey);
            if (cached && this.isCacheValid(cached, cacheTime)) {
                console.log(`Cache hit for ${url}`);
                return cached.response.clone();
            }
        }

        // Prepare headers
        const headers: Record<string, string> = {
            'User-Agent': this.getNextUserAgent(),
            ...(fetchOptions.headers as Record<string, string> || {})
        };

        // Add conditional request headers if we have cached data
        const cached = this.cache.get(cacheKey);
        if (cached && !skipCache) {
            if (cached.etag) {
                headers['If-None-Match'] = cached.etag;
            }
            if (cached.lastModified) {
                headers['If-Modified-Since'] = cached.lastModified;
            }
        }

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Wait for rate limit
                await this.waitForRateLimit(domain, minDelay, maxDelay);

                // Make request
                const response = await fetch(url, {
                    ...fetchOptions,
                    headers
                });

                // Handle 304 Not Modified
                if (response.status === 304 && cached) {
                    console.log(`Cache revalidated (304) for ${url}`);
                    cached.timestamp = Date.now(); // Refresh cache timestamp
                    return cached.response.clone();
                }

                // Handle rate limiting
                if (response.status === 429 || response.status === 503) {
                    const retryAfter = response.headers.get('Retry-After');
                    const backoffDelay = retryAfter
                        ? parseInt(retryAfter) * 1000
                        : Math.pow(2, attempt) * 1000;

                    console.log(`Rate limited (${response.status}). Retry attempt ${attempt + 1}/${maxRetries} after ${backoffDelay}ms`);

                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, backoffDelay));
                        continue;
                    }
                }

                // Success - cache the response
                if (response.ok && !skipCache) {
                    const etag = response.headers.get('ETag') || undefined;
                    const lastModified = response.headers.get('Last-Modified') || undefined;

                    this.cache.set(cacheKey, {
                        response: response.clone(),
                        etag,
                        lastModified,
                        timestamp: Date.now()
                    });
                }

                return response;

            } catch (error) {
                lastError = error as Error;

                if (attempt < maxRetries) {
                    const backoffDelay = Math.pow(2, attempt) * 1000;
                    console.log(`Fetch error for ${url}. Retry attempt ${attempt + 1}/${maxRetries} after ${backoffDelay}ms`);
                    await new Promise(resolve => setTimeout(resolve, backoffDelay));
                } else {
                    console.error(`Failed to fetch ${url} after ${maxRetries} retries:`, error);
                }
            }
        }

        throw lastError || new Error(`Failed to fetch ${url}`);
    }

    clearCache(): void {
        this.cache.clear();
    }

    clearDomainCache(domain: string): void {
        for (const [key, entry] of this.cache.entries()) {
            if (this.getDomain(key) === domain) {
                this.cache.delete(key);
            }
        }
    }
}

// Singleton instance
export const rateLimitedFetcher = new RateLimitedFetcher();

// Convenience function
export async function rateLimitedFetch(url: string, options?: FetchOptions): Promise<Response> {
    return rateLimitedFetcher.fetch(url, options);
}
