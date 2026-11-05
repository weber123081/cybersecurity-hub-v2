// backend/mailer.js
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildReportRows } from './threat-analyzer.js';

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

// Generate Responsive HTML Email Template (supports week & month, supports customRows)
export function generateWeeklyReportEmail(posts, config = {}) {
    const period = config.period || 'week';
    const isMonth = period === 'month';
    const reportTitle = isMonth ? '高危資安威脅情資月報' : '資安威脅情資週報';
    const periodDesc = isMonth ? '過去 30 天高危重大漏洞與資安情報' : '過去 7 天資安威脅情報精選彙整';

    const rows = (Array.isArray(config.customRows) && config.customRows.length > 0)
        ? config.customRows
        : buildReportRows(posts, { period, maxCount: config.maxCount || 10 });

    const todayStr = (config.reportDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '/');

    const tableRowsHtml = rows.map((r, i) => `
        <tr style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
            <td style="border: 1px solid #d1d5db; padding: 10px 8px; text-align: center; font-size: 13px; font-family: monospace; white-space: nowrap; vertical-align: top;">
                ${escapeHtml(r.collectDate)}
            </td>
            <td style="border: 1px solid #d1d5db; padding: 10px 8px; text-align: center; font-size: 13px; font-weight: bold; color: #4338ca; vertical-align: top; white-space: nowrap;">
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
            <td style="border: 1px solid #d1d5db; padding: 10px 8px; font-size: 12px; color: #4b5563; vertical-align: top;">
                ${escapeHtml(r.note)}
            </td>
        </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html lang="zh-TW">
    <head>
        <meta charset="UTF-8">
        <title>生活資安觀測站 · ${reportTitle}</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: '微軟正黑體', 'Microsoft JhengHei', sans-serif;">
        <div style="max-width: 1100px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e5e7eb;">
            <!-- Email Header -->
            <div style="background: linear-gradient(135deg, #1e1b4b, #312e81, #4338ca); padding: 24px 30px; color: #ffffff;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <h1 style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 0.5px;">🛡️ 生活資安觀測站 · ${reportTitle}</h1>
                        <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.85;">
                            彙整日期：<span style="font-family: monospace; font-weight: bold;">${todayStr}</span> ｜ 週期類別：<strong>${isMonth ? '30 天月報' : '7 天週報'}</strong> ｜ 收錄情資：<strong>${rows.length}</strong> 則精選項目
                        </p>
                    </div>
                </div>
            </div>

            <!-- Briefing Intro -->
            <div style="padding: 16px 30px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #475569; line-height: 1.6;">
                <p style="margin: 0;">
                    各位長官與同仁好：<br/>
                    本報告由<strong>生活資安觀測站</strong>智慧彙整${periodDesc}。已過濾重複項目並依威脅嚴重程度（CVSS / 0-day 在野利用）加權排序，提供具備實務參考價值之影響分析、防護因應步驟與處置備註。請資訊與維運同仁依建議因應方案啟動內部資產清查與安全防護作業。
                </p>
            </div>

            <!-- Table Container -->
            <div style="padding: 24px 30px; overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #d1d5db; background-color: #ffffff;">
                    <thead>
                        <tr style="background-color: #1e1b4b; color: #ffffff; font-size: 13px;">
                            <th style="border: 1px solid #374151; padding: 10px 8px; width: 100px; text-align: center;">搜集日期</th>
                            <th style="border: 1px solid #374151; padding: 10px 8px; width: 110px; text-align: center;">搜集來源</th>
                            <th style="border: 1px solid #374151; padding: 10px 12px; width: 260px; text-align: left;">威脅情資說明</th>
                            <th style="border: 1px solid #374151; padding: 10px 12px; width: 200px; text-align: left;">可能之影響</th>
                            <th style="border: 1px solid #374151; padding: 10px 12px; width: 230px; text-align: left;">因應方案</th>
                            <th style="border: 1px solid #374151; padding: 10px 8px; width: 180px; text-align: left;">備註</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Email Footer -->
            <div style="background-color: #f8fafc; padding: 16px 30px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #6b7280; text-align: center; line-height: 1.5;">
                生活資安觀測站 · 資安情報分析小組 製作 ｜ 本信件為系統自動彙整派發，若有資安疑慮請即刻通報內部資安專線
            </div>
        </div>
    </body>
    </html>
    `;

    // Generate CSV (UTF-8 with BOM)
    const csvHeader = '\uFEFF搜集日期,搜集來源,威脅情資說明,可能之影響,因應方案,備註\n';
    const csvRows = rows.map(r => {
        const clean = str => `"${String(str || '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
        return [
            clean(r.collectDate),
            clean(r.source),
            clean(r.description),
            clean(r.impact),
            clean(r.solution),
            clean(r.note)
        ].join(',');
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    return {
        html,
        csvContent,
        rows,
        subject: `【資安情報】生活資安觀測站 · ${reportTitle} (${todayStr})`
    };
}

// 3. Send Email Function via Nodemailer
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
        attachCsv = true,
        period = 'week',
        customRows = null
    } = options;

    if (!smtpHost || !recipients) {
        throw new Error('請填寫 SMTP 伺服器主機與收件人 Email');
    }

    // Load news posts
    let posts = [];
    if (fs.existsSync(NEWS_PATH)) {
        posts = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
    }

    const report = generateWeeklyReportEmail(posts, {
        period,
        customRows,
        ...options
    });

    // Create transporter with proper SSL / STARTTLS negotiation
    const port = parseInt(smtpPort) || 587;
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
        const filePrefix = period === 'month' ? '高危資安威脅情資月報' : '資安威脅情資週報';
        mailOptions.attachments.push({
            filename: `${filePrefix}_${new Date().toISOString().slice(0, 10)}.csv`,
            content: report.csvContent,
            contentType: 'text/csv; charset=utf-8'
        });
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`[MAILER] Report sent successfully to ${parsedRecipients.length} recipients: ${info.messageId}`);

    return {
        success: true,
        messageId: info.messageId,
        recipientCount: parsedRecipients.length,
        rowsCount: report.rows.length
    };
}
