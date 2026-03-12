import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parser = new Parser();
const RSS_URL = 'https://www.ithome.com.tw/rss/security';
const OUTPUT_FILE = path.join(__dirname, '../public/data/news.json');

async function scrapeFullContent(url) {
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);
        
        let paragraphs = [];
        $('.article-content p, .field-name-body p, article p').each((i, el) => {
            const text = $(el).text().trim();
            if (text) {
                paragraphs.push(text);
            }
        });
        
        let fullText = paragraphs.join('\n\n');
        return fullText || "無法擷取完整內容。";
    } catch (e) {
        console.error("Scraping error for URL:", url, e.message);
        return "無法擷取完整內容，可能讀取逾時。";
    }
}

async function fetchAndSave() {
    console.log(`[${new Date().toISOString()}] Fetching RSS feed...`);
    try {
        const feed = await parser.parseURL(RSS_URL);
        const rawItems = feed.items.slice(0, 15);
        
        const posts = [];
        for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems[i];
            console.log(`[${i+1}/${rawItems.length}] Scraping content for: ${item.title}`);
            const fullContent = await scrapeFullContent(item.link);
            
            let dateStr = '剛剛';
            if (item.pubDate) {
                const d = new Date(item.pubDate);
                if (!isNaN(d.getTime())) {
                    dateStr = d.toISOString().split('T')[0];
                }
            }

            posts.push({
                id: i + 1,
                authorName: "資安情報",
                authorIcon: 'fa-shield-halved',
                category: "最新情報",
                timeAgo: dateStr,
                title: item.title,
                content: fullContent
            });
            
            // Brief delay to prevent overloading the target server
            await new Promise(r => setTimeout(r, 800));
        }
        
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(posts, null, 2));
        console.log(`[${new Date().toISOString()}] Successfully saved ${posts.length} posts to ${OUTPUT_FILE}`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching RSS feed:`, error.message);
    }
}

const dir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

fetchAndSave();
