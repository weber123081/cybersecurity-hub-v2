import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { fetchAndSave, getSources, saveSources, testSourceUrl, generateStableId, requestAbortFetch } from './fetcher.js';
import { sendWeeklyEmail, generateWeeklyReportEmail } from './mailer.js';
import { buildReportRows, buildThreatReportRowsAsync } from './threat-analyzer.js';
import { testGeminiApiKey, getAiCacheStats, clearAiCache, getAiCache, saveAiCache, analyzePostWithGemini } from './gemini-analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '25692299';
const SESSION_SECRET = process.env.SESSION_SECRET || 'cyber-super-secret-key-2026';

// Global error handlers to keep the server resilient and perpetually running
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err);
    try {
        recordActivity({
            type: 'SYSTEM',
            category: '系統異常',
            action: '程式發生未捕捉例外 (Uncaught Exception)',
            details: String(err?.stack || err?.message || err),
            status: 'ERROR'
        });
    } catch (_) {}
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Promise Rejection at:', promise, 'reason:', reason);
    try {
        recordActivity({
            type: 'SYSTEM',
            category: '系統異常',
            action: '非同步例外未捕捉 (Unhandled Rejection)',
            details: String(reason?.stack || reason?.message || reason),
            status: 'WARNING'
        });
    } catch (_) {}
});

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
const SYSTEM_LOGS_PATH = path.join(__dirname, 'data/system_logs.json');
const LOGS_DIR = path.join(__dirname, 'data/logs');
const ACTIVITY_LOG_FILE = path.join(LOGS_DIR, 'server_activity.log');
const EMPLOYEES_PATH = path.join(__dirname, 'data/employees.json');
const NEWS_PATH = path.join(__dirname, '../public/data/news.json');
const SITE_CONFIG_PATH = path.join(__dirname, 'data/site-config.json');
const DICTIONARY_PATH = path.join(__dirname, '../public/data/dictionary.json');
const REPORT_DRAFT_PATH = path.join(__dirname, 'data/report-draft.json');

const DEFAULT_SITE_CONFIG = {
    announcement: {
        enabled: true,
        title: "資訊安全防護宣導：",
        content: "近期針對內部企業之社交工程釣魚信件頻傳，請全體同仁切勿點擊不明郵件附件或短網址，發現異常請即刻通報資訊單位！"
    },
    hotlines: [
        { id: "hotline-1", name: "內網資安專線", val: "分機 #1199", icon: "fa-shield-virus" },
        { id: "hotline-2", name: "警政署反詐專線", val: "直撥 165", icon: "fa-user-shield" }
    ],
    schedule: {
        intervalHours: 6
    },
    emailWeeklyReport: {
        enabled: false,
        scheduleDay: 1,
        scheduleHour: 9,
        scheduleMinute: 0,
        smtpHost: "",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "",
        smtpPass: "",
        senderName: "生活資安觀測站 · 資安小組",
        senderEmail: "",
        recipients: "",
        attachCsv: true,
        customSubject: "【資安情報】生活資安觀測站 · {reportTitle} ({reportDate})",
        customIntro: "各位長官與同仁好：\n本報告由生活資安觀測站智慧彙整近期資安威脅情資。已過濾重複項目並依威脅嚴重程度加權排序，提供具備實務參考價值之影響分析、防護因應步驟與處置備註。請資訊與維運同仁依建議因應方案啟動內部資產清查與安全防護作業。",
        customFooter: "生活資安觀測站 · 資安情報分析小組 製作 ｜ 本信件為系統自動彙整派發，若有資安疑慮請即刻通報內部資安專線",
        lastSentTime: null,
        lastSentStatus: null
    },
    ai: {
        enabled: true,
        apiKey: "",
        model: "gemini-2.5-flash"
    }
};

function getSiteConfig() {
    try {
        if (!fs.existsSync(SITE_CONFIG_PATH)) {
            const dir = path.dirname(SITE_CONFIG_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(DEFAULT_SITE_CONFIG, null, 2), 'utf8');
            return DEFAULT_SITE_CONFIG;
        }
        return JSON.parse(fs.readFileSync(SITE_CONFIG_PATH, 'utf8'));
    } catch (e) {
        console.error('getSiteConfig error:', e);
        return DEFAULT_SITE_CONFIG;
    }
}

