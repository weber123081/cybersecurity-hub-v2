import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import translate from 'translate-google';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parser = new Parser();
const OUTPUT_FILE = path.join(__dirname, '../public/data/news.json');

const SOURCES = [
    {
        name: "iThome (TW)",
        url: 'https://www.ithome.com.tw/rss/security',
        foreign: false
    },
    {
        name: "The Hacker News",
        url: 'https://feeds.feedburner.com/TheHackersNews',
        foreign: true
    },
    {
        name: "BleepingComputer",
        url: 'https://www.bleepingcomputer.com/feed/',
        foreign: true
    }
];
const keywordTips = {
  '詐騙': { category: '詐騙防範', icon: 'fa-user-ninja' },
  '密碼': { category: '密碼與帳號', icon: 'fa-key' },
  '登入': { category: '密碼與帳號', icon: 'fa-key' },
  '勒索': { category: '最新情報', icon: 'fa-lock' },
  '漏洞': { category: '最新情報', icon: 'fa-bug' },
  '零時差': { category: '最新情報', icon: 'fa-bug' },
  '個資': { category: '網路與隱私', icon: 'fa-user-secret' },
  '路由器': { category: '網路與隱私', icon: 'fa-wifi' },
  '蘋果': { category: '手機安全', icon: 'fa-mobile-screen' },
  'Android': { category: '手機安全', icon: 'fa-mobile-screen' },
  'iOS': { category: '手機安全', icon: 'fa-mobile-screen' }
};

const defaultCat = { category: '最新情報', icon: 'fa-shield-halved' };

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

async function translateText(text) {
    if (!text) return "";
    try {
        return await translate(text, { to: 'zh-tw' });
    } catch (e) {
        console.error("Translation error:", e.message);
        return text; // Fallback to original if translation fails
    }
}

async function fetchAndSave() {
    console.log(`[${new Date().toISOString()}] Starting global intelligence fetch...`);
    let globalPosts = [];
    let postId = 1;

    for (const source of SOURCES) {
        console.log(`\n[${new Date().toISOString()}] Fetching RSS feed from: ${source.name}`);
        try {
            const feed = await parser.parseURL(source.url);
            // Limit to top 5 per source
            const rawItems = feed.items.slice(0, 5);
            
            for (let i = 0; i < rawItems.length; i++) {
                const item = rawItems[i];
                console.log(`[${source.name}] Scraping content for: ${item.title}`);
                let fullContent = await scrapeFullContent(item.link);
                let finalTitle = item.title;
                
                // Translate if foreign source
                if (source.foreign) {
                    console.log(`  -> Translating content from ${source.name}...`);
                    finalTitle = await translateText(item.title);
                    fullContent = await translateText(fullContent);
                }
                
                let dateStr = '剛剛';
                if (item.pubDate) {
                    const d = new Date(item.pubDate);
                    if (!isNaN(d.getTime())) {
                        dateStr = d.toISOString().split('T')[0];
                    }
                }

                let matchedCat = defaultCat;
                const textTarget = finalTitle + ' ' + (item.contentSnippet || "");
                for (const [keyword, data] of Object.entries(keywordTips)) {
                    if (textTarget.includes(keyword)) {
                        matchedCat = data;
                        break;
                    }
                }

                // Also check full content just in case
                if (matchedCat === defaultCat) {
                   for (const [keyword, data] of Object.entries(keywordTips)) {
                      if (fullContent.includes(keyword)) {
                          matchedCat = data;
                          break;
                      }
                   }
                }

                globalPosts.push({
                    id: postId++,
                    authorName: `資安情報 · ${source.name}`,
                    authorIcon: matchedCat.icon,
                    category: matchedCat.category,
                    timeAgo: dateStr,
                    title: finalTitle,
                    content: fullContent
                });
                
                // Brief delay to prevent overloading target servers and translation APIs
                await new Promise(r => setTimeout(r, 1500));
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing source ${source.name}:`, error.message);
        }
    }
    
    // Sort overall by date (optional, but relying on fetch order is okay for now since we prepend "剛剛/dateStr")
    // Save unified array
    try {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(globalPosts, null, 2));
        console.log(`\n[${new Date().toISOString()}] Successfully saved ${globalPosts.length} posts from all sources to ${OUTPUT_FILE}`);
    } catch(err) {
        console.error("Failed to write unified news.json:", err);
    }
}

const dir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

fetchAndSave();
