import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NEWS_PATH = path.join(__dirname, '../public/data/news.json');

// Helper: Escape HTML
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br/>');
}

// 1. Scoring & Extraction Helpers (identical to ReportModal logic)
function extractMaxCvss(text) {
    const scores = [];
    for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*\((?:Critical|High|Medium|Low)\)\s*CVSS/gi)) {
        const val = parseFloat(m[1]);
        if (val >= 1 && val <= 10) scores.push(val);
    }
    const cleaned = text
        .replace(/0\s*[至到~-]\s*10\s*分?/g, '')
        .replace(/CVSS\s*(?:v|version|:)?\s*[34]\.[01](\s*及\s*[34]\.[01])?/gi, 'CVSS')
        .replace(/CVSS\s*[34]\.x/gi, 'CVSS');
    for (const m of cleaned.matchAll(/CVSS[^。；\n]{0,25}?(10(?:\.0)?|[1-9]\.\d)/gi)) {
        const val = parseFloat(m[1]);
        if (val >= 1 && val <= 10) scores.push(val);
    }
    if (/CVSS[^。；\n]{0,15}?滿分|滿分(?:重大)?(?:資安)?漏洞/i.test(cleaned)) {
        scores.push(10.0);
    }
    return scores.length ? Math.max(...scores) : null;
}

function extractCves(text) {
    return [...new Set((text.match(/CVE-\d{4}-\d{4,7}/gi) || []).map(c => c.toUpperCase()))];
}

function extractSubjectKey(title) {
    const twMatch = (title || '').match(/^([^｜|]+)[｜|]([^-\s]+)/);
    if (twMatch) return twMatch[2].trim().toLowerCase();

    const knownEntities = [
        'fortinet', 'fortios', 'fortigate', 'ivanti', 'palo alto', 'pan-os',
        'cisco', 'microsoft', 'windows', 'exchange', 'sharepoint', 'outlook',
        'vmware', 'vcenter', 'esxi', 'apache', 'nginx', 'tomcat', 'activemq',
        'qnap', 'synology', 'asus', 'd-link', 'tp-link', 'zyxel', 'ios', 'chrome',
        'edge', 'firefox', 'safari', 'android', 'linux', 'macos', 'wordpress',
        'drupal', 'atlassian', 'confluence', 'jira', 'gitlab', 'github', 'zoom'
    ];
    const lower = (title || '').toLowerCase();
    for (const k of knownEntities) {
        if (lower.includes(k)) return k;
    }
    return '';
}

function evaluatePostSeverity(post) {
    const title = post.title || '';
    const content = post.content || '';
    const combined = `${title}\n${content}`;

    const isDailyDigest = /【資安日報】|資安日報：|資安一週|資安早報/.test(title);
    const cvss = extractMaxCvss(combined);
    const cves = extractCves(combined);

    let score = 50;
    if (cvss !== null) {
        if (cvss >= 9.8) score = 100;
        else if (cvss >= 9.0) score = 95;
        else if (cvss >= 8.5) score = 88;
        else if (cvss >= 7.5) score = 78;
        else score = 65;
    }

    if (/0-day|零時差|已遭利用|已知利用|在野利用|已出現攻擊|PoC已公開|積極利用/i.test(combined)) {
        score = Math.max(score, 96);
    }
    if (/遠端執行任意|RCE|任意程式碼|任意代碼|權限提升|身分驗證繞過|繞過驗證/i.test(combined)) {
        score = Math.max(score, 90);
    }

    if (isDailyDigest) {
        score = Math.min(score, 30);
    }

    return { cvss, cves, score, isDailyDigest };
}

function extractSection(content, keywords) {
    const pattern = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp('【(?:' + pattern + ')】\\s*([\\s\\S]*?)(?=\\n\\n【|$)');
    const m = content.match(regex);
    return m ? m[1].trim() : '';
}