function saveSiteConfig(cfg) {
    try {
        const dir = path.dirname(SITE_CONFIG_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
        console.error('saveSiteConfig error:', e);
    }
}

function getDictionary() {
    try {
        if (!fs.existsSync(DICTIONARY_PATH)) return [];
        return JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf8'));
    } catch (e) {
        console.error('getDictionary error:', e);
        return [];
    }
}

function saveDictionary(dict) {
    try {
        const dir = path.dirname(DICTIONARY_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(dict, null, 2), 'utf8');
    } catch (e) {
        console.error('saveDictionary error:', e);
    }
}

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

// Stats & Persistent Logging Helper Functions
function ensureLogsDir() {
    if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
}

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

function getSystemLogs() {
    try {
        if (!fs.existsSync(SYSTEM_LOGS_PATH)) {
            const dir = path.dirname(SYSTEM_LOGS_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(SYSTEM_LOGS_PATH, JSON.stringify([], null, 2), 'utf8');
            return [];
        }
        return JSON.parse(fs.readFileSync(SYSTEM_LOGS_PATH, 'utf8'));
    } catch (e) {
        console.error('getSystemLogs error:', e);
        return [];
    }
}

function saveSystemLogs(logs) {
    try {
        const dir = path.dirname(SYSTEM_LOGS_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const trimmed = Array.isArray(logs) ? logs.slice(0, 2000) : [];
        fs.writeFileSync(SYSTEM_LOGS_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save system logs:', e);
    }
}

function appendActivityFileLog(entry) {
    try {
        ensureLogsDir();
        const dateStr = new Date(entry.timestamp).toLocaleString('zh-TW', { hour12: false });
        const line = `[${dateStr}] [${entry.type}] IP: ${entry.ip || 'unknown'}${entry.employeeName ? ` (${entry.employeeName})` : ''} | User: ${entry.user || '-'} | ${entry.action || ''}${entry.details ? ` | ${entry.details}` : ''}\n`;
        fs.appendFileSync(ACTIVITY_LOG_FILE, line, 'utf8');
    } catch (e) {
        console.error('appendActivityFileLog error:', e);
    }
}

function recordActivity({
    type = 'SYSTEM',
    category = '系統運作',
    user = '-',
    ip = '127.0.0.1',
    employeeName = null,
    action = '',
    details = '',
    status = 'success'
}) {
    try {
        let cleanIp = ip;
        if (typeof cleanIp === 'string') {
            if (cleanIp.includes(',')) cleanIp = cleanIp.split(',')[0].trim();
            if (cleanIp.startsWith('::ffff:')) cleanIp = cleanIp.substring(7);
            if (cleanIp === '::1') cleanIp = '127.0.0.1';
        }

        const empName = employeeName || matchEmployee(cleanIp) || (cleanIp === '127.0.0.1' ? '測試管理員 (本機)' : '外部訪客');
        const now = new Date();
        const entry = {
            id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: now.toISOString(),
            type,
            category,
            user,
            ip: cleanIp,
            employeeName: empName,
            action,
            details,
            status
        };

        // 1. Append to flat log file (survives restarts)
        appendActivityFileLog(entry);

        // 2. Prepend to persistent JSON logs
        const logs = getSystemLogs();
        logs.unshift(entry);
        saveSystemLogs(logs);

        // 3. Print clean log to console
        console.log(`[ACTIVITY][${type}] ${cleanIp} (${empName}): ${action}`);

        return entry;
    } catch (e) {
        console.error('recordActivity error:', e);
    }
}

function refreshVisitorLogNames() {
    const stats = getStats();
    if (Array.isArray(stats.logs)) {
        stats.logs = stats.logs.map(log => ({
            ...log,
            employeeName: matchEmployee(log.ip) || (log.ip === '127.0.0.1' ? '測試管理員 (本機)' : '外部訪客')
        }));
        saveStats(stats);
    }
    const sysLogs = getSystemLogs();
    if (Array.isArray(sysLogs)) {
        let changed = false;
        sysLogs.forEach(log => {
            const matched = matchEmployee(log.ip);
            if (matched && matched !== log.employeeName) {
                log.employeeName = matched;
                changed = true;
            }
        });
        if (changed) saveSystemLogs(sysLogs);
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
function getCronExprForInterval(hours) {
    const h = parseInt(hours) || 6;
    if (h === 1) return '0 * * * *';
    if (h === 24) return '0 2 * * *';
    return `0 */${h} * * *`;
}

function startScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
    const cfg = getSiteConfig();
    const intervalHours = (cfg.schedule && cfg.schedule.intervalHours) || 6;
    const cronExpr = getCronExprForInterval(intervalHours);
    console.log(`[CRON] Setting up scheduler with pattern: ${cronExpr} (every ${intervalHours} hours)`);
    scheduledTask = cron.schedule(cronExpr, async () => {
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

function restartSchedulerWithInterval(hours) {
    const cfg = getSiteConfig();
    if (!cfg.schedule) cfg.schedule = {};
    cfg.schedule.intervalHours = parseInt(hours) || 6;
    saveSiteConfig(cfg);
    if (isSchedulerActive) {
        startScheduler();
    }
}

let weeklyEmailTask = null;
function setupWeeklyEmailScheduler() {
    if (weeklyEmailTask) {
        weeklyEmailTask.stop();
        weeklyEmailTask = null;
    }
    const cfg = getSiteConfig();
    const emailCfg = cfg.emailWeeklyReport;
    if (!emailCfg || !emailCfg.enabled) {
        console.log('[MAIL-CRON] Weekly email report schedule is disabled.');
        return;
    }
    const day = emailCfg.scheduleDay !== undefined ? emailCfg.scheduleDay : 1;
    const hour = emailCfg.scheduleHour !== undefined ? emailCfg.scheduleHour : 9;
    const minute = emailCfg.scheduleMinute !== undefined ? emailCfg.scheduleMinute : 0;

    const cronPattern = `${minute} ${hour} * * ${day}`;
    console.log(`[MAIL-CRON] Scheduling weekly report email: ${cronPattern} (Day: ${day}, Time: ${hour}:${minute})`);

    weeklyEmailTask = cron.schedule(cronPattern, async () => {
        console.log('[MAIL-CRON] Triggering scheduled weekly report email dispatch...');
        try {
            const res = await sendWeeklyEmail(emailCfg);
            emailCfg.lastSentTime = new Date().toISOString();
            emailCfg.lastSentStatus = `成功發送至 ${res.recipientCount} 位收件人 (${res.rowsCount} 則情資)`;
            saveSiteConfig(cfg);
            recordActivity({
                type: 'EMAIL_AUTO',
                category: '郵件派發',
                user: '系統自動排程',
                action: '定時自動發送週報郵件成功',
                details: `成功寄送至 ${res.recipientCount} 位收件人 (${res.rowsCount} 則情資)`,
                status: 'success'
            });
        } catch (e) {
            console.error('[MAIL-CRON] Failed to send scheduled weekly report:', e.message);
            emailCfg.lastSentTime = new Date().toISOString();
            emailCfg.lastSentStatus = `發送失敗: ${e.message}`;
            saveSiteConfig(cfg);
            recordActivity({
                type: 'EMAIL_AUTO',
                category: '郵件派發',
                user: '系統自動排程',
                action: '定時自動發送週報郵件失敗',
                details: e.message,
                status: 'error'
            });
        }
    });
}

async function performFetch() {
    if (isFetching) return { success: false, message: 'Fetch already in progress.' };
    isFetching = true;
    try {
        await fetchAndSave();
        lastFetchTime = new Date().toISOString();
        recordActivity({
            type: 'FETCH_DATA',
            category: '系統維護',
            user: '情資搜集引擎',
            action: '完成資安情報抓取與更新',
            details: `最新情資總數: ${getPosts().length} 則`,
            status: 'success'
        });
        return { success: true };
    } catch (error) {
        console.error('Fetch failed:', error);
        recordActivity({
            type: 'FETCH_DATA',
            category: '系統維護',
            user: '情資搜集引擎',
            action: '情報抓取失敗',
            details: error.message,
            status: 'error'
        });
        return { success: false, error: error.message };
    } finally {
        isFetching = false;
    }
}

// 4. API Routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const clientIp = req.body.simIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[API] Login attempt: ${username} from ${clientIp}`);
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.loggedIn = true;
        recordActivity({
            type: 'LOGIN_SUCCESS',
            category: '認證登入',
            user: username,
            ip: clientIp,
            action: '管理員登入成功',
            details: '成功驗證進入管理員控制台',
            status: 'success'
        });
        req.session.save(() => res.json({ success: true }));
    } else {
        recordActivity({
            type: 'LOGIN_FAIL',
            category: '認證登入',
            user: username || '(未提供)',
            ip: clientIp,
            action: '管理員登入失敗',
            details: '帳號或密碼輸入錯誤',
            status: 'error'
        });
        res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    }
});

app.post('/api/logout', (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[API] Logout from ${clientIp}`);
    recordActivity({
        type: 'LOGOUT',
        category: '認證登入',
        user: ADMIN_USER,
        ip: clientIp,
        action: '管理員登出',
        details: '已主動登出後台管理系統',
        status: 'info'
    });
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

app.get('/api/status', requireAuth, (req, res) => {
    const postCount = getPosts().length;
    const cfg = getSiteConfig();
    const scheduleInterval = (cfg.schedule && cfg.schedule.intervalHours) || 6;
    res.json({ isFetching, lastFetchTime, isSchedulerActive, postCount, scheduleInterval });
});

app.post('/api/fetch', requireAuth, (req, res) => {
    if (isFetching) {
        return res.json({ success: false, message: '爬蟲任務正在執行中' });
    }
    performFetch();
    res.json({ success: true });
});

app.post(['/api/fetch/abort', '/api/admin/fetch/abort'], requireAuth, (req, res) => {
    requestAbortFetch();
    isFetching = false;
    console.log('[SERVER] Fetch process aborted by user.');
    res.json({ success: true, message: '已成功中止爬蟲抓取任務！' });
});

app.post('/api/scheduler/toggle', requireAuth, (req, res) => {
    if (isSchedulerActive) stopScheduler();
    else startScheduler();
    res.json({ success: true, isSchedulerActive });
});

// Site Public Configuration (Announcement banner & Hotlines)
app.get('/api/site/config', (req, res) => {
    const cfg = getSiteConfig();
    res.json({
        success: true,
        announcement: cfg.announcement,
        hotlines: cfg.hotlines
    });
});

// Admin Site Configuration API (Announcement, Hotlines, Schedule)
app.get('/api/admin/site-config', requireAuth, (req, res) => {
    res.json({ success: true, config: getSiteConfig() });
});

app.put('/api/admin/site-config', requireAuth, (req, res) => {
    const current = getSiteConfig();
    const { announcement, hotlines, schedule } = req.body || {};

    if (announcement) {
        current.announcement = {
            enabled: Boolean(announcement.enabled),
            title: String(announcement.title || '').trim(),
            content: String(announcement.content || '').trim()
        };
    }
    if (Array.isArray(hotlines)) {
        current.hotlines = hotlines.map((h, i) => ({
            id: h.id || `hotline-${i + 1}`,
            name: String(h.name || '').trim(),
            val: String(h.val || '').trim(),
            icon: String(h.icon || 'fa-phone-volume').trim()
        })).filter(h => h.name && h.val);
    }
    if (schedule && schedule.intervalHours) {
        current.schedule = {
            intervalHours: parseInt(schedule.intervalHours) || 6
        };
        restartSchedulerWithInterval(current.schedule.intervalHours);
    }
    saveSiteConfig(current);
    res.json({ success: true, config: current });
});

// Dictionary & Daily Tips Management API
app.get('/api/admin/dictionary', requireAuth, (req, res) => {
    res.json({ success: true, dictionary: getDictionary() });
});

app.post('/api/admin/dictionary', requireAuth, (req, res) => {
    const { term, definition, tips } = req.body || {};
    if (!term || !term.trim() || !definition || !definition.trim()) {
        return res.status(400).json({ success: false, message: '術語名稱與定義不能為空' });
    }
    const dict = getDictionary();
    const newId = dict.length > 0 ? Math.max(...dict.map(d => Number(d.id) || 0)) + 1 : 1;
    const parsedTips = Array.isArray(tips)
        ? tips.map(t => String(t).trim()).filter(Boolean)
        : String(tips || '').split('\n').map(t => t.trim()).filter(Boolean);

    const newEntry = {
        id: newId,
        term: term.trim(),
        definition: definition.trim(),
        tips: parsedTips
    };
    dict.push(newEntry);
    saveDictionary(dict);
    res.json({ success: true, dictionary: dict, entry: newEntry });
});

app.put('/api/admin/dictionary/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const { term, definition, tips } = req.body || {};
    const dict = getDictionary();
    const idx = dict.findIndex(d => Number(d.id) === id);
    if (idx === -1) {
        return res.status(404).json({ success: false, message: '找不到該辭典術語' });
    }
    if (term && term.trim()) dict[idx].term = term.trim();
    if (definition && definition.trim()) dict[idx].definition = definition.trim();
    if (tips !== undefined) {
        dict[idx].tips = Array.isArray(tips)
            ? tips.map(t => String(t).trim()).filter(Boolean)
            : String(tips || '').split('\n').map(t => t.trim()).filter(Boolean);
    }
    saveDictionary(dict);
    res.json({ success: true, dictionary: dict, entry: dict[idx] });
});

app.delete('/api/admin/dictionary/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const dict = getDictionary();
    const filtered = dict.filter(d => Number(d.id) !== id);
    if (filtered.length === dict.length) {
        return res.status(404).json({ success: false, message: '找不到該辭典術語' });
    }
    saveDictionary(filtered);
    res.json({ success: true, dictionary: filtered });
});

// Weekly Auto-Email Dispatcher Management APIs
app.get('/api/admin/email-config', requireAuth, (req, res) => {
    const cfg = getSiteConfig();
    res.json({ success: true, emailConfig: cfg.emailWeeklyReport || {} });
});

app.put('/api/admin/email-config', requireAuth, (req, res) => {
    const cfg = getSiteConfig();
    cfg.emailWeeklyReport = {
        ...cfg.emailWeeklyReport,
        ...req.body
    };
    saveSiteConfig(cfg);
    setupWeeklyEmailScheduler();
    recordActivity({
        type: 'CONFIG_CHANGE',
        category: '系統設定',
        user: ADMIN_USER,
        ip: req.socket.remoteAddress,
        action: '修改每週自動寄送週報設定',
        details: `排程: 星期${cfg.emailWeeklyReport.scheduleDay} ${cfg.emailWeeklyReport.scheduleHour}:00 | 啟用: ${cfg.emailWeeklyReport.enabled ? '是' : '否'} | 收件人數: ${String(cfg.emailWeeklyReport.recipients || '').split(/[,;\n]+/).filter(Boolean).length}`,
        status: 'success'
    });
    res.json({ success: true, emailConfig: cfg.emailWeeklyReport });
});

app.post('/api/admin/email-config/preview', requireAuth, (req, res) => {
    try {
        const { customSubject, customIntro, customFooter, period = 'week' } = req.body || {};
        const posts = getPosts();
        const report = generateWeeklyReportEmail(posts, {
            period,
            customSubject,
            customIntro,
            customFooter
        });
        res.json({ success: true, subject: report.subject, html: report.html, rowsCount: report.rows.length });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

function formatSmtpErrorMessage(err) {
    const msg = (err && err.message) ? err.message : String(err);
    if (/wrong version number|ssl3_get_record/i.test(msg)) {
        return 'SSL/TLS 協定版本不匹配 (wrong version number)！\n【原因】：在 Port 587 或 Port 25 上開啟了「強制 SSL/TLS」，或是將連線導向了非 SSL 協定的埠號。\n【解決方法】：\n1. 若使用 Port 587 (Office 365 / Gmail 等)，請【取消勾選】「強制 SSL/TLS」（系統會透過標準 STARTTLS 自動加密）。\n2. 若需強制直連 SSL，請將連接埠改為【465】。\n3. 若使用企業內網 Relay (Port 25)，請【取消勾選】「強制 SSL/TLS」且密碼留空。';
    }
    if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
        return '連線失敗 (' + (err.code || 'TIMEOUT') + ')：無法連線至指定的 SMTP 伺服器主機與埠號，請確認主機名稱是否正確，或公司防火牆是否阻擋該 SMTP 連接埠。';
    }
    if (/Invalid login|authentication failed|535|Username and Password not accepted/i.test(msg)) {
        return 'SMTP 認證失敗：帳號或密碼錯誤。\n提示：若使用 Gmail 請務必至 Google 帳戶產生「應用程式專用密碼」；若使用 Office 365 請確認是否有開啟 SMTP AUTH 權限。';
    }
    return msg;
}

app.post('/api/admin/email-config/test', requireAuth, async (req, res) => {
    try {
        const testOptions = req.body || {};
        console.log(`[API] Testing email dispatch to: ${testOptions.recipients} via ${testOptions.smtpHost}:${testOptions.smtpPort}`);
        const result = await sendWeeklyEmail(testOptions);
        recordActivity({
            type: 'EMAIL_TEST',
            category: '郵件派發',
            user: ADMIN_USER,
            ip: req.socket.remoteAddress,
            action: '測試郵件發送成功',
            details: `寄至: ${testOptions.recipients} | 情資數: ${result.rowsCount} | Message ID: ${result.messageId}`,
            status: 'success'
        });
        res.json({
            success: true,
            message: `測試郵件發送成功！已寄出包含 ${result.rowsCount} 則高危情報之週報 (Message ID: ${result.messageId})`,
            result
        });
    } catch (e) {
        console.error('[API] Test email failed:', e.message);
        recordActivity({
            type: 'EMAIL_TEST',
            category: '郵件派發',
            user: ADMIN_USER,
            ip: req.socket.remoteAddress,
            action: '測試郵件發送失敗',
            details: e.message,
            status: 'error'
        });
        res.status(400).json({
            success: false,
            message: '測試郵件寄送失敗：' + formatSmtpErrorMessage(e)
        });
    }
});

app.post('/api/admin/email-config/send-now', requireAuth, async (req, res) => {
    const cfg = getSiteConfig();
    const emailCfg = cfg.emailWeeklyReport;
    if (!emailCfg || !emailCfg.smtpHost || !emailCfg.recipients) {
        return res.status(400).json({ success: false, message: '尚未設定 SMTP 伺服器主機或收件人信箱' });
    }
    try {
        const result = await sendWeeklyEmail(emailCfg);
        emailCfg.lastSentTime = new Date().toISOString();
        emailCfg.lastSentStatus = `手動立即發送成功 (${result.recipientCount} 位收件人，${result.rowsCount} 則情資)`;
        saveSiteConfig(cfg);
        recordActivity({
            type: 'EMAIL_SEND',
            category: '郵件派發',
            user: ADMIN_USER,
            ip: req.socket.remoteAddress,
            action: '手動立即發送週報郵件成功',
            details: `成功寄送至 ${result.recipientCount} 位收件人 (${result.rowsCount} 則情資)`,
            status: 'success'
        });
        res.json({ success: true, message: '已成功發送週報！', result });
    } catch (e) {
        const friendlyMsg = formatSmtpErrorMessage(e);
        emailCfg.lastSentTime = new Date().toISOString();
        emailCfg.lastSentStatus = `發送失敗: ${e.message}`;
        saveSiteConfig(cfg);
        recordActivity({
            type: 'EMAIL_SEND',
            category: '郵件派發',
            user: ADMIN_USER,
            ip: req.socket.remoteAddress,
            action: '手動立即發送週報郵件失敗',
            details: e.message,
            status: 'error'
        });
        res.status(400).json({ success: false, message: '發送失敗：' + friendlyMsg });
    }
});


// ==========================================
// Admin Threat Report Center APIs (週報 / 月報彙整中心)
// ==========================================
app.get('/api/admin/reports/generate', requireAuth, async (req, res) => {
    try {
        const period = req.query.period || 'week'; // 'week' | 'month'
        const maxCount = parseInt(req.query.maxCount) || 10;
        const cveOnly = req.query.cveOnly === 'true';
        const highSeverityOnly = req.query.highSeverityOnly === 'true';
        const deduplicate = req.query.deduplicate !== 'false';
        const excludeDigest = req.query.excludeDigest !== 'false';
        const useAi = req.query.useAi !== 'false';

        const cfg = getSiteConfig();
        const apiKey = cfg.ai?.apiKey || process.env.GEMINI_API_KEY || '';
        const aiEnabled = (cfg.ai?.enabled !== false) && !!apiKey;
        const model = cfg.ai?.model || 'gemini-3.5-flash';

        let posts = [];
        if (fs.existsSync(NEWS_PATH)) {
            posts = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
        }

        const rows = await buildThreatReportRowsAsync(posts, {
            period,
            maxCount,
            cveOnly,
            highSeverityOnly,
            deduplicate,
            excludeDigest,
            useAi: useAi && aiEnabled,
            apiKey,
            model
        });

        const aiGeneratedCount = rows.filter(r => r.isAiGenerated).length;
        const ruleBasedCount = rows.length - aiGeneratedCount;

        res.json({
            success: true,
            period,
            reportDate: new Date().toISOString().slice(0, 10),
            aiUsed: aiEnabled && useAi,
            aiStats: {
                total: rows.length,
                aiGeneratedCount,
                ruleBasedCount
            },
            rows
        });
    } catch (e) {
        console.error('[API] Failed to generate report:', e);
        res.status(500).json({ success: false, message: '產出報表資料失敗: ' + e.message });
    }
});

// 單筆情資一鍵重新請求 Gemini AI 深度思考
app.post('/api/admin/ai/re-analyze', requireAuth, async (req, res) => {
    try {
        const { id, title, content } = req.body;
        const cfg = getSiteConfig();
        const apiKey = cfg.ai?.apiKey || process.env.GEMINI_API_KEY;
        const model = cfg.ai?.model || 'gemini-3.5-flash';

        if (!apiKey) {
            return res.status(400).json({ success: false, message: '尚未設定 Gemini API Key，無法進行 AI 研判' });
        }

        const cache = getAiCache();
        const cacheKey = String(id || title);
        delete cache[cacheKey];
        saveAiCache(cache);

        let post = { id, title, content };
        if (!content && fs.existsSync(NEWS_PATH)) {
            const posts = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
            const found = posts.find(p => p.id === id);
            if (found) post = found;
        }

        console.log(`[Gemini AI] 單筆重新研判要求：${post.title}`);
        const result = await analyzePostWithGemini(post, apiKey, model);
        if (!result) {
            return res.status(500).json({ success: false, message: 'Gemini AI 分析失敗或未回傳有效結果' });
        }

        res.json({
            success: true,
            message: 'AI 重新研判完成！',
            row: {
                id,
                description: result.description || post.title,
                impact: result.impact,
                solution: result.solution,
                isAiGenerated: true,
                aiModel: result.model || model,
                analyzedAt: result.analyzedAt
            }
        });
    } catch (e) {
        console.error('[API] re-analyze error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// Gemini AI Config & Cache APIs
app.get('/api/admin/ai/config', requireAuth, (req, res) => {
    const cfg = getSiteConfig();
    const apiKey = cfg.ai?.apiKey || process.env.GEMINI_API_KEY || '';
    const stats = getAiCacheStats();
    res.json({
        success: true,
        enabled: cfg.ai?.enabled ?? true,
        hasApiKey: !!apiKey,
        maskedKey: apiKey ? (apiKey.slice(0, 6) + '...' + apiKey.slice(-4)) : '',
        model: cfg.ai?.model || 'gemini-3.5-flash',
        cacheStats: stats
    });
});

app.post('/api/admin/ai/config', requireAuth, (req, res) => {
    const { enabled, apiKey, model } = req.body;
    const cfg = getSiteConfig();
    if (!cfg.ai) cfg.ai = {};
    if (typeof enabled === 'boolean') cfg.ai.enabled = enabled;
    if (typeof apiKey === 'string') {
        cfg.ai.apiKey = apiKey.trim();
    }
    if (model) cfg.ai.model = model;
    saveSiteConfig(cfg);
    res.json({ success: true, message: 'Gemini AI 設定已儲存' });
});

app.post('/api/admin/ai/test', requireAuth, async (req, res) => {
    try {
        const cfg = getSiteConfig();
        const apiKey = req.body.apiKey || cfg.ai?.apiKey || process.env.GEMINI_API_KEY;
        const model = req.body.model || cfg.ai?.model || 'gemini-3.5-flash';
        if (!apiKey) {
            return res.status(400).json({ success: false, message: '尚未填寫 Gemini API Key' });
        }
        const result = await testGeminiApiKey(apiKey, model);
        
        if (result.activeModel) {
            if (!cfg.ai) cfg.ai = {};
            cfg.ai.model = result.activeModel;
            saveSiteConfig(cfg);
        }

        res.json({ 
            success: true, 
            message: '連線驗證成功！', 
            reply: result.reply,
            activeModel: result.activeModel,
            availableModels: result.availableModels
        });
    } catch (e) {
        res.status(400).json({ success: false, message: e.message });
    }
});

app.post('/api/admin/ai/clear-cache', requireAuth, (req, res) => {
    clearAiCache();
    res.json({ success: true, message: 'AI 研判快取已成功清空！' });
});

app.get('/api/admin/reports/draft', requireAuth, (req, res) => {
    if (fs.existsSync(REPORT_DRAFT_PATH)) {
        try {
            const draft = JSON.parse(fs.readFileSync(REPORT_DRAFT_PATH, 'utf8'));
            return res.json({ success: true, draft });
        } catch (e) {}
    }
    res.json({ success: true, draft: null });
});

app.post('/api/admin/reports/draft', requireAuth, (req, res) => {
    try {
        const draft = req.body || {};
        fs.writeFileSync(REPORT_DRAFT_PATH, JSON.stringify(draft, null, 2), 'utf8');
        res.json({ success: true, message: '報表草稿已成功保存！' });
    } catch (e) {
        res.status(500).json({ success: false, message: '儲存草稿失敗: ' + e.message });
    }
});

app.post('/api/admin/reports/send-email', requireAuth, async (req, res) => {
    const { period, reportDate, rows, recipients, subject, attachCsv, customSubject, customIntro, customFooter } = req.body || {};
    const cfg = getSiteConfig();
    const emailCfg = cfg.emailWeeklyReport || {};
    if (!emailCfg.smtpHost) {
        return res.status(400).json({ success: false, message: '請先至「每週自動寄週報」分頁設定 SMTP 伺服器資訊' });
    }
    const targetRecipients = recipients || emailCfg.recipients;
    if (!targetRecipients) {
        return res.status(400).json({ success: false, message: '請填寫收件人 Email 信箱' });
    }
    try {
        const isMonth = period === 'month';
        const reportTitle = isMonth ? '高危資安威脅情資月報' : '資安威脅情資週報';
        const finalSubject = subject || customSubject || emailCfg.customSubject || `【資安情報】生活資安觀測站 · ${reportTitle} (${reportDate || new Date().toISOString().slice(0, 10)})`;
        
        const result = await sendWeeklyEmail({
            ...emailCfg,
            recipients: targetRecipients,
            period: period || 'week',
            reportDate: reportDate,
            customRows: rows,
            attachCsv: attachCsv !== undefined ? attachCsv : true,
            customSubject: finalSubject,
            customIntro: customIntro !== undefined ? customIntro : emailCfg.customIntro,
            customFooter: customFooter !== undefined ? customFooter : emailCfg.customFooter
        });

        recordActivity({
            type: 'EMAIL_SEND',
            category: '郵件派發',
            user: ADMIN_USER,
            ip: req.socket.remoteAddress,
            action: `彙整中心派發${reportTitle}成功`,
            details: `寄至: ${targetRecipients} | 情資筆數: ${result.rowsCount} | Message ID: ${result.messageId}`,
            status: 'success'
        });

        res.json({ success: true, message: `已成功發送報表至 ${result.recipientCount} 位收件人！`, result });
    } catch (e) {
        recordActivity({
            type: 'EMAIL_SEND',
            category: '郵件派發',
            user: ADMIN_USER,
            ip: req.socket.remoteAddress,
            action: '彙整中心派發報表郵件失敗',
            details: e.message,
            status: 'error'
        });
        res.status(400).json({ success: false, message: '寄送失敗：' + formatSmtpErrorMessage(e) });
    }
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
    recordActivity({
        type: 'POST_MANAGE',
        category: '內容管理',
        user: ADMIN_USER,
        ip: req.socket.remoteAddress,
        action: `發布新內部公告 [${newPost.title.slice(0, 30)}]`,
        details: `分類: ${category} | 置頂: ${newPost.isPinned ? '是' : '否'}`,
        status: 'success'
    });
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
    recordActivity({
        type: 'POST_MANAGE',
        category: '內容管理',
        user: ADMIN_USER,
        ip: req.socket.remoteAddress,
        action: `${posts[idx].isPinned ? '置頂' : '取消置頂'}文章 [${posts[idx].title.slice(0, 30)}]`,
        details: `文章 ID #${postId}`,
        status: 'info'
    });
    res.json({ success: true, posts, isPinned: posts[idx].isPinned });
});

app.delete('/api/admin/posts/:id', requireAuth, (req, res) => {
    const postId = Number(req.params.id);
    const posts = getPosts();
    const targetPost = posts.find(p => Number(p.id) === postId);
    const filtered = posts.filter(p => Number(p.id) !== postId);
    if (filtered.length === posts.length) {
        return res.status(404).json({ success: false, message: '找不到該篇文章' });
    }
    savePosts(filtered);
    recordActivity({
        type: 'POST_MANAGE',
        category: '內容管理',
        user: ADMIN_USER,
        ip: req.socket.remoteAddress,
        action: `刪除文章 [${targetPost ? targetPost.title.slice(0, 30) : `ID #${postId}`}]`,
        details: `文章 ID #${postId}`,
        status: 'warning'
    });
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

// Analytics & Activity Logging
app.post('/api/stats/hit', (req, res) => {
    const stats = getStats();

    // Update Online Status
    if (req.sessionID) {
        onlineUsers.set(req.sessionID, Date.now());
    }

    let ip = req.body.simIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Handle x-forwarded-for list (take first one)
    if (typeof ip === 'string' && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }

    // Normalize IPv6 mapping to IPv4 and handle '::1' for local dev
    if (ip && ip.startsWith('::ffff:')) ip = ip.substring(7);
    if (ip === '::1') ip = '127.0.0.1';

    const employeeName = matchEmployee(ip) || (ip === '127.0.0.1' ? '測試管理員 (本機)' : '外部訪客');

    // Deduplication for unique counter per session
    const isNewSession = !req.session.hasMarkedVisit;
    if (isNewSession) {
        stats.totalViews = (stats.totalViews || 0) + 1;
        req.session.hasMarkedVisit = true;
    }

    // Always persist to stats.logs
    stats.logs.unshift({
        ip: ip,
        employeeName: employeeName,
        timestamp: new Date().toISOString()
    });
    if (stats.logs.length > 500) stats.logs.pop();
    saveStats(stats);

    // Record persistent activity log
    recordActivity({
        type: 'VISIT',
        category: '網站瀏覽',
        user: '前台訪客',
        ip: ip,
        employeeName: employeeName,
        action: '瀏覽生活資安觀測站首頁',
        details: isNewSession ? `新進站訪客 (累計總瀏覽數: ${stats.totalViews})` : '同工作階段瀏覽/重新整理',
        status: 'success'
    });

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

    let ip = req.body.simIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (typeof ip === 'string' && ip.includes(',')) ip = ip.split(',')[0].trim();
    if (ip && ip.startsWith('::ffff:')) ip = ip.substring(7);
    if (ip === '::1') ip = '127.0.0.1';

    const employeeName = matchEmployee(ip) || (ip === '127.0.0.1' ? '測試管理員 (本機)' : '外部訪客');
    const posts = getPosts();
    const foundPost = posts.find(p => String(p.id) === String(id));
    const title = foundPost ? foundPost.title : `情資 ID #${id}`;

    recordActivity({
        type: 'ARTICLE_VIEW',
        category: '文章閱覽',
        user: '前台訪客',
        ip: ip,
        employeeName: employeeName,
        action: `閱覽資安情報 [${title.slice(0, 32)}${title.length > 32 ? '...' : ''}]`,
        details: `累計閱覽: ${stats.postViews[id]} 次 ｜ 來源: ${foundPost?.source || '外部情資'}`,
        status: 'info'
    });

    res.json({ success: true, count: stats.postViews[id] });
});

// Visitors & Unified Persistent Activity Logs APIs
app.get('/api/admin/visitors', requireAuth, (req, res) => {
    let { startDate, endDate, page, limit } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 15;
    if (page < 1) page = 1;

    let logs = getStats().logs;

    if (startDate || endDate) {
        logs = logs.filter(log => {
            const logDate = new Date(log.timestamp);
            if (startDate && logDate < new Date(startDate)) return false;
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

app.get('/api/admin/logs', requireAuth, (req, res) => {
    let { startDate, endDate, page, limit, type, category, keyword } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 15;
    if (page < 1) page = 1;

    let logs = getSystemLogs();

    if (type && type !== 'ALL') {
        logs = logs.filter(l => l.type === type);
    }
    if (category && category !== 'ALL') {
        logs = logs.filter(l => l.category === category);
    }
    if (keyword && keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        logs = logs.filter(l =>
            (l.ip && l.ip.toLowerCase().includes(kw)) ||
            (l.employeeName && l.employeeName.toLowerCase().includes(kw)) ||
            (l.user && l.user.toLowerCase().includes(kw)) ||
            (l.action && l.action.toLowerCase().includes(kw)) ||
            (l.details && l.details.toLowerCase().includes(kw))
        );
    }
    if (startDate || endDate) {
        logs = logs.filter(log => {
            const logDate = new Date(log.timestamp);
            if (startDate && logDate < new Date(startDate)) return false;
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
        success: true,
        logs: paginatedLogs,
        totalCount,
        totalPages,
        currentPage: page,
        fileLogPath: ACTIVITY_LOG_FILE
    });
});

app.get('/api/admin/logs/export', requireAuth, (req, res) => {
    const logs = getSystemLogs();
    const csvHeader = '\uFEFF時間,類型,分類,人員/對象,來源IP,操作者,事件動作,詳細內容,狀態\n';
    const csvRows = logs.map(l => {
        const clean = str => `"${String(str || '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
        const timeStr = new Date(l.timestamp).toLocaleString('zh-TW', { hour12: false });
        return [
            clean(timeStr),
            clean(l.type),
            clean(l.category),
            clean(l.employeeName),
            clean(l.ip),
            clean(l.user),
            clean(l.action),
            clean(l.details),
            clean(l.status)
        ].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cyberhub_activity_logs_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvHeader + csvRows);
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
    setupWeeklyEmailScheduler();
});
