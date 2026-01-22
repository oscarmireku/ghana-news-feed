import 'dotenv/config';
import * as cheerio from 'cheerio';

async function testPulseContent() {
    const url = 'https://www.pulse.com.gh/news/local/ghana-to-host-2025-african-games-president-mahama-confirms/e4qbxrj';

    console.log('Testing Pulse.com.gh content extraction...\n');

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    // Test different selectors
    const selectors = [
        'article',
        '.max-w-\\[620px\\]',
        '.article-content',
        '.article-body',
        '[class*="article"]',
        '[class*="content"]',
        '.post-content',
        'main article'
    ];

    console.log('Testing selectors:\n');
    for (const selector of selectors) {
        const el = $(selector).first();
        if (el.length > 0) {
            const text = el.text().trim();
            console.log(`✓ ${selector}: ${text.length} chars`);
            console.log(`  Preview: ${text.substring(0, 100)}...\n`);
        } else {
            console.log(`✗ ${selector}: Not found\n`);
        }
    }
}

testPulseContent();