function buildWeeklyRows(posts, maxCount = 10) {
    if (!Array.isArray(posts) || posts.length === 0) return [];

    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // 1. Filter posts: last 7 days + score posts
    let candidates = posts.map(post => {
        const meta = evaluatePostSeverity(post);
        return { post, meta };
    });

    // Exclude daily digests & low scores
    candidates = candidates.filter(x => !x.meta.isDailyDigest);

    // First try strictly last 7 days
    const weekOnly = candidates.filter(x => {
        const d = new Date(x.post.pubDate || x.post.timeAgo || 0);
        return !isNaN(d.getTime()) && d >= sevenDaysAgo;
    });

    // If week has at least 3 candidates, use weekOnly; else use recent severe items
    const pool = weekOnly.length >= 3 ? weekOnly : candidates;

    pool.sort((a, b) => b.meta.score - a.meta.score || new Date(b.post.pubDate || 0) - new Date(a.post.pubDate || 0));

    // Deduplication
    const seenCves = new Set();
    const seenSubjects = new Set();
    const rows = [];

    for (const item of pool) {
        const { post, meta } = item;
        const hasOverlappingCve = meta.cves.length > 0 && meta.cves.some(c => seenCves.has(c));
        const subjKey = extractSubjectKey(post.title);
        const hasSameSubject = subjKey && seenSubjects.has(subjKey);

        if (hasOverlappingCve || hasSameSubject) continue;

        meta.cves.forEach(c => seenCves.add(c));
        if (subjKey) seenSubjects.add(subjKey);

        const rawContent = (post.content || '').replace(/(\n\n\d{4}-\d{2}-\d{2})+$/, '').trim();
        const sentences = rawContent.split(/[。！？\n]+/).map(s => s.trim()).filter(s => s.length > 6);

        const collectDate = post.timeAgo || (post.pubDate ? post.pubDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
        let source = (post.authorName || post.author?.name || '資安情報').replace(/^資安情報\s*[·・-]\s*/, '').trim();

        const tags = [];
        if (meta.cvss !== null) tags.push(`CVSS ${meta.cvss.toFixed(1)}`);
        else if (meta.score >= 90) tags.push('重大高危');
        if (meta.cves.length > 0) tags.push(meta.cves.slice(0, 2).join('、'));
        const tagPrefix = tags.length > 0 ? `【${tags.join('｜')}】` : '';

        const twProblem = extractSection(rawContent, ['問題描述', '漏洞說明']);
        let descText = post.title || '';
        if (twProblem) descText = `${post.title}：${twProblem.replace(/\n+/g, ' ')}`;
        else if (sentences[0]) descText = `${sentences[0]}。`;

        const description = `${tagPrefix}${descText}`;

        const twProduct = extractSection(rawContent, ['影響產品']);
        let impact = '可能導致受影響系統遭未授權存取、植入惡意程式或機敏資料外洩。';
        if (twProduct) impact = `受影響產品：${twProduct.replace(/\n+/g, '、')}；可能導致攻擊者取得系統控制權限。`;
        else if (/遠端.*執行|RCE/i.test(rawContent)) impact = '攻擊者可遠端執行任意程式碼 (RCE) 並控制主機。';

        const twSolution = extractSection(rawContent, ['解決方法', '解決辦法']);
        let solution = twSolution ? twSolution.replace(/\n+/g, ' ') : '請儘速盤點內部設備版本並更新至原廠最新安全修補版本。';

        rows.push({
            id: post.id,
            collectDate,
            source,
            description,
            impact,
            solution,
            note: '經清查本單位未使用該產品，持續監控相關情資。'
        });

        if (rows.length >= maxCount) break;
    }

    return rows;
}

// 2. Generate Responsive HTML Email Template
export function generateWeeklyReportEmail(posts, config = {}) {
    const rows = buildWeeklyRows(posts, 10);
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

    const tableRowsHtml = rows.map((r, i) => `
        <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
            <td style="border: 1px solid #d1d5db; padding: 10px 8px; text-align: center; font-size: 13px; font-family: monospace; white-space: nowrap; vertical-align: top;">
                ${escapeHtml(r.collectDate)}
            </td>
            <td style="border: 1px solid #d1d5db; padding: 10px 8px; text-align: center; font-size: 13px; font-weight: bold; color: #4338ca; vertical-align: top;">
                ${escapeHtml(r.source)}
            </td>
            <td style="border: 1px solid #d1d5db; padding: 10px 12px; font-size: 13px; line-height: 1.5; color: #111827; vertical-align: top;">
                ${escapeHtml(r.description)}
            </td>
            <td style="border: 1px solid #d1d5db; padding: 10px 12px; font-size: 13px; line-height: 1.5; color: #b91c1c; vertical-align: top;">
                ${escapeHtml(r.impact)}
            </td>
            <td style="border: 1px solid #d1d5db; padding: 10px 12px; font-size: 13px; line-height: 1.5; color: #047857; vertical-align: top;">
                ${escapeHtml(r.solution)}
            </td>
            <td style="border: 1px solid #d1d5db; padding: 10px 8px; font-size: 12px; color: #4b5563; text-align: center; vertical-align: top;">
                ${escapeHtml(r.note)}
            </td>
        </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8">
        <title>生活資安觀測站 · 資安威脅情資週報</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: '微軟正黑體', 'Microsoft JhengHei', sans-serif;">
        <div style="max-width: 1000px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb;">
            <!-- Email Header -->
            <div style="background: linear-gradient(135deg, #1e1b4b, #312e81, #4338ca); padding: 24px 30px; color: #ffffff;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <h1 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">🛡️ 生活資安觀測站 · 資安威脅情資週報</h1>
                        <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.85;">本週重大高危資安漏洞預警、攻擊趨勢與因應處置指引</p>
                    </div>
                </div>
            </div>

            <!-- Metadata Strip -->
            <div style="background-color: #eef2ff; border-bottom: 1px solid #e0e7ff; padding: 12px 30px; font-size: 13px; color: #3730a3; display: flex; justify-content: space-between; align-items: center;">
                <span><strong>製表日期：</strong>${todayStr}</span>
                <span><strong>統計週期：</strong>過去 7 天重點情資</span>
                <span><strong>精選高危情資：</strong>${rows.length} 則</span>
            </div>

            <!-- Table Container -->
            <div style="padding: 24px 30px; overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #d1d5db; text-align: left;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="border: 1px solid #d1d5db; padding: 10px 8px; font-size: 13px; font-weight: bold; color: #374151; width: 10%; text-align: center;">搜集日期</th>
                            <th style="border: 1px solid #d1d5db; padding: 10px 8px; font-size: 13px; font-weight: bold; color: #374151; width: 12%; text-align: center;">搜集來源</th>
                            <th style="border: 1px solid #d1d5db; padding: 10px 12px; font-size: 13px; font-weight: bold; color: #374151; width: 26%;">威脅情資說明</th>
                            <th style="border: 1px solid #d1d5db; padding: 10px 12px; font-size: 13px; font-weight: bold; color: #374151; width: 22%;">可能之影響</th>
                            <th style="border: 1px solid #d1d5db; padding: 10px 12px; font-size: 13px; font-weight: bold; color: #374151; width: 20%;">因應方案</th>
                            <th style="border: 1px solid #d1d5db; padding: 10px 8px; font-size: 13px; font-weight: bold; color: #374151; width: 10%; text-align: center;">備註</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Email Footer -->
            <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 30px; font-size: 12px; color: #6b7280; line-height: 1.6;">
                <p style="margin: 0;"><strong>📢 資安通報窗口：</strong>內網資安專線分機 #1199 ｜ 警政署反詐專線 165</p>
                <p style="margin: 4px 0 0;">本週報由「生活資安觀測站」系統定時排程自動彙整發送。如內部有使用上述涉及漏洞之產品，請權責工程師儘速評估並套用修補更新。</p>
            </div>
        </div>
    </body>
    </html>
    `;

    // CSV Attachment Content
    const headers = ['搜集日期', '搜集來源', '威脅情資說明', '可能之影響', '因應方案', '備註'];
    const escapeCsv = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
    const lines = [
        `"製表日期：${todayStr}（資安威脅情資週報）","","","","",""`,
        headers.map(escapeCsv).join(','),
        ...rows.map(r => [r.collectDate, r.source, r.description, r.impact, r.solution, r.note].map(escapeCsv).join(','))
    ];
    const csvContent = '\ufeff' + lines.join('\r\n');

    return {
        subject: `【資安威脅情資週報】${todayStr} 本週重大高危預警與因應指引 (${rows.length} 則)`,
        html,
        rows,
        csvContent
    };
}

// 3. Send Email Function
export async function sendWeeklyEmail(options = {}) {
    const {
        smtpHost,
        smtpPort = 587,
        smtpSecure = false,
        smtpUser,
        smtpPass,
        senderName = '生活資安觀測站 · 資安小組',
        senderEmail,
        recipients,
        attachCsv = true
    } = options;

    if (!smtpHost || !recipients) {
        throw new Error('請填寫 SMTP 伺服器主機與收件人 Email');
    }

    // Load news posts
    let posts = [];
    if (fs.existsSync(NEWS_PATH)) {
        posts = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
    }

    const report = generateWeeklyReportEmail(posts, options);

    // Create transporter with proper SSL / STARTTLS negotiation
    const port = parseInt(smtpPort) || 587;
    // Port 465 is direct SSL/TLS socket wrapper (secure: true).
    // Port 587 & 25 use STARTTLS or cleartext handshake (secure MUST be false in Nodemailer,
    // otherwise OpenSSL throws 'wrong version number' because server greets in cleartext SMTP).
    let isSecure = false;
    if (port === 465) {
        isSecure = true;
    } else if (port === 587 || port === 25) {
        isSecure = false;
    } else {
        isSecure = Boolean(smtpSecure);
    }

    console.log(`[MAILER] Connecting to SMTP ${smtpHost}:${port} (secure: ${isSecure}, user: ${smtpUser ? smtpUser : 'none'})...`);

    const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: port,
        secure: isSecure,
        auth: (smtpUser && smtpPass) ? {
            user: smtpUser,
            pass: smtpPass
        } : undefined,
        tls: {
            rejectUnauthorized: false
        }
    });

    const parsedRecipients = String(recipients)
        .split(/[,;\n]+/)
        .map(s => s.trim())
        .filter(Boolean);

    if (parsedRecipients.length === 0) {
        throw new Error('未提供有效的收件人郵箱地址');
    }

    const fromAddress = senderEmail ? `"${senderName}" <${senderEmail}>` : `"${senderName}" <security-report@cyberhub.local>`;

    const mailOptions = {
        from: fromAddress,
        to: parsedRecipients.join(', '),
        subject: report.subject,
        html: report.html,
        attachments: []
    };

    if (attachCsv) {
        mailOptions.attachments.push({
            filename: `資安威脅情資週報_${new Date().toISOString().slice(0, 10)}.csv`,
            content: report.csvContent,
            contentType: 'text/csv; charset=utf-8'
        });
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`[MAILER] Weekly report sent successfully to ${parsedRecipients.length} recipients: ${info.messageId}`);

    return {
        success: true,
        messageId: info.messageId,
        recipientCount: parsedRecipients.length,
        rowsCount: report.rows.length
    };
}
