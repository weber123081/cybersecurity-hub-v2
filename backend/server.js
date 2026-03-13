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
app.use(session({
    secret: 'cyber-super-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

const STATS_PATH = path.join(__dirname, 'data/stats.json');

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
    } catch (e) {}
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
    
    // Deduplication: Only increment if not already marked in this session
    if (!req.session.hasMarkedVisit) {
        console.log(`[API] New unique hit from ${req.ip}`);
        stats.totalViews += 1;
        req.session.hasMarkedVisit = true;
        
        stats.logs.unshift({
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
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
    res.json({ totalViews: getStats().totalViews });
});

app.get('/api/admin/visitors', requireAuth, (req, res) => {
    res.json({ logs: getStats().logs });
});

// 5. Static File Protection & Serving
app.get('/admin.html', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    if (req.session && req.session.loggedIn) next();
    else res.redirect('/login.html');
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Admin Server: http://localhost:${PORT}/admin.html`);
    startScheduler();
});
