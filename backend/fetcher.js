import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import translate from 'translate-google';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow self-signed certificates in environments with SSL/TLS inspection or corporate proxies
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const parser = new Parser({
    requestOptions: {
        rejectUnauthorized: false
    },
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
});

const OUTPUT_FILE = path.join(__dirname, '../public/data/news.json');
const SOURCES_FILE = path.join(__dirname, 'data/sources.json');

const DEFAULT_SOURCES = [
    { id: "ithome-tw", name: "iThome (TW)", url: 'https://www.ithome.com.tw/rss/security', foreign: false, enabled: true },
    { id: "twcert-alert", name: "TWCERT/CC 資安警訊", url: 'https://www.twcert.org.tw/tw/rss-104-1.xml', foreign: false, enabled: true },
    { id: "twcert-vuln", name: "TWCERT/CC 漏洞通告", url: 'https://www.twcert.org.tw/tw/rss-132-1.xml', foreign: false, enabled: true },
    { id: "trendmicro-tw", name: "趨勢科技 台灣資安部落格", url: 'https://blog.trendmicro.com.tw/?feed=rss2', foreign: false, enabled: true }
];

// Generate a deterministic positive integer ID from article URL or title
export function generateStableId(str) {
    const input = String(str || '');
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 1;
}

export function getSources() {
    try {
        if (!fs.existsSync(SOURCES_FILE)) {
            const dir = path.dirname(SOURCES_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(SOURCES_FILE, JSON.stringify(DEFAULT_SOURCES, null, 2), 'utf-8');
            return DEFAULT_SOURCES;
        }
        const raw = fs.readFileSync(SOURCES_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : DEFAULT_SOURCES;
    } catch (e) {
        console.error("Failed to read sources.json, using default sources:", e.message);
        return DEFAULT_SOURCES;
    }
}

export function saveSources(sources) {
    const dir = path.dirname(SOURCES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2), 'utf-8');
}

export async function testSourceUrl(url) {
    const feed = await parser.parseURL(url);
    return {
        title: feed.title || '',
        itemCount: Array.isArray(feed.items) ? feed.items.length : 0,
        latestItemTitle: feed.items && feed.items[0] ? feed.items[0].title : ''
    };
}

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
        $('.related-news, .author-bio, footer, nav, header, .ad-unit, .newsletter-signup, .breadcrumb, .share, code, script, style').remove();

        let paragraphs = [];
        const seenParagraphs = new Set();
        const selectors = [
            '.article-content p',
            '.field-name-body p',
            'article p',
            '.entry-content p',
            '.post-content p',
            '.cp p',
            '.cp li',
            '.text_content p',
            '.news-detail p',
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
            const text = $(el).text().replace(/\s+/g, ' ').trim();
            if (text && text.length >= 10 && !/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(text) && !seenParagraphs.has(text)) {
                seenParagraphs.add(text);
                paragraphs.push(text);
            }
        });

        // Also extract structured table rows (e.g., TWCERT/CC TVN vulnerability advisory tables)
        $('table tr').each((i, tr) => {
            const th = $(tr).find('th').first().text().replace(/\s+/g, ' ').trim();
            const tdHtml = $(tr).find('td').first().html();
            if (th && tdHtml) {
                const tdText = cheerio.load(tdHtml.replace(/<br\s*\/?>/gi, '\n')).text().trim();
                if (tdText) {
                    const rowStr = `【${th}】\n${tdText}`;
                    if (!seenParagraphs.has(rowStr)) {
                        seenParagraphs.add(rowStr);
                        paragraphs.push(rowStr);
                    }
                }
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
        for (let i = 0; i < retries; i++) {
            try {
                // Add a polite delay between each translation chunk
                await new Promise(r => setTimeout(r, 1500));
                const res = await translate(chunk, { to: 'zh-tw' });
                translatedChunks.push(res);
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

    const allSources = getSources();
    const activeSources = allSources.filter(s => s.enabled !== false);
    console.log(`[Config] Loaded ${activeSources.length} active sources (out of ${allSources.length} configured).`);

    // 1. Load existing data for persistence
    let existingPosts = [];
    if (fs.existsSync(OUTPUT_FILE)) {
        try {
            existingPosts = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
        } catch (e) {
            console.error("Failed to read existing news.json:", e);
        }
    }

    // PRE-CLEAN: Keep custom admin posts and posts belonging to currently enabled sources with valid content
    const activeSourceNames = activeSources.map(s => s.name);
    let globalPosts = existingPosts.filter(p => {
        if (p.isCustom) return true;
        const isFailed = !p.content || p.content === p.title || p.content.includes("無法擷取完整內容") || p.content.includes("無法擷取全文，請點擊標題查看。");
        const isFromActiveSource = p.authorName && activeSourceNames.some(name => p.authorName.includes(name));
        return !isFailed && isFromActiveSource;
    });

    // Calculate the date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const source of activeSources) {
        console.log(`\n[${new Date().toISOString()}] Fetching RSS feed from: ${source.name} (${source.url})`);
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
                let matchedCat = defaultCat;
                const searchTarget = (item.title + ' ' + (item.contentSnippet || "")).toLowerCase();

                for (const [keyword, data] of Object.entries(keywordTips)) {
                    if (searchTarget.includes(keyword.toLowerCase())) {
                        matchedCat = data;
                        break;
                    }
                }

                // 3. De-duplicate: If we already have this URL in our current pool, skip it
                if (globalPosts.some(post => post.originalUrl === item.link)) {
                    continue;
                }

                console.log(`[${source.name}] New Match (${i + 1}/${recentItems.length}) Scraping: ${item.title}`);
                let fullContent = await scrapeFullContent(item.link);

                // FALLBACK: If scraping failed (403 or no paragraphs), use RSS snippet
                if (!fullContent) {
                    console.log(`  -> Scraping failed or blocked, using RSS fallback.`);
                    fullContent = item.contentSnippet || item.content || "請點擊下方「查看原文」按鈕閱讀完整通告內容。";
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
                    id: generateStableId(item.link || finalTitle),
                    authorName: `資安情報 · ${source.name}`,
                    authorIcon: matchedCat.icon,
                    category: matchedCat.category,
                    timeAgo: dateStr,
                    title: finalTitle,
                    content: fullContent,
                    originalUrl: item.link,
                    pubDate: item.pubDate
                });

                // Brief delay to prevent overloading target servers and translation APIs
                await new Promise(r => setTimeout(r, 1200));
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error processing source ${source.name}:`, error.message);
        }
    }

    // 4. PRUNING: Keep custom posts and data within the last 30 days
    const prunedPosts = globalPosts.filter(post => {
        if (post.isCustom) return true;
        if (!post.pubDate) return false;
        const d = new Date(post.pubDate);
        return !isNaN(d.getTime()) && d >= thirtyDaysAgo;
    });

    // 5. SEMANTIC DEDUPLICATION
    const uniquePosts = [];
    const seenTitles = new Set();
    const seenCVEs = new Set();

    for (const post of prunedPosts) {
        const titleNormalized = post.title.toLowerCase().replace(/\s+/g, '').trim();

        const cveMatch = post.title.match(/CVE-\d{4}-\d{4,7}/i);
        const cveId = cveMatch ? cveMatch[0].toUpperCase() : null;

        let isDuplicate = false;

        if (seenTitles.has(titleNormalized)) {
            isDuplicate = true;
        }

        if (cveId && seenCVEs.has(cveId)) {
            isDuplicate = true;
        }

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

    // 6. SORTING: Pinned posts first, then sort by date descending (newest first)
    uniquePosts.sort((a, b) => {
        if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
            return a.isPinned ? -1 : 1;
        }
        return new Date(b.pubDate) - new Date(a.pubDate);
    });

    // 7. STABLE IDs: Assign deterministic ID based on originalUrl/title so bookmarks and view counts persist across fetches
    const finalPosts = uniquePosts.map(post => ({
        ...post,
        id: (post.isCustom && post.id) ? post.id : generateStableId(post.originalUrl || post.title)
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
