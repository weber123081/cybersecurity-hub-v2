import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { fetchAndSave } from './fetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// 1. Middleware Stack (PRIORITY ORDER)
app.use(cors());
app.use(express.json());
app.use(express.json());
app.use(session({
    secret: 'cyber-super-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

const STATS_PATH = path.join(__dirname, 'data/stats.json');
const EMPLOYEES_PATH = path.join(__dirname, 'data/employees.json');

let employees = [];
try {
    if (fs.existsSync(EMPLOYEES_PATH)) {
        employees = JSON.parse(fs.readFileSync(EMPLOYEES_PATH, 'utf8'));
        console.log(`[INIT] Loaded ${employees.length} employee IP mappings.`);
    }
} catch (e) {
    console.error('Failed to load employee data:', e);
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

    // Find employee whose ipPatterns are contained within the visitor's IP
    const found = employees.find(emp =>
        emp.ipPatterns.some(pat => ip.includes(pat))
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
    console.log(`[API] Login: ${req.body.username}`);
    const { username, password } = req.body;
    if (username === 'admin' && password === '25692299') {
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
    let postCount = 0;
    try {
        const dataPath = path.join(__dirname, '../public/data/news.json');
        if (fs.existsSync(dataPath)) {
            postCount = JSON.parse(fs.readFileSync(dataPath, 'utf8')).length;
        }
    } catch (e) { }
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
        if (ip.startsWith('::ffff:')) ip = ip.substring(7);
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

// 5. Static File Protection & Serving
app.get('/admin.html', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (req.session && req.session.loggedIn) next();
    else res.redirect('/login.html');
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Admin Server: http://10.2.10.102:${PORT}/admin.html`);
    startScheduler();
});
