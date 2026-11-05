// backend/gemini-analyzer.js
// Google Gemini AI 智慧資安深度分析模組
// 具備模型自動適配、版本自動探測 (v1beta/v1)、快取、平滑降級

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

export function cleanAndValidateApiKey(key) {
    if (!key) throw new Error('請提供 API Key');
    const cleaned = String(key).trim().replace(/^['"`]|['"`]$/g, '').replace(/^Bearer\s+/i, '').trim();
    if (/[\u4e00-\u9fa5]/.test(cleaned) || cleaned.includes('連線失敗') || cleaned.includes('API 驗證失敗')) {
        throw new Error('您輸入的內容包含中文字或提示文字，並非真正的 Gemini API Key。請注意：標準 API Key 是以「AIzaSy」開頭的 39 碼英數字串！');
    }
    if (cleaned.length < 20) {
        throw new Error('輸入的金鑰長度過短，請確認已完整複製以「AIzaSy」開頭的字串。');
    }
    return cleaned;
}

/**
 * 查詢此 API Key 支援哪些模型 (ModelService.ListModels)
 */
export async function fetchAvailableModels(apiKey) {
    if (!apiKey) return [];
    const key = cleanAndValidateApiKey(apiKey);
    for (const ver of ['v1beta', 'v1']) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${apiKey}`);
            if (res.ok) {
                const data = await res.json();
                const list = (data.models || [])
                    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                    .map(m => m.name.replace(/^models\//, ''));
                if (list.length > 0) return list;
            }
        } catch (e) {
            console.warn(`[Gemini AI] ListModels ${ver} warning:`, e.message);
        }
    }
    return [];
}

/**
 * 測試 Gemini API Key 連線並自動適配最佳模型
 */
export async function testGeminiApiKey(rawApiKey, requestedModel = 'gemini-1.5-flash') {
    const apiKey = cleanAndValidateApiKey(rawApiKey);

    // 1. 優先向 Google 查詢該 Key 真正開通了哪些模型
    const availableModels = await fetchAvailableModels(apiKey);

    // 常見支援模型列表（依優先級排序）
    const fallbackList = [
        requestedModel,
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-002',
        'gemini-1.5-flash-001',
        'gemini-1.5-flash',
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro',
        'gemini-pro'
    ];

    let candidateModels = [];
    if (availableModels.length > 0) {
        if (availableModels.includes(requestedModel)) {
            candidateModels = [requestedModel, ...availableModels.filter(m => m !== requestedModel)];
        } else {
            const preferred = availableModels.find(m => m.includes('1.5-flash'))
                || availableModels.find(m => m.includes('flash'))
                || availableModels.find(m => m.includes('pro'))
                || availableModels[0];
            candidateModels = [preferred, ...availableModels.filter(m => m !== preferred)];
        }
    } else {
        candidateModels = fallbackList;
    }

    let lastError = null;
    let successfulModel = null;
    let replyText = null;

    // 依序嘗試候選模型與 API 版本 (v1beta / v1)
    for (const model of candidateModels.slice(0, 6)) {
        for (const ver of ['v1beta', 'v1']) {
            try {
                const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [
                            { parts: [{ text: '請回覆「連線成功！Gemini AI 資安模組運作正常。」這句話即可。' }] }
                        ],
                        generationConfig: {
                            temperature: 0.1,
                            maxOutputTokens: 50
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    replyText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '連線成功';
                    successfulModel = model;
                    break;
                } else {
                    const errJson = await response.json().catch(() => ({}));
                    lastError = errJson.error?.message || `HTTP ${response.status} ${response.statusText}`;
                }
            } catch (e) {
                lastError = e.message;
            }
        }
        if (replyText) break;
    }

    if (!replyText) {
        const hint = availableModels.length > 0
            ? `（偵測到可用模型為：${availableModels.slice(0, 5).join('、')}）`
            : '（請確認該專案已開通 Generative Language API，或重新於 aistudio.google.com 建立 API Key）';
        throw new Error(`API 驗證失敗: ${lastError} ${hint}`);
    }

    return {
        reply: replyText,
        activeModel: successfulModel,
        availableModels
    };
}

/**
 * 使用 Gemini AI 深度分析單則資安情資（支援自動重試可用模型）
 */
export async function analyzePostWithGemini(post, rawApiKey, requestedModel = 'gemini-1.5-flash') {
    if (!post || !rawApiKey) return null;
    let apiKey;
    try {
        apiKey = cleanAndValidateApiKey(rawApiKey);
    } catch (e) {
        return null;
    }

    const cacheKey = String(post.id || post.title);
    const cache = getAiCache();

    // 1. 命中快取，直接回傳
    if (cache[cacheKey] && cache[cacheKey].impact && cache[cacheKey].solution) {
        return cache[cacheKey];
    }

    const title = post.title || '';
    const content = (post.content || '').slice(0, 2000);

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

    // 候選模型清單
    const candidateModels = [
        requestedModel,
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash-002',
        'gemini-1.5-flash-001',
        'gemini-1.5-flash',
        'gemini-2.0-flash-exp',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro',
        'gemini-pro'
    ];

    let lastError = null;

    for (const model of candidateModels) {
        for (const ver of ['v1beta', 'v1']) {
            try {
                const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 600,
                            responseMimeType: 'application/json'
                        }
                    })
                });

                if (!response.ok) {
                    const errJson = await response.json().catch(() => ({}));
                    lastError = errJson.error?.message || `HTTP ${response.status}`;
                    if (response.status === 404 || (lastError && lastError.includes('not found'))) {
                        continue; // 嘗試下一個模型
                    }
                    throw new Error(lastError);
                }

                const data = await response.json();
                const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
                const result = JSON.parse(cleanJson);

                if (result && result.impact && result.solution) {
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
            } catch (e) {
                lastError = e.message;
            }
        }
    }

    if (lastError) {
        throw new Error(lastError);
    }
    return null;
}

/**
 * 批次處理並進行延遲控制
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

            if (i < posts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 600));
            }
        } catch (e) {
            console.error(`[Gemini AI] Analysis error on post ${post.id}:`, e.message);
            results.push(null);
        }
    }

    return results;
}
