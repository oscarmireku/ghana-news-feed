import * as cheerio from 'cheerio';

async function testGhanaWebDate() {
    const url = 'https://www.ghanaweb.com/GhanaHomePage/NewsArchive/Some-ladies-are-using-men-as-a-means-of-employment-1968445';

    console.log(`Testing GhanaWeb date extraction\n`);

    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);

    // Check all meta tags
    const metaTags = {
        'og:article:published_time': $('meta[property="og:article:published_time"]').attr('content'),
        'article:published_time': $('meta[property="article:published_time"]').attr('content'),
        'datePublished': $('meta[itemprop="datePublished"]').attr('content'),
    };

    console.log('Meta tags found:', JSON.stringify(metaTags, null, 2));

    // Check HTML elements
    console.log('\nHTML date elements:');
    console.log('  .date class:', $('.date').first().text().trim());
    console.log('  .published class:', $('.published').first().text().trim());
    console.log('  .article-date class:', $('.article-date').first().text().trim());

    // Look for the actual date in page structure
    console.log('\nSearching page text for "Jan 2026" or similar...');
    const pageText = $('body').text();
    const dateMatch = pageText.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
    if (dateMatch) {
        console.log('  Found:', dateMatch[0]);
    } else {
        console.log('  No date pattern found');
    }
}

testGhanaWebDate();
