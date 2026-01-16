import { fetchArticleMetadata } from './scrape-standalone';

async function test() {
    const url = 'https://www.ghanaweb.com/GhanaHomePage/politics/Wontumi-explains-absence-from-Bawumia-s-campaign-2017075';
    console.log(`Testing metadata fetch for: ${url}`);

    try {
        const metadata = await fetchArticleMetadata(url, 'GhanaWeb');
        console.log('Result:', JSON.stringify(metadata, null, 2));
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
