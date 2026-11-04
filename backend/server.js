import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { fetchAndSave, getSources, saveSources, testSourceUrl, generateStableId } from './fetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '25692299';
const SESSION_SECRET = process.env.SESSION_SECRET || 'cyber-super-secret-key-2026';

// 1. Middleware Stack (PRIORITY ORDER)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

const STATS_PATH = path.join(__dirname, 'data/stats.json');
const EMPLOYEES_PATH = path.join(__dirname, 'data/employees.json');
const NEWS_PATH = path.join(__dirname, '../public/data/news.json');

const DEFAULT_EMPLOYEES = [
    { id: 'emp-admin-lan', name: '資訊中心 (內網管理段)', ipPatterns: ['10.2.10.'] },
    { id: 'emp-local-subnet', name: '內部辦公網段', ipPatterns: ['192.168.0.'] }
];

function parseRawEmployeeText(content) {
    const trimmed = String(content || '').trim();
    if (!trimmed) return [];

    // 1. Check if JSON array
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                return parsed
                    .filter(emp => emp && emp.name && Array.isArray(emp.ipPatterns) && emp.ipPatterns.length > 0)
                    .map((emp, idx) => ({
                        id: emp.id || `emp-import-${Date.now()}-${idx + 1}`,
                        name: String(emp.name).trim(),
                        ipPatterns: emp.ipPatterns.map(s => String(s).trim()).filter(Boolean)
                    }));
            }
        } catch (e) {
            // Fall through to line-by-line parsing
        }
    }

    // 2. Parse 員工資料表.txt format:
    // [-o-];   [00001];     [Ht@54321];  [沈國榮{總裁}];       [{2.10.21}];             [david-shen];
    const lines = trimmed.split(/\r?\n/);
    const employees = [];
    lines.forEach((line, idx) => {
        const match = line.match(/\[.*?\];\s*\[.*?\];\s*\[.*?\];\s*\[(.*?)\];\s*\[(.*?)\];\s*\[(.*?)\];/);
        if (match) {
            const name = match[1].trim();
            const rawIpKeys = match[2].trim();
            const ipPatterns = [];
            const ipMatches = rawIpKeys.matchAll(/\{(.*?)\}/g);
            for (const m of ipMatches) {
                const rawIp = m[1].trim();
                if (!rawIp) continue;
                const original = rawIp.startsWith('10.') || rawIp.startsWith('192.') || rawIp.startsWith('172.')
                    ? rawIp
                    : '10.' + rawIp;
                ipPatterns.push(original);

                // Create 10.x.106.y variant ONLY for 10.x.8.y subnet (per parse-employees.js)
                const segments = original.split('.');
                if (segments.length === 4 && segments[2] === '8') {
                    const variant = `${segments[0]}.${segments[1]}.106.${segments[3]}`;
                    ipPatterns.push(variant);
                }
            }
            if (name && ipPatterns.length > 0) {
                employees.push({
                    id: `emp-import-${Date.now()}-${idx + 1}`,
                    name,
                    ipPatterns
                });
            }
        }
    });

    return employees;
}

const CANDIDATE_TXT_PATHS = [
    'D:\\Users\\User\\Downloads\\員工資料表 (1).txt',
    'D:\\Users\\User\\Downloads\\員工資料表.txt',
    'C:\\Users\\User\\Downloads\\員工資料表 (1).txt',
    'C:\\Users\\User\\Downloads\\員工資料表.txt',
    path.join(__dirname, 'data/員工資料表 (1).txt'),
    path.join(__dirname, 'data/員工資料表.txt')
];

function tryAutoImportFromDisk() {
    for (const candidate of CANDIDATE_TXT_PATHS) {
        try {
            if (fs.existsSync(candidate)) {
                const content = fs.readFileSync(candidate, 'utf8');
                const imported = parseRawEmployeeText(content);
                if (imported.length > 0) {
                    console.log(`[INIT] Auto-imported ${imported.length} employees from ${candidate}`);
                    saveEmployees(imported);
                    return imported;
                }
            }
        } catch (e) {
            // Ignore inaccessible drives
        }
    }
    return null;
}

