// backend/gemini-analyzer.js
// Google Gemini AI 智慧資安深度分析模組
// 支援 2026 最新旗艦 Gemini 3.5 Flash / 2.5 Flash 模型、快取、平滑降級

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
        throw new Error('您輸入的內容包含中文字或提示文字，並非真正的 Gemini API Key。請注意：標準 API Key 是以「AIzaSy」或「AQ.」開頭的英數字串！');
    }
    if (cleaned.length < 20) {
        throw new Error('輸入的金鑰長度過短，請確認已完整複製金鑰。');
    }
    return cleaned;
}

/**
 * 智慧模型適配：支援現行活躍的 3.5-flash 與 2.5-flash
 */
export function resolveModel(model) {
    if (!model) return 'gemini-3.5-flash';
    const m = String(model).trim().toLowerCase();
    if (m.includes('3.5') || m.includes('3.1') || m.includes('flash')) {
        return 'gemini-3.5-flash';
    }
    if (m.includes('pro')) {
        return 'gemini-3.5-flash'; // 優先使用高可用之 flash 避免 pro 額度或棄用限制
    }
    return 'gemini-3.5-flash';
}

/**
 * 查詢此 API Key 支援哪些模型 (ModelService.ListModels)
 */
export async function fetchAvailableModels(apiKey) {
    if (!apiKey) return [];
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
            const data = await res.json();
            const list = (data.models || [])
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace(/^models\//, ''));
            if (list.length > 0) return list;
        }
    } catch (e) {
        console.warn(`[Gemini AI] ListModels warning:`, e.message);
    }
    return [];
}

/**
 * 測試 Gemini API Key 連線並自動適配最佳模型
 */
export async function testGeminiApiKey(rawApiKey, requestedModel = 'gemini-3.5-flash') {
    const apiKey = cleanAndValidateApiKey(rawApiKey);
    const targetModel = resolveModel(requestedModel);

    const candidateModels = Array.from(new Set([
        targetModel,
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-flash-latest'
    ]));

    let lastError = null;
    let successfulModel = null;
    let replyText = null;

    for (const model of candidateModels) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        { parts: [{ text: '請回覆「連線成功！Gemini AI 資安模組運作正常。」這句話即可。' }] }
                    ],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 200
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const parts = data.candidates?.[0]?.content?.parts;
                replyText = (parts && parts.find(p => p.text)?.text)?.trim() || '連線成功';
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

    if (!replyText) {
        throw new Error(`API 驗證失敗: ${lastError}`);
    }

    return {
        reply: replyText,
        activeModel: successfulModel
    };
}

/**
 * 使用 Gemini AI 深度分析單則資安情資（支援自動重試可用模型）
 */
export async function analyzePostWithGemini(post, rawApiKey, requestedModel = 'gemini-3.5-flash') {
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

    const primaryModel = resolveModel(requestedModel);
    const candidateModels = Array.from(new Set([
        primaryModel,
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-flash-latest'
    ]));

    let lastError = null;

    for (const model of candidateModels) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.2,
                            maxOutputTokens: 2000,
                            responseMimeType: 'application/json'
                        }
                    })
                });

                if (response.status === 429 || response.status === 503) {
                    const errJson = await response.json().catch(() => ({}));
                    lastError = errJson.error?.message || `HTTP ${response.status}`;
                    console.warn(`[Gemini AI] Model ${model} ${response.status}, waiting 1.2s before retry...`);
                    await new Promise(r => setTimeout(r, 1200));
                    continue;
                }

                if (!response.ok) {
                    const errJson = await response.json().catch(() => ({}));
                    lastError = errJson.error?.message || `HTTP ${response.status}`;
                    console.warn(`[Gemini AI] Model ${model} returned error: ${lastError}`);
                    break;
                }

                const data = await response.json();
                const parts = data.candidates?.[0]?.content?.parts;
                const rawText = (parts && parts.find(p => p.text)?.text)?.trim() || '';
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
export async function batchAnalyzePostsWithGemini(posts, apiKey, model = 'gemini-3.5-flash', onProgress = null) {
    if (!apiKey || !Array.isArray(posts) || posts.length === 0) return [];

    const results = [];
    const cache = getAiCache();
    const resolvedModel = resolveModel(model);

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const cacheKey = String(post.id || post.title);

        if (cache[cacheKey] && cache[cacheKey].impact) {
            results.push(cache[cacheKey]);
            if (onProgress) onProgress(i + 1, posts.length, true);
            continue;
        }

        try {
            const analyzed = await analyzePostWithGemini(post, apiKey, resolvedModel);
            results.push(analyzed);
            if (onProgress) onProgress(i + 1, posts.length, false);

            if (i < posts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }
        } catch (e) {
            console.error(`[Gemini AI] Analysis error on post ${post.id}:`, e.message);
            results.push(null);
        }
    }

    return results;
}
