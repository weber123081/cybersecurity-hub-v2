// backend/gemini-analyzer.js
// Google Gemini AI 智慧資安深度分析模組
// 支援快取、平滑降級、結構化 JSON 輸出

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.join(__dirname, 'data/ai-threat-cache.json');

// 讀取快取
export function getAiCache() {
    try {
        if (!fs.existsSync(CACHE_PATH)) return {};
        return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    } catch (e) {
        console.error('[Gemini AI] Failed to read cache:', e);
        return {};
    }
}

// 儲存快取
export function saveAiCache(cache) {
    try {
        const dir = path.dirname(CACHE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
        console.error('[Gemini AI] Failed to save cache:', e);
    }
}

// 清空快取
export function clearAiCache() {
    try {
        if (fs.existsSync(CACHE_PATH)) {
            fs.unlinkSync(CACHE_PATH);
        }
        return true;
    } catch (e) {
        console.error('[Gemini AI] Failed to clear cache:', e);
        return false;
    }
}

// 取得快取統計
export function getAiCacheStats() {
    const cache = getAiCache();
    return {
        totalCached: Object.keys(cache).length
    };
}

/**
 * 測試 Gemini API Key 連線是否正常
 */
export async function testGeminiApiKey(apiKey, model = 'gemini-1.5-flash') {
    if (!apiKey) throw new Error('請提供 API Key');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: '請回覆「連線成功！Gemini AI 資安模組運作正常。」這句話即可。' }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 50
            }
        })
    });

    if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error?.message || `HTTP ${response.status} ${response.statusText}`;
        throw new Error(`API 驗證失敗: ${errMsg}`);
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '連線成功';
    return reply;
}

/**
 * 使用 Gemini AI 深度分析單則資安情資
 */
export async function analyzePostWithGemini(post, apiKey, model = 'gemini-1.5-flash') {
    if (!post || !apiKey) return null;

    const cacheKey = String(post.id || post.title);
    const cache = getAiCache();

    // 1. 命中快取，直接回傳
    if (cache[cacheKey] && cache[cacheKey].impact && cache[cacheKey].solution) {
        return cache[cacheKey];
    }

    const title = post.title || '';
    const content = (post.content || '').slice(0, 2000); // 截取前 2000 字已足夠全面分析

    const prompt = `
你是一位具備 15 年經驗的企業資安主管與威脅情資架構師。請根據以下這則最新資安情資，進行縝密的專業深度思考與研判，產出具有高度參考價值的分析結論。

【情資標題】：${title}
【情資內容】：
${content}

請嚴格遵循以下要求進行思考，並回傳純 JSON 物件（不得包含 markdown \`\`\`json 標記或額外贅字）：
1. "description"：【威脅情資說明】精煉出核心技術問題、受影響的系統/軟體/版本，以及 CVE 與 CVSS 分數（若內文有提及），控制在 50~100 字內。
2. "impact"：【可能之影響】必須具體、深入，避免千篇一律的套話！從「技術風險（如權限失控、主機被當跳板）」與「企業營運/商譽衝擊（如個資外洩受罰、金流交易盜刷、阻斷正常營業）」兩個角度深入推導。控制在 60~120 字內。
3. "solution"：【因應方案】提供務實、可立即執行的具體處方，必須包含：
   - 即刻應急/防堵措施（如限制特定外網存取、暫停特定功能或加強警覺）
   - 根本修補方針（如升級至官方特定修補版本、更改密碼或啟用多因素驗證 MFA）
   控制在 70~130 字內。

JSON 格式規範：
{
  "description": "...",
  "impact": "...",
  "solution": "..."
}
`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                {
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                temperature: 0.2, // 保持冷靜與準確性
                maxOutputTokens: 600,
                responseMimeType: 'application/json'
            }
        })
    });

    if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // 解析 JSON
    const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(cleanJson);

    if (result && result.impact && result.solution) {
        // 存入快取
        cache[cacheKey] = {
            description: result.description || title,
            impact: result.impact,
            solution: result.solution,
            model: model,
            analyzedAt: new Date().toISOString()
        };
        saveAiCache(cache);
        return cache[cacheKey];
    }

    return null;
}

/**
 * 批次處理並進行延遲控制，避免觸發每分鐘速率限制 (15 RPM)
 */
export async function batchAnalyzePostsWithGemini(posts, apiKey, model = 'gemini-1.5-flash', onProgress = null) {
    if (!apiKey || !Array.isArray(posts) || posts.length === 0) return [];

    const results = [];
    const cache = getAiCache();

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const cacheKey = String(post.id || post.title);

        if (cache[cacheKey] && cache[cacheKey].impact) {
            results.push(cache[cacheKey]);
            if (onProgress) onProgress(i + 1, posts.length, true);
            continue;
        }

        try {
            const analyzed = await analyzePostWithGemini(post, apiKey, model);
            results.push(analyzed);
            if (onProgress) onProgress(i + 1, posts.length, false);

            // 如果不是快取命中，稍微延遲 600ms 以保護 API 速率限制
            if (i < posts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 600));
            }
        } catch (e) {
            console.error(`[Gemini AI] Analysis error on post ${post.id}:`, e.message);
            results.push(null); // 失敗則放 null，後續平滑降級為規則引擎
        }
    }

    return results;
}
