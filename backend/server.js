import express from 'express';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { fetchAndSave } from './fetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// State management for the dashboard
let isFetching = false;
let lastFetchTime = null;
let scheduledTask = null;
let isSchedulerActive = true;

// Serve static files from backend/public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Initialize Scheduler
function startScheduler() {
    if (scheduledTask) return;
    scheduledTask = cron.schedule('0 0,6,12,18 * * *', async () => {
        console.log(`[CRON] Triggering scheduled fetch...`);
        await performFetch();
    });
    isSchedulerActive = true;
    console.log('[CRON] Scheduler activated (Runs at 00:00, 06:00, 12:00, 18:00).');
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
        return { success: true, message: 'Fetch completed successfully.' };
    } catch (error) {
        console.error('Fetch failed:', error);
        return { success: false, message: 'Fetch failed: ' + error.message };
    } finally {
        isFetching = false;
    }
}

// API Endpoints
app.get('/api/status', (req, res) => {
    // Read the current local JSON to get the post count
    let postCount = 0;
    try {
        const dataPath = path.join(__dirname, '../public/data/news.json');
        if (fs.existsSync(dataPath)) {
            const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
            postCount = data.length;
        }
    } catch (e) {
        // ignore
    }

    res.json({
        isFetching,
        lastFetchTime,
        isSchedulerActive,
        postCount
    });
});

app.post('/api/fetch', async (req, res) => {
    if (isFetching) {
        return res.status(429).json({ success: false, message: 'Fetch is already running.' });
    }
    
    // Start fetch asynchronously and immediately return success to avoid browser timeout
    performFetch();
    res.json({ success: true, message: 'Fetch started in the background.' });
});

app.post('/api/scheduler/toggle', (req, res) => {
    if (isSchedulerActive) {
        stopScheduler();
    } else {
        startScheduler();
    }
    res.json({ success: true, isSchedulerActive });
});

app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`Admin Control Panel running at http://localhost:${PORT}/admin.html`);
    console.log(`=========================================`);
    startScheduler();
    
    // Initial fetch on startup
    performFetch();
});