function getEmployees() {
    try {
        if (!fs.existsSync(EMPLOYEES_PATH)) {
            const autoImported = tryAutoImportFromDisk();
            if (autoImported) return autoImported;
            const dir = path.dirname(EMPLOYEES_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(EMPLOYEES_PATH, JSON.stringify(DEFAULT_EMPLOYEES, null, 2), 'utf8');
            return DEFAULT_EMPLOYEES;
        }
        const parsed = JSON.parse(fs.readFileSync(EMPLOYEES_PATH, 'utf8'));
        if (Array.isArray(parsed) && parsed.length <= 2 && parsed[0]?.id === 'emp-admin-lan') {
            const autoImported = tryAutoImportFromDisk();
            if (autoImported) return autoImported;
        }
        return Array.isArray(parsed) ? parsed.map((emp, idx) => ({
            id: emp.id || `emp-${idx + 1}`,
            name: emp.name || '',
            ipPatterns: Array.isArray(emp.ipPatterns) ? emp.ipPatterns : []
        })) : DEFAULT_EMPLOYEES;
    } catch (e) {
        console.error('Failed to load employee data:', e);
        return DEFAULT_EMPLOYEES;
    }
}

function saveEmployees(list) {
    try {
        const dir = path.dirname(EMPLOYEES_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(EMPLOYEES_PATH, JSON.stringify(list, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save employees.json:', e);
    }
}

// Analytics State
const onlineUsers = new Map(); // sessionId -> lastSeen

// Periodic cleanup of inactive users (e.g., every 1 minute)
setInterval(() => {
    const now = Date.now();
    for (const [sid, lastSeen] of onlineUsers.entries()) {
        if (now - lastSeen > 5 * 60 * 1000) { // 5 minutes inactivity
            onlineUsers.delete(sid);
        }
    }
}, 60000);

function matchEmployee(ip) {
    if (!ip) return null;
    if (ip === '::1' || ip === '127.0.0.1') return "測試管理員 (本機)";

    const employees = getEmployees();
    const found = employees.find(emp =>
        Array.isArray(emp.ipPatterns) && emp.ipPatterns.some(pat => pat && ip.includes(pat))
    );
    return found ? found.name : null;
}

// Stats Helper Functions
function getStats() {
    try {
        if (!fs.existsSync(STATS_PATH)) {
            const initial = { totalViews: 0, logs: [] };
            if (!fs.existsSync(path.dirname(STATS_PATH))) {
                fs.mkdirSync(path.dirname(STATS_PATH), { recursive: true });
            }
            fs.writeFileSync(STATS_PATH, JSON.stringify(initial));
            return initial;
        }
        return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
    } catch (e) {
        console.error('getStats error:', e);
        return { totalViews: 0, logs: [] };
    }
}

function saveStats(stats) {
    try {
        fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
    } catch (e) {
        console.error('Failed to save stats:', e);
    }
}

function refreshVisitorLogNames() {
    const stats = getStats();
    if (Array.isArray(stats.logs)) {
        stats.logs = stats.logs.map(log => ({
            ...log,
            employeeName: matchEmployee(log.ip) || '外部訪客'
        }));
        saveStats(stats);
    }
}

// News Helper Functions
function getPosts() {
    try {
        if (!fs.existsSync(NEWS_PATH)) return [];
        return JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
    } catch (e) {
        console.error('Failed to read news.json:', e);
        return [];
    }
}

function savePosts(posts) {
    const dir = path.dirname(NEWS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Ensure pinned posts stay on top
    posts.sort((a, b) => {
        if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
            return a.isPinned ? -1 : 1;
        }
        return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
    });
    fs.writeFileSync(NEWS_PATH, JSON.stringify(posts, null, 2), 'utf8');
}

const categoryIconMap = {
    '系統弱點': 'fa-bug',
    '詐騙防範': 'fa-user-ninja',
    '密碼與帳號': 'fa-key',
    '網路與隱私': 'fa-lock',
    '手機安全': 'fa-mobile-screen',
    '軟體安全': 'fa-virus',
    '新興技術': 'fa-robot',
    '綜合動態': 'fa-shield-halved'
};

// Global State
let isFetching = false;
let lastFetchTime = null;
let scheduledTask = null;
let isSchedulerActive = true;

// 2. Auth Middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.loggedIn) {
        next();
    } else {
        console.log(`[AUTH] Blocked unauthorized request to ${req.path}`);
        res.status(401).json({ success: false, message: '未授權，請先登入' });
    }
}

// 3. Status/Fetch Logic
function startScheduler() {
    if (scheduledTask) return;
    scheduledTask = cron.schedule('0 0,6,12,18 * * *', async () => {
        console.log(`[CRON] Triggering scheduled fetch...`);
        await performFetch();
    });
    isSchedulerActive = true;
    console.log('[CRON] Scheduler activated.');
}

function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
    isSchedulerActive = false;
    console.log('[CRON] Scheduler stopped.');
}

async function performFetch() {
    if (isFetching) return { success: false, message: 'Fetch already in progress.' };
    isFetching = true;
    try {
        await fetchAndSave();
        lastFetchTime = new Date().toISOString();
        return { success: true };
    } catch (error) {
        console.error('Fetch failed:', error);
        return { success: false, error: error.message };
    } finally {
        isFetching = false;
    }
}

// 4. API Routes
app.post('/api/login', (req, res) => {
    console.log(`[API] Login attempt: ${req.body.username}`);
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.loggedIn = true;
        req.session.save(() => res.json({ success: true }));
    } else {
        res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    }
});

