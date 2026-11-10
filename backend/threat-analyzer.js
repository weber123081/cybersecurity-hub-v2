import { getAiCache, analyzePostWithGemini } from './gemini-analyzer.js';
// backend/threat-analyzer.js
// 專業資安情資分析與週報/月報智慧生成引擎
// 支援 6 大標準欄位：搜集日期、搜集來源、威脅情資說明、可能之影響、因應方案、備註

// 1. CVSS 提取
export function extractMaxCvss(text) {
    if (!text) return null;
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

// 2. CVE 提取
export function extractCves(text) {
    if (!text) return [];
    return [...new Set((text.match(/CVE-\d{4}-\d{4,7}/gi) || []).map(c => c.toUpperCase()))];
}

// 3. 主旨去重標記
export function extractSubjectKey(title) {
    const twMatch = (title || '').match(/^([^｜|]+)[｜|]([^-\s]+)/);
    if (twMatch) return twMatch[2].trim().toLowerCase();

    const knownEntities = [
        'fortinet', 'fortios', 'fortigate', 'ivanti', 'palo alto', 'pan-os',
        'cisco', 'microsoft', 'windows', 'exchange', 'sharepoint', 'outlook',
        'vmware', 'vcenter', 'esxi', 'apache', 'tomcat', 'activemq',
        'qnap', 'synology', 'asus', 'd-link', 'tp-link', 'zyxel', 'ios', 'chrome',
        'edge', 'firefox', 'safari', 'android', 'linux', 'macos', 'wordpress',
        'drupal', 'atlassian', 'confluence', 'jira', 'gitlab', 'github', 'zoom',
        'cpguard', 'shopline', '永豐銀行'
    ];
    const lower = (title || '').toLowerCase();
    for (const k of knownEntities) {
        if (lower.includes(k)) return k;
    }
    return '';
}

// 4. 嚴重度評分
export function evaluatePostSeverity(post) {
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
    if (/供應商.*遭駭|供應鏈|勒索軟體|大量主機.*感染/i.test(combined)) {
        score = Math.max(score, 88);
    }

    if (isDailyDigest) {
        score = Math.min(score, 30);
    }

    return { cvss, cves, score, isDailyDigest };
}

// 5. 辨識受影響平台與廠商
export function identifyPlatform(text) {
    const t = (text || '').toLowerCase();
    if (/fortinet|fortigate|fortios|fortiproxy|forticlient/i.test(t)) {
        return { name: 'Fortinet 網路邊界設備 (FortiOS/FortiGate)', type: 'network_gateway', vendor: 'Fortinet' };
    }
    if (/palo alto|pan-os|globalprotect/i.test(t)) {
        return { name: 'Palo Alto 次世代防火牆與 GlobalProtect VPN', type: 'network_gateway', vendor: 'Palo Alto Networks' };
    }
    if (/cisco|ios xe|asa|firepower|anyconnect/i.test(t)) {
        return { name: 'Cisco 網通邊界設備與 IOS XE 系統', type: 'network_gateway', vendor: 'Cisco' };
    }
    if (/ivanti|connect secure|policy secure|epmm/i.test(t)) {
        return { name: 'Ivanti Connect Secure / 端點管理閘道', type: 'network_gateway', vendor: 'Ivanti' };
    }
    if (/check point|quantum|gaia/i.test(t)) {
        return { name: 'Check Point 防火牆安全系統', type: 'network_gateway', vendor: 'Check Point' };
    }
    if (/zyxel|合勤/i.test(t)) {
        return { name: 'Zyxel 防火牆與 VPN 路由器', type: 'network_gateway', vendor: 'Zyxel' };
    }
    if (/qnap|qts|quts/i.test(t)) {
        return { name: 'QNAP NAS 網路儲存系統 (QTS/QuTS)', type: 'storage_nas', vendor: 'QNAP' };
    }
    if (/synology|dsm/i.test(t)) {
        return { name: 'Synology 群暉 NAS 儲存系統 (DSM)', type: 'storage_nas', vendor: 'Synology' };
    }
    if (/exchange|outlook/i.test(t)) {
        return { name: 'Microsoft Exchange / Outlook 郵件系統', type: 'email_system', vendor: 'Microsoft' };
    }
    if (/active directory|域控|ad域|kerberos|domain controller/i.test(t)) {
        return { name: 'Windows AD 網域控制中心與身分目錄', type: 'identity_ad', vendor: 'Microsoft' };
    }
    if (/windows|hyper-v|powershell|iis/i.test(t)) {
        return { name: 'Microsoft Windows 伺服器與作業系統', type: 'os_windows', vendor: 'Microsoft' };
    }
    if (/linux|ubuntu|redhat|rhel|centos|debian|kernel/i.test(t)) {
        return { name: 'Linux 伺服器核心與發行版環境', type: 'os_linux', vendor: 'Linux' };
    }
    if (/vmware|esxi|vcenter|vsphere/i.test(t)) {
        return { name: 'VMware 虛擬化基礎架構 (ESXi/vCenter)', type: 'virtualization', vendor: 'VMware' };
    }
    if (/apache|tomcat|http server|struts|activemq/i.test(t)) {
        return { name: 'Apache Web/中介軟體伺服器 (Tomcat/ActiveMQ)', type: 'middleware_web', vendor: 'Apache' };
    }
    if (/nginx/i.test(t)) {
        return { name: 'Nginx 高效能反向代理與 Web 伺服器', type: 'middleware_web', vendor: 'Nginx' };
    }
    if (/wordpress|drupal|joomla/i.test(t)) {
        return { name: 'CMS 網站內容管理系統與外掛模組', type: 'cms_web', vendor: 'CMS' };
    }
    if (/chrome|chromium|edge|firefox|safari/i.test(t)) {
        return { name: '主流瀏覽器端點應用 (Chrome/Edge/Firefox)', type: 'client_browser', vendor: 'Browser' };
    }
    if (/ios|iphone|ipad|macos|apple/i.test(t)) {
        return { name: 'Apple 終端裝置系統 (iOS/macOS)', type: 'client_apple', vendor: 'Apple' };
    }
    if (/android/i.test(t)) {
        return { name: 'Android 行動作業系統與裝置', type: 'client_mobile', vendor: 'Google' };
    }
    if (/供應商|第三方|委外|供應鏈|api金鑰/i.test(t)) {
        return { name: '第三方供應商/委外介接系統與 API 服務', type: 'supply_chain', vendor: 'Third-party' };
    }
    if (/冷凍設備|連網設備|預設密碼|iot|鏡頭|路由器|印表機/i.test(t)) {
        return { name: 'IoT / 邊界連網硬體與工業物聯網設備', type: 'iot_embedded', vendor: 'IoT' };
    }
    return { name: '內部通用應用系統與伺服器軟體', type: 'generic', vendor: 'General' };
}

// 6. 辨識弱點/威脅類型
export function identifyVulnType(text) {
    const t = (text || '').toLowerCase();
    if (/供應商.*遭駭|供應鏈|更新通道.*遭入侵|更新伺服器/i.test(t)) return 'SUPPLY_CHAIN';
    if (/在野利用|已遭利用|已知利用|0-day|零時差|零日/i.test(t)) return 'EXPLOITED_0DAY';
    if (/遠端.*(執行|代碼|程式碼)|rce|command injection|code execution|命令注入/i.test(t)) return 'RCE';
    if (/身分驗證繞過|認證繞過|auth.*bypass|繞過身分|未授權存取|unauthenticated/i.test(t)) return 'AUTH_BYPASS';
    if (/權限提升|提權|privilege escalation|elevation of privilege/i.test(t)) return 'PRIV_ESC';
    if (/勒索軟體|ransomware|加密檔案|勒索集團|lockbit|blackcat|alphv/i.test(t)) return 'RANSOMWARE';
    if (/資訊洩漏|資訊外洩|機敏資料|任意檔案讀取|路徑遍歷|path traversal|directory traversal|lfi/i.test(t)) return 'INFO_DISCLOSURE';
    if (/sql.*(注入|injection)|sqli/i.test(t)) return 'SQLI';
    if (/ssrf|伺服器端請求偽造/i.test(t)) return 'SSRF';
    if (/阻斷服務|dos|denial of service|崩潰|當機|高cpu/i.test(t)) return 'DOS';
    if (/釣魚|社交工程|惡意郵件|phishing|bec|qr碼/i.test(t)) return 'PHISHING';
    if (/預設密碼|弱密碼|暴露於公網/i.test(t)) return 'WEAK_CRED';
    return 'GENERIC_VULN';
}

// 7. 提取原文中的具體修補版本與原廠指令
export function extractConcretePatchAdvice(content) {
    if (!content) return '';
    // 優先提取【解決方法】
    const mSol = content.match(/【(?:解決方法|解決辦法|建議因應|因應作為)】\s*([\s\S]*?)(?=\n\n【|$)/);
    if (mSol && mSol[1].trim().length > 10) {
        return mSol[1].trim().replace(/\n+/g, ' ');
    }
    // 搜尋更新至版本語句
    const mVersion = content.match(/(?:更新|升級|釋出|修復版本)[^。\n]{0,35}?(?:(?:版本|至|Release)\s*[vV]?\d+(?:\.\d+)+(?:[a-zA-Z0-9_.-]+)?|安全更新|KB\d{6,8})/i);
    if (mVersion) {
        return mVersion[0].trim();
    }
    return '';
}

// 8. 智慧生成「可能之影響」 (Potential Impact)
export function generateImpact(platform, vulnType, meta, text) {
    const pName = platform.name;

    switch (vulnType) {
        case 'SUPPLY_CHAIN':
            return `第三方供應商系統或更新管道遭惡意滲透，恐導致介接之 API 金鑰洩漏、惡意程式被植入伺服器後門，或連鎖波及企業內部營運資料與客戶交易安全。`;
        case 'EXPLOITED_0DAY':
            return `此漏洞已遭攻擊者武器化於在野積極發動攻擊，未授權外部駭客可在零防禦狀態下長驅直入 ${pName}，植入勒索後門並完全控制核心主機。`;
        case 'RCE':
            return `未授權之遠端攻擊者可透過網路由外部發送特製請求，於 ${pName} 上以系統最高管理權限 (SYSTEM/root) 執行任意惡意程式碼，並進行橫向滲透 (Lateral Movement)。`;
        case 'AUTH_BYPASS':
            return `攻擊者無需具備合法帳號密碼即可完全繞過安全認證機制，取得 ${pName} 之最高管理員權限，進而竄改系統設定、關閉日誌稽核或竊取核心憑證。`;
        case 'PRIV_ESC':
            return `已取得本機低權限之使用者或惡意軟體，可藉此弱點提升至本機或網域最高管理員權限，破壞存取控制限制並關閉防毒/EDR 端點保護模組。`;
        case 'RANSOMWARE':
            return `端點或伺服器若遭勒索軟體感染，將引發全盤資料加密並遭威脅外洩敏感機密，造成本單位關鍵業務中斷、資料永久滅失與重大名譽受損。`;
        case 'INFO_DISCLOSURE':
            return `未授權之外部人士可讀取伺服器內部組態檔、資料庫連線密碼、系統記憶體或商業機敏文件，恐衍生後續針對性滲透與個人資料外洩風險。`;
        case 'SQLI':
            return `攻擊者可經由 Web 前端輸入惡意 SQL 語句，直接穿透後端資料庫讀取、竄改或刪除全量資料庫記錄，甚至取得資料庫主機之作業系統執行權限。`;
        case 'SSRF':
            return `攻擊者可誘導受信任之應用伺服器向內部網路或雲端 Metadata 發動偽造請求，進而橫向探測內部隔離網段並竊取雲端認證憑證。`;
        case 'DOS':
            return `攻擊者可發送特製資料封包耗盡 ${pName} 之 CPU 或記憶體資源，導致核心服務崩潰當機重啟，造成對外營運服務中斷。`;
        case 'PHISHING':
            return `同仁若誤信偽冒信件或點擊不明連結，將導致組織帳號密碼遭盜用、雙重驗證 (MFA) 遭中繼攔截，或個人電腦遭植入木馬程式成為跳板。`;
        case 'WEAK_CRED':
            return `連網設備若維持原廠預設帳密且直接暴露於公網，攻擊者可藉由自動化弱密碼掃描輕易登入後台，將設備納入殭屍網路或監聽內部網路流量。`;
        default:
            return `可能導致 ${pName} 出現安全防禦破口，遭攻擊者利用發動未授權存取、資料探測或破壞系統運作穩定性。`;
    }
}

// 9. 智慧生成「因應方案」 (Mitigation & Response Plan)
export function generateMitigation(platform, vulnType, concreteAdvice, meta, text) {
    const steps = [];

    // 第一步：具體原廠修補或緊急補丁 (Patching)
    if (concreteAdvice) {
        steps.push(`【原廠修補】：請立即依官方指引${concreteAdvice}。`);
    } else if (meta.cves && meta.cves.length > 0) {
        steps.push(`【原廠修補】：清查設備韌體與軟體版本，儘速套用官方針對 ${meta.cves.slice(0, 2).join(' / ')} 所釋出之最新安全修補更新 (Patch)。`);
    } else {
        steps.push(`【原廠修補】：持續追蹤官方發布之最新版本，儘速安排測試並完成版本升級。`);
    }

    // 第二步：依照弱點屬性與受影響平台擬定維運作為 (Workaround & Perimeter Defense)
    if (vulnType === 'SUPPLY_CHAIN') {
        steps.push(`【供應商管控】：立即清查更換與該廠商介接之 API 金鑰與授權 Token；要求供應商提出第三方弱點修補證明；對廠商遠端維護連線強制啟用 MFA 與白名單限制。`);
    } else if (platform.type === 'network_gateway') {
        steps.push(`【邊界防護】：嚴格限制管理控制介面 (HTTPS/SSH) 僅允許受信任管理網段連線，禁止直接對外網 (WAN) 開放；調閱近 14 天連線日誌比對異常外部 IP。`);
    } else if (vulnType === 'RCE' || vulnType === 'SQLI' || vulnType === 'SSRF') {
        steps.push(`【虛擬防禦】：於邊界 WAF 與次世代防火牆 (NGFW) 載入對應 CVE 特徵碼進行虛擬修補 (Virtual Patch)；對異常 HTTP 參數進行深度封包過濾。`);
    } else if (vulnType === 'AUTH_BYPASS' || vulnType === 'PRIV_ESC') {
        steps.push(`【帳號清查】：盤點系統所有特權管理員清單，撤銷閒置授權；強制全面實施多因素驗證 (MFA)；清除目前在線之所有不明連線 Session。`);
    } else if (vulnType === 'PHISHING') {
        steps.push(`【郵件閘道】：於 SEG 郵件閘道阻擋可疑發信網域與危險副檔名 (.iso, .vbs, .exe, .zip)；對同仁發布最新釣魚特徵宣導，提醒勿點擊短網址。`);
    } else if (vulnType === 'WEAK_CRED') {
        steps.push(`【設備加固】：立即變更所有原廠預設密碼，採用 16 碼以上複雜密碼；將連網設備移至專屬隔離 VLAN，禁止直連網際網路。`);
    } else if (vulnType === 'RANSOMWARE') {
        steps.push(`【備份隔離】：立即驗證核心資料「3-2-1 離線備份」機制完備性；更新端點 EDR 勒索防禦特徵碼；遇疑似感染機台立即拔除網路線隔離。`);
    } else {
        steps.push(`【環境加固】：落實最小權限原則，停用未必要之系統服務；落實網路分段 (Network Segmentation) 以限縮受害範圍。`);
    }

    // 第三步：內部清查與告警監控指引 (Hunting & Monitoring)
    steps.push(`【資產盤點】：比對內部 CMDB 軟體資產清單，確認本單位是否有佈署受影響之版本，並於 SIEM/Syslog 設定監控規則。`);

    return steps.join(' ');
}

// 10. 智慧生成「備註」 (Remarks & Context)
export function generateRemarks(platform, vulnType, meta, post) {
    const parts = [];

    // 情資優先度與攻擊狀態
    if (/0-day|零時差|已遭利用|已知利用|在野利用/i.test(post.title + ' ' + post.content)) {
        parts.push('⚠️【重大威脅：已知在野利用】此漏洞已有武器化利用紀錄，強烈建議列為 P1 最緊急處置項目。');
    } else if (/poc.*公開|概念驗證/i.test(post.title + ' ' + post.content)) {
        parts.push('⚠️【高風險：PoC已公開】網路上已公開概念驗證攻擊程式碼，預期近期將湧現自動化掃描，建議儘速修訂防禦規則。');
    } else if (meta.cvss && meta.cvss >= 9.0) {
        parts.push(`【CVSS ${meta.cvss.toFixed(1)} 重大等級】具遠端高危害性，建議排入優先修補序列。`);
    } else {
        parts.push('【例行安全情資】建議納入內部定期安全維運盤點排程。');
    }

    // 受影響範圍提示
    parts.push(`適用範圍：${platform.name}。`);

    // 內部現況建議
    parts.push('處置建議：由維運單位清查現行版本；若無使用該產品則持續保持情資監控。');

    // 來源出處
    let srcName = (post.authorName || post.author?.name || '資安情資').replace(/^資安情報\s*[·・-]\s*/, '').trim();
    if (post.originalUrl) {
        parts.push(`(出處：${srcName})`);
    }

    return parts.join(' ');
}

// 11. 彙整週報/月報表格資料主函式 (buildReportRows)
export function buildReportRows(posts, options = {}) {
    if (!Array.isArray(posts) || posts.length === 0) return [];

    const {
        period = 'week', // 'week' (7天) | 'month' (30天)
        maxCount = 10,
        minScore = 50,
        cveOnly = false,
        highSeverityOnly = false,
        deduplicate = true,
        excludeDigest = true
    } = options;

    const now = Date.now();
    const days = period === 'week' ? 7 : 30;
    const cutoffDate = new Date(now - days * 24 * 60 * 60 * 1000);

    // 1. 初步評分與篩選
    let candidates = posts.map(post => {
        const meta = evaluatePostSeverity(post);
        return { post, meta };
    });

    // 排除日報整合文與低分項目
    if (excludeDigest) {
        candidates = candidates.filter(x => !x.meta.isDailyDigest);
    }

    if (cveOnly) {
        candidates = candidates.filter(x => x.meta.cves.length > 0);
    }

    if (highSeverityOnly) {
        candidates = candidates.filter(x => x.meta.score >= 75 || (x.meta.cvss !== null && x.meta.cvss >= 7.0));
    }

    // 2. 日期過濾
    const dateFiltered = candidates.filter(x => {
        const d = new Date(x.post.pubDate || x.post.timeAgo || 0);
        return !isNaN(d.getTime()) && d >= cutoffDate;
    });

    // 若該時段文章數足夠，優先採用時段內文章；不足則補入歷史高危情報
    const pool = dateFiltered.length >= 3 ? dateFiltered : candidates;

    // 3. 按嚴重度分數降冪排序，次按發布時間
    pool.sort((a, b) => b.meta.score - a.meta.score || new Date(b.post.pubDate || 0) - new Date(a.post.pubDate || 0));

    // 4. 嚴格去重複機制 (同 CVE 或同產品實體只保留最重要一則)
    const seenCves = new Set();
    const seenSubjects = new Set();
    const rows = [];

    for (const item of pool) {
        const { post, meta } = item;
        if (deduplicate) {
            const hasOverlappingCve = meta.cves.length > 0 && meta.cves.some(c => seenCves.has(c));
            const subjKey = extractSubjectKey(post.title);
            const hasSameSubject = subjKey && seenSubjects.has(subjKey);

            if (hasOverlappingCve || hasSameSubject) continue;

            meta.cves.forEach(c => seenCves.add(c));
            if (subjKey) seenSubjects.add(subjKey);
        }

        const rawContent = (post.content || '').replace(/(\n\n\d{4}-\d{2}-\d{2})+$/, '').trim();
        const sentences = rawContent.split(/[。！？\n]+/).map(s => s.trim()).filter(s => s.length > 6);

        // 欄位 1：搜集日期
        const collectDate = post.timeAgo || (post.pubDate ? post.pubDate.slice(0, 10) : new Date().toISOString().slice(0, 10));

        // 欄位 2：搜集來源
        let source = (post.authorName || post.author?.name || '資安情資').replace(/^資安情報\s*[·・-]\s*/, '').trim();

        // 欄位 3：威脅情資說明
        const tags = [];
        if (meta.cvss !== null) tags.push(`CVSS ${meta.cvss.toFixed(1)}`);
        else if (meta.score >= 90) tags.push('重大高危');
        if (meta.cves.length > 0) tags.push(meta.cves.slice(0, 2).join('、'));
        const tagPrefix = tags.length > 0 ? `【${tags.join('｜')}】` : '';

        let descText = post.title || '';
        // 嘗試加入問題描述
        const twProblem = rawContent.match(/【(?:問題描述|漏洞說明|情資說明)】\s*([\s\S]*?)(?=\n\n【|$)/);
        if (twProblem) {
            descText = `${post.title}：${twProblem[1].trim().replace(/\n+/g, ' ')}`;
        } else if (sentences[0] && sentences[0] !== post.title) {
            descText = `${post.title}（${sentences[0]}）`;
        }
        const description = `${tagPrefix}${descText}`;

        // 智慧深度分析
        const combinedText = `${post.title}\n${rawContent}`;
        const platform = identifyPlatform(combinedText);
        const vulnType = identifyVulnType(combinedText);
        const concreteAdvice = extractConcretePatchAdvice(rawContent);

        // 欄位 4：可能之影響
        const impact = generateImpact(platform, vulnType, meta, combinedText);

        // 欄位 5：因應方案 (具體、分層級、非千篇一律)
        const solution = generateMitigation(platform, vulnType, concreteAdvice, meta, combinedText);

        // 欄位 6：網頁連結 (優先填入原始情報公告網址 originalUrl)
        const webLink = post.originalUrl || post.link || post.url || '';
        const note = webLink || generateRemarks(platform, vulnType, meta, post);

        rows.push({
            id: post.id,
            collectDate,
            source,
            description,
            impact,
            solution,
            note,
            url: webLink,
            cves: meta.cves,
            cvss: meta.cvss,
            score: meta.score,
            originalUrl: webLink
        });

        if (rows.length >= maxCount) break;
    }

    return rows;
}


/**
 * 結合 Gemini AI 深度思考之非同步週報/月報分析引擎
 * 若未設定 API Key 或 AI 呼叫異常，自動平滑降級為規則引擎
 */
export async function buildThreatReportRowsAsync(posts, options = {}) {
    const baseRows = buildReportRows(posts, options);
    const { apiKey, model = 'gemini-1.5-flash', useAi = true } = options;

    if (!useAi || !apiKey) {
        return baseRows;
    }

    const cache = getAiCache();
    for (let i = 0; i < baseRows.length; i++) {
        const row = baseRows[i];
        const cacheKey = String(row.id || row.description);

        if (cache[cacheKey] && cache[cacheKey].impact && cache[cacheKey].solution) {
            row.impact = cache[cacheKey].impact;
            row.solution = cache[cacheKey].solution;
            if (cache[cacheKey].description) {
                row.description = cache[cacheKey].description;
            }
            row.isAiGenerated = true;
            row.aiModel = cache[cacheKey].model || model;
            row.analyzedAt = cache[cacheKey].analyzedAt;
            continue;
        }

        try {
            const originalPost = posts.find(p => p.id === row.id) || { title: row.description, content: row.description };
            console.log(`[Gemini AI] 正在呼叫 Google API 深度研判 (${i + 1}/${baseRows.length})：${originalPost.title.slice(0, 35)}...`);
            const aiResult = await analyzePostWithGemini(originalPost, apiKey, model);
            if (aiResult) {
                row.impact = aiResult.impact;
                row.solution = aiResult.solution;
                if (aiResult.description) {
                    row.description = aiResult.description;
                }
                row.isAiGenerated = true;
                row.aiModel = aiResult.model || model;
                row.analyzedAt = aiResult.analyzedAt;
            }

            // 加入 1.5 秒節奏防護 (Pacing Delay)，避免觸發 Google API 429 頻率上限
            if (i < baseRows.length - 1) {
                await new Promise(r => setTimeout(r, 1500));
            }
        } catch (e) {
            console.warn(`[ThreatAnalyzer] AI error for item ${row.id}, falling back to rule-based:`, e.message);
        }
    }

    return baseRows;
}
