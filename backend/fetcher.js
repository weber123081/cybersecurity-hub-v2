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
    { name: "iThome (TW)", url: 'https://www.ithome.com.tw/rss/security', foreign: false },
    { name: "The Hacker News", url: 'https://feeds.feedburner.com/TheHackersNews', foreign: true },
    { name: "BleepingComputer", url: 'https://www.bleepingcomputer.com/feed/', foreign: true },
    { name: "SecurityWeek", url: 'https://feeds.feedburner.com/securityweek', foreign: true },
    { name: "Dark Reading", url: 'https://www.darkreading.com/rss.xml', foreign: true },
    { name: "Krebs on Security", url: 'https://krebsonsecurity.com/feed/', foreign: true },
    { name: "Threatpost", url: 'https://threatpost.com/feed/', foreign: true },
    { name: "CyberScoop", url: 'https://www.cyberscoop.com/feed/', foreign: true }
];

const keywordTips = {
    '詐騙': { category: '詐騙防範', icon: 'fa-user-ninja' },
    '釣魚': { category: '詐騙防範', icon: 'fa-fish-symbols' },
    '密碼': { category: '密碼與帳號', icon: 'fa-key' },
    '登入': { category: '密碼與帳號', icon: 'fa-key' },
    '勒索': { category: '網路與隱私', icon: 'fa-lock' },
    '漏洞': { category: '系統弱點', icon: 'fa-bug' },
    '零時差': { category: '系統弱點', icon: 'fa-bug' },
    'CVE-': { category: '系統弱點', icon: 'fa-bug' },
    '個資': { category: '網路與隱私', icon: 'fa-user-secret' },
    '隱私': { category: '網路與隱私', icon: 'fa-eye-slash' },
    '路由器': { category: '網路與隱私', icon: 'fa-wifi' },
    '蘋果': { category: '手機安全', icon: 'fa-mobile-screen' },
    'iPhone': { category: '手機安全', icon: 'fa-mobile-screen' },
    'Android': { category: '手機安全', icon: 'fa-mobile-screen' },
    'iOS': { category: '手機安全', icon: 'fa-mobile-screen' },
    '惡意軟體': { category: '軟體安全', icon: 'fa-virus' },
    '後門': { category: '軟體安全', icon: 'fa-door-open' },
    'AI': { category: '新興技術', icon: 'fa-robot' },
    '人工智慧': { category: '新興技術', icon: 'fa-robot' }
};

const defaultCat = { category: '綜合動態', icon: 'fa-shield-halved' };

async function scrapeFullContent(url) {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.google.com/',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        if (res.status === 403) {
            console.error(`[Scrape] 403 Forbidden for ${url}`);
            return null; // Signal failure for fallback
        }

        const html = await res.text();
        const $ = cheerio.load(html);

        // Remove known non-article sections
        $('.related-news, .author-bio, footer, nav, .ad-unit, .newsletter-signup, code, script, style').remove();

        let paragraphs = [];
        const selectors = [
            '.article-content p',
            '.field-name-body p',
            'article p',
            '.articlebody p',
            '#articlebody p',
            '.articleBody p',
            '.post-body p',
            '.article-body p',
            '.zox-post-body p',
            '.zox-post-body-text p',
            '.Article-Body p',
            '.ContentText-BodyTextChunk'
        ].join(', ');

        $(selectors).each((i, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 20 && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                paragraphs.push(text);
            }
        });

        let fullText = paragraphs.join('\n\n');
        fullText = fullText.replace(/(\n\n\d{4}-\d{2}-\d{2})+$/, '').trim();

        return fullText || null;
    } catch (e) {
        console.error("Scraping error for URL:", url, e.message);
        return null;
    }
}

async function translateText(text, retries = 3) {
    if (!text || text.trim().length === 0) return "";

    // Split text into chunks to avoid Google Translate character limits (~5000)
    // Using 2500 for safety and better chunking
    const chunks = [];
    const maxChunkSize = 2500;
    let currentChunk = "";

    const lines = text.split('\n');
    for (const line of lines) {
        if ((currentChunk.length + line.length) > maxChunkSize) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = line + '\n';
        } else {
            currentChunk += line + '\n';
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());

    const translatedChunks = [];
    for (const chunk of chunks) {
        let success = false;
        for (let i = 0; i < retries; i++) {
            try {
                // Add a polite delay between each translation chunk
                await new Promise(r => setTimeout(r, 1500));
                const res = await translate(chunk, { to: 'zh-tw' });
                translatedChunks.push(res);
                success = true;
                break;
            } catch (e) {
                console.error(`Chunk translation error (Attempt ${i + 1}):`, e.message);
                if (i === retries - 1) {
                    translatedChunks.push(chunk); // Fallback to original for this chunk
                } else {
                    // Significant wait if we hit an error (likely rate limit)
                    const wait = (i + 1) * 8000;
                    console.log(`  -> Rate-limit suspected. Waiting ${wait / 1000}s...`);
                    await new Promise(r => setTimeout(r, wait));
                }
            }
        }
    }

    return translatedChunks.join('\n\n');
}