app.post('/api/logout', (req, res) => {
    console.log(`[API] Logout`);
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

app.get('/api/status', requireAuth, (req, res) => {
    const postCount = getPosts().length;
    res.json({ isFetching, lastFetchTime, isSchedulerActive, postCount });
});

app.post('/api/fetch', requireAuth, (req, res) => {
    performFetch();
    res.json({ success: true });
});

app.post('/api/scheduler/toggle', requireAuth, (req, res) => {
    if (isSchedulerActive) stopScheduler();
    else startScheduler();
    res.json({ success: true, isSchedulerActive });
});

// RSS Sources Management API
app.get('/api/admin/sources', requireAuth, (req, res) => {
    res.json({ success: true, sources: getSources() });
});

app.post('/api/admin/sources/test', requireAuth, async (req, res) => {
    const { url } = req.body;
    if (!url || !url.trim()) {
        return res.status(400).json({ success: false, message: '請提供 RSS 網址' });
    }
    try {
        const info = await testSourceUrl(url.trim());
        res.json({
            success: true,
            message: `連線成功！共解析到 ${info.itemCount} 篇文章${info.latestItemTitle ? `（最新：${info.latestItemTitle}）` : ''}`,
            info
        });
    } catch (e) {
        res.status(400).json({
            success: false,
            message: `無法解析 RSS 網址：${e.message}`
        });
    }
});

app.post('/api/admin/sources', requireAuth, (req, res) => {
    const { name, url, foreign = false, enabled = true } = req.body;
    if (!name || !name.trim() || !url || !url.trim()) {
        return res.status(400).json({ success: false, message: '網站名稱與 RSS 網址不能為空' });
    }
    const sources = getSources();
    const newSource = {
        id: 'src-' + Date.now(),
        name: name.trim(),
        url: url.trim(),
        foreign: Boolean(foreign),
        enabled: Boolean(enabled)
    };
    sources.push(newSource);
    saveSources(sources);
    res.json({ success: true, sources, source: newSource });
});

app.put('/api/admin/sources/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { name, url, foreign, enabled } = req.body;
    const sources = getSources();
    const idx = sources.findIndex(s => s.id === id);
    if (idx === -1) {
        return res.status(404).json({ success: false, message: '找不到該爬蟲來源' });
    }
    if (typeof name === 'string' && name.trim()) sources[idx].name = name.trim();
    if (typeof url === 'string' && url.trim()) sources[idx].url = url.trim();
    if (typeof foreign === 'boolean') sources[idx].foreign = foreign;
    if (typeof enabled === 'boolean') sources[idx].enabled = enabled;

    saveSources(sources);
    res.json({ success: true, sources, source: sources[idx] });
});

app.delete('/api/admin/sources/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const sources = getSources();
    const filtered = sources.filter(s => s.id !== id);
    if (filtered.length === sources.length) {
        return res.status(404).json({ success: false, message: '找不到該爬蟲來源' });
    }
    saveSources(filtered);
    res.json({ success: true, sources: filtered });
});

// Custom Internal Announcements & Posts Management API (Item 2)
app.get('/api/admin/posts', requireAuth, (req, res) => {
    res.json({ success: true, posts: getPosts() });
});

