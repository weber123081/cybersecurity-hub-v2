import cron from 'node-cron';
import { fetchAndSave } from './fetcher.js';

console.log(`[${new Date().toISOString()}] Initialize Cybersecurity Intelligence Scheduler...`);
console.log('The scraper will run automatically at 00:00, 06:00, 12:00, and 18:00 every day.');

// Schedule tasks to be run on the server.
// "0 0,6,12,18 * * *" -> Run at minute 0 past hour 0, 6, 12, and 18.
cron.schedule('0 0,6,12,18 * * *', async () => {
  console.log('--------------------------------------------------');
  console.log(`[${new Date().toISOString()}] [CRON] Triggering scheduled fetch...`);
  await fetchAndSave();
  console.log(`[${new Date().toISOString()}] [CRON] Fetch complete. Sleeping until next cycle.`);
  console.log('--------------------------------------------------');
});

// Optionally, run it once immediately on startup so data is fresh.
console.log(`[${new Date().toISOString()}] Running an initial fetch on startup...`);
fetchAndSave();