export async function fetchAndSave() {
    console.log(`[${new Date().toISOString()}] Starting global intelligence fetch...`);

    // 1. Load existing data for persistence
    let existingPosts = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existingPosts = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
        } catch (e) {
            console.error("Failed to read existing news.json:", e);
        }
    }

    // PRE-CLEAN: Remove any posts with the "failed" placeholder OR untranslated English content from foreign sources
    let globalPosts = existingPosts.filter(p => {
        const isFailed = !p.content || p.content.includes("無法擷取完整內容");
        const isForeign = p.authorName && (
            p.authorName.includes("The Hacker News") ||
            p.authorName.includes("SecurityWeek") ||
            p.authorName.includes("Dark Reading") ||
            p.authorName.includes("BleepingComputer") ||
            p.authorName.includes("Krebs") ||
            p.authorName.includes("Threatpost") ||
            p.authorName.includes("CyberScoop")
        );
        // Heuristic: If it's a foreign source and contains common English words like ' the ', it's likely untranslated
        const isUntranslated = isForeign && p.content && p.content.toLowerCase().includes(" the ");

        return !isFailed && !isUntranslated;
    });
    const initialCount = globalPosts.length;

    // Calculate the date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const source of SOURCES) {
        console.log(`\n[${new Date().toISOString()}] Fetching RSS feed from: ${source.name}`);
        try {
            const feed = await parser.parseURL(source.url);

            // Filter items: Must be within 30 days
            const recentItems = feed.items.filter(item => {
                if (!item.pubDate) return false;
                const d = new Date(item.pubDate);
                return !isNaN(d.getTime()) && d >= thirtyDaysAgo;
            });

            console.log(`[${source.name}] Found ${recentItems.length} items from the last 30 days.`);

            for (let i = 0; i < recentItems.length; i++) {
                const item = recentItems[i];

                // 2. Check for keywords FIRST for categorization
                let matchedCat = defaultCat; // Default to 'General' instead of null
                const searchTarget = (item.title + ' ' + (item.contentSnippet || "")).toLowerCase();

                for (const [keyword, data] of Object.entries(keywordTips)) {
                    if (searchTarget.includes(keyword.toLowerCase())) {
                        matchedCat = data;
                        break;
                    }
                }

                // [OFF] Don't skip anymore! Just use matchedCat (which is defaultCat if no match)
                // if (!matchedCat) {
                //     continue;
                // }

                // 3. De-duplicate: If we already have this URL in our current pool, skip it
                if (globalPosts.some(post => post.originalUrl === item.link)) {
                    continue;
                }

                console.log(`[${source.name}] New Match (${i + 1}/${recentItems.length}) Scraping: ${item.title}`);
                let fullContent = await scrapeFullContent(item.link);

                // FALLBACK: If scraping failed (403 or no paragraphs), use RSS snippet
                if (!fullContent) {
                    console.log(`  -> Scraping failed or blocked, using RSS fallback.`);
                    fullContent = item.contentSnippet || item.content || "無法擷取全文，請點擊標題查看。";
                    // Strip HTML if fallback is HTML
                    if (fullContent.includes('<')) {
                        fullContent = fullContent.replace(/<[^>]*>?/gm, '').trim();
                    }
                }

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

                globalPosts.push({
                    id: Date.now() + Math.floor(Math.random() * 1000), // Better ID generation
                    authorName: `資安情報 · ${source.name}`,
                    authorIcon: matchedCat.icon,
                    category: matchedCat.category,
                    timeAgo: dateStr,
                    title: finalTitle,
                    content: fullContent,
                    originalUrl: item.link, // Store for de-duplication
                    pubDate: item.pubDate // Store raw date for aging
                });

                // Brief delay to prevent overloading target servers and translation APIs
                await new Promise(r => setTimeout(r, 1200));
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing source ${source.name}:`, error.message);
        }
    }

    // 4. PRUNING: Only keep data within the last 30 days
    const prunedPosts = globalPosts.filter(post => {
        if (!post.pubDate) return false;
        const d = new Date(post.pubDate);
        return !isNaN(d.getTime()) && d >= thirtyDaysAgo;
    });

    // 5. SEMANTIC DEDUPLICATION (New per User Request)
    // Filter out posts that have very similar titles or mention the same CVE
    const uniquePosts = [];
    const seenTitles = new Set();
    const seenCVEs = new Set();

    // Sort by source priority if desired, or just use what we have (already sorted by feed order)
    for (const post of prunedPosts) {
        const titleNormalized = post.title.toLowerCase().replace(/\s+/g, '').trim();

        // Check for CVE pattern in title
        const cveMatch = post.title.match(/CVE-\d{4}-\d{4,7}/i);
        const cveId = cveMatch ? cveMatch[0].toUpperCase() : null;

        let isDuplicate = false;

        // Rule 1: Exact/Near-exact normalized title exists
        if (seenTitles.has(titleNormalized)) {
            isDuplicate = true;
        }

        // Rule 2: Same CVE ID mentioned in a major vulnerability report
        if (cveId && seenCVEs.has(cveId)) {
            isDuplicate = true;
        }

        // Rule 3: Fuzzy title match (check if title contains significant portion of an existing title)
        if (!isDuplicate) {
            for (const prevTitle of seenTitles) {
                if (titleNormalized.includes(prevTitle) || prevTitle.includes(titleNormalized)) {
                    if (Math.abs(titleNormalized.length - prevTitle.length) < 15) {
                        isDuplicate = true;
                        break;
                    }
                }
            }
        }

        if (!isDuplicate) {
            uniquePosts.push(post);
            seenTitles.add(titleNormalized);
            if (cveId) seenCVEs.add(cveId);
        }
    }

    // 6. SORTING: Sort by date descending (newest first)
    uniquePosts.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // Re-assign simple sequential IDs for the final JSON
    const finalPosts = uniquePosts.map((post, idx) => ({
        ...post,
        id: idx + 1
    }));

    try {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalPosts, null, 2));
        console.log(`\n[${new Date().toISOString()}] Successfully updated intelligence feed.`);
        console.log(`Total Unique: ${finalPosts.length} posts (Pruned: ${globalPosts.length - prunedPosts.length}, Cross-source Duplicates removed: ${prunedPosts.length - uniquePosts.length})`);
    } catch (err) {
        console.error("Failed to write unified news.json:", err);
    }
}

// Only run automatically if executed directly (e.g., node fetcher.js)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fetchAndSave();
}