app.post('/api/admin/posts', requireAuth, (req, res) => {
    const { title, content, category = '綜合動態', authorName = '內部資安通報 · 資訊中心', isPinned = true } = req.body;
    if (!title || !title.trim() || !content || !content.trim()) {
        return res.status(400).json({ success: false, message: '公告標題與內容不能為空' });
    }
    const posts = getPosts();
    const now = new Date();
    const newPost = {
        id: generateStableId('custom-' + Date.now() + '-' + title.trim()),
        authorName: authorName.trim() || '內部資安通報 · 資訊中心',
        authorIcon: categoryIconMap[category] || 'fa-bullhorn',
        category,
        timeAgo: now.toISOString().split('T')[0],
        title: title.trim(),
        content: content.trim(),
        pubDate: now.toISOString(),
        isCustom: true,
        isPinned: Boolean(isPinned)
    };
    posts.unshift(newPost);
    savePosts(posts);
    res.json({ success: true, posts, post: newPost });
});

app.put('/api/admin/posts/:id/pin', requireAuth, (req, res) => {
    const postId = Number(req.params.id);
    const posts = getPosts();
    const idx = posts.findIndex(p => Number(p.id) === postId);
    if (idx === -1) {
        return res.status(404).json({ success: false, message: '找不到該篇文章' });
    }
    const nextPinned = (req.body && typeof req.body.isPinned === 'boolean')
        ? req.body.isPinned
        : !posts[idx].isPinned;
    posts[idx].isPinned = Boolean(nextPinned);
    savePosts(posts);
    res.json({ success: true, posts, isPinned: posts[idx].isPinned });
});

app.delete('/api/admin/posts/:id', requireAuth, (req, res) => {
    const postId = Number(req.params.id);
    const posts = getPosts();
    const filtered = posts.filter(p => Number(p.id) !== postId);
    if (filtered.length === posts.length) {
        return res.status(404).json({ success: false, message: '找不到該篇文章' });
    }
    savePosts(filtered);
    res.json({ success: true, posts: filtered });
});

// Employee / Department IP Mapping API (Item 3)
app.get('/api/admin/employees', requireAuth, (req, res) => {
    res.json({ success: true, employees: getEmployees() });
});

app.post('/api/admin/employees', requireAuth, (req, res) => {
    const { name, ipPatterns } = req.body;
    const parsedPatterns = Array.isArray(ipPatterns)
        ? ipPatterns.map(s => String(s).trim()).filter(Boolean)
        : String(ipPatterns || '').split(',').map(s => s.trim()).filter(Boolean);

    if (!name || !name.trim() || parsedPatterns.length === 0) {
        return res.status(400).json({ success: false, message: '請填寫部門/員工名稱與至少一組 IP 規則' });
    }
    const list = getEmployees();
    const newEmp = {
        id: 'emp-' + Date.now(),
        name: name.trim(),
        ipPatterns: parsedPatterns
    };
    list.push(newEmp);
    saveEmployees(list);
    refreshVisitorLogNames();
    res.json({ success: true, employees: list, employee: newEmp });
});

app.put('/api/admin/employees/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const { name, ipPatterns } = req.body;
    const list = getEmployees();
    const idx = list.findIndex(e => e.id === id);
    if (idx === -1) {
        return res.status(404).json({ success: false, message: '找不到該筆 IP 對照設定' });
    }
    const parsedPatterns = Array.isArray(ipPatterns)
        ? ipPatterns.map(s => String(s).trim()).filter(Boolean)
        : String(ipPatterns || '').split(',').map(s => s.trim()).filter(Boolean);

    if (name && name.trim()) list[idx].name = name.trim();
    if (parsedPatterns.length > 0) list[idx].ipPatterns = parsedPatterns;

    saveEmployees(list);
    refreshVisitorLogNames();
    res.json({ success: true, employees: list, employee: list[idx] });
});

app.delete('/api/admin/employees/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const list = getEmployees();
    const filtered = list.filter(e => e.id !== id);
    if (filtered.length === list.length) {
        return res.status(404).json({ success: false, message: '找不到該筆 IP 對照設定' });
    }
    saveEmployees(filtered);
    refreshVisitorLogNames();
    res.json({ success: true, employees: filtered });
});

