import 'dotenv/config';
import * as cheerio from 'cheerio';

async function analyzePulse() {
    const url = 'https://www.pulse.com.gh/news/local/ghana-to-host-2025-african-games-president-mahama-confirms/e4qbxrj';

    console.log('Analyzing Pulse.com.gh HTML structure...\n');

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find all divs with classes
    console.log('Main container classes:');
    $('div[class]').each((i, el) => {
        if (i > 50) return false;
        const classes = $(el).attr('class');
        const text = $(el).text().trim();
        if (text.length > 100 && text.length < 5000) {
            console.log(`\nClass: ${classes}`);
            console.log(`Text length: ${text.length}`);
            console.log(`Preview: ${text.substring(0, 150)}...`);
        }
    });

    // Check for paragraphs
    console.log('\n\nParagraph count:', $('p').length);
    const firstP = $('p').first().text().trim();
    console.log('First paragraph:', firstP.substring(0, 200));
}

analyzePulse();