app.post('/api/admin/employees/import', requireAuth, (req, res) => {
    const { rawText, mode = 'replace' } = req.body || {};
    const parsed = parseRawEmployeeText(rawText);
    if (parsed.length === 0) {
        return res.status(400).json({
            success: false,
            message: '未解析出任何有效的員工 IP 資料，請確認檔案格式為「員工資料表.txt」或「employees.json」格式'
        });
    }
    let finalList = parsed;
    if (mode === 'merge') {
        const existing = getEmployees();
        finalList = [...existing, ...parsed];
    }
    saveEmployees(finalList);
    refreshVisitorLogNames();
    res.json({
        success: true,
        importedCount: parsed.length,
        employees: finalList,
        message: `成功匯入 ${parsed.length} 筆員工 IP 對照資料！`
    });
});

// Analytics
app.post('/api/stats/hit', (req, res) => {
    const stats = getStats();

    // Update Online Status
    if (req.sessionID) {
        onlineUsers.set(req.sessionID, Date.now());
    }

    // Re-enabled deduplication to prevent refresh spamming
    if (!req.session.hasMarkedVisit) {
        console.log(`[API] New unique hit from ${req.ip}`);
        stats.totalViews += 1;
        req.session.hasMarkedVisit = true;

        let ip = req.body.simIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Handle x-forwarded-for list (take first one)
        if (typeof ip === 'string' && ip.includes(',')) {
            ip = ip.split(',')[0].trim();
        }

        // Normalize IPv6 mapping to IPv4 and handle '::1' for local dev
        if (ip && ip.startsWith('::ffff:')) ip = ip.substring(7);
        if (ip === '::1') ip = '127.0.0.1';

        const employeeName = matchEmployee(ip);
        console.log(`[API] New Hit - IP: ${ip}, Remote: ${req.socket.remoteAddress}, X-Fwd: ${req.headers['x-forwarded-for']}`);
        console.log(`[API] Matching: ${ip} -> ${employeeName || 'No Match'}`);

        stats.logs.unshift({
            ip: ip,
            employeeName: employeeName || '外部訪客',
            timestamp: new Date().toISOString()
        });
        if (stats.logs.length > 100) stats.logs.pop();
        saveStats(stats);
    } else {
        console.log(`[API] Repeat hit from ${req.ip} (Ignored)`);
    }

    res.json({ success: true, totalViews: stats.totalViews });
});

app.get('/api/stats/summary', (req, res) => {
    const stats = getStats();
    res.json({
        totalViews: stats.totalViews,
        onlineCount: onlineUsers.size,
        postViews: stats.postViews || {}
    });
});

app.post('/api/stats/post-view/:id', (req, res) => {
    const { id } = req.params;
    const stats = getStats();
    if (!stats.postViews) stats.postViews = {};
    stats.postViews[id] = (stats.postViews[id] || 0) + 1;
    saveStats(stats);
    res.json({ success: true, count: stats.postViews[id] });
});

app.get('/api/admin/visitors', requireAuth, (req, res) => {
    let { startDate, endDate, page, limit } = req.query;

    // Sanitize and provide defaults
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    if (page < 1) page = 1;

    let logs = getStats().logs;

    // Filter by date range if provided
    if (startDate || endDate) {
        logs = logs.filter(log => {
            const logDate = new Date(log.timestamp);
            if (startDate && logDate < new Date(startDate)) return false;
            // Add 1 day to endDate to include the entire end day
            if (endDate) {
                const end = new Date(endDate);
                end.setDate(end.getDate() + 1);
                if (logDate >= end) return false;
            }
            return true;
        });
    }

    const totalCount = logs.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedLogs = logs.slice(startIndex, startIndex + limit);

    res.json({
        logs: paginatedLogs,
        totalCount,
        totalPages,
        currentPage: page
    });
});

// 5. Static File Protection & Single-Port Serving (Item 4)
app.get('/admin.html', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (req.session && req.session.loggedIn) next();
    else res.redirect('/login.html');
});

// Serve admin static files (/admin.html, /login.html)
app.use(express.static(path.join(__dirname, 'public')));

// Serve public data (/data/news.json, /data/dictionary.json)
app.use(express.static(path.join(__dirname, '../public')));

// Serve built Vue frontend (dist/) if available for single-port production deployment
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(['/', '/dictionary', '/lab'], (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Admin Server: http://localhost:${PORT}/admin.html`);
    if (fs.existsSync(distPath)) {
        console.log(`Unified Frontend + Backend Server: http://localhost:${PORT}/`);
    }
    startScheduler();
});
