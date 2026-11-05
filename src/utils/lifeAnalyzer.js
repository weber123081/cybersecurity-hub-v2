// src/utils/lifeAnalyzer.js
// 生活資安轉譯引擎：專為大眾設計，將冰冷技術漏洞轉為日常白話自保指南

export function analyzeLifePerspective(post) {
    if (!post) return null;

    const title = post.title || '';
    const rawContent = (post.content || '').replace(/(\n\n\d{4}-\d{2}-\d{2})+$/, '').trim();
    const full = (title + ' ' + rawContent).toLowerCase();

    // 1. 辨識受影響的生活族群與場景 (Affected Crowd)
    let crowd = '💻 一般電腦與網路使用者';
    let crowdIcon = 'fa-laptop';
    let crowdTag = '個人電腦用戶';

    if (/網銀|轉帳|銀行|信用卡|金融|支付|盜刷|金流|提款|帳戶/.test(full)) {
        crowd = '💳 網路銀行、行動支付與信用卡族群';
        crowdIcon = 'fa-credit-card';
        crowdTag = '網銀/支付用戶';
    } else if (/購物|電商|買家|賣家|erp|商家|訂單|貨到付款|包裹|shopline/.test(full)) {
        crowd = '🛒 經常網購的消費者與網拍店家';
        crowdIcon = 'fa-cart-shopping';
        crowdTag = '網購消費者';
    } else if (/冷凍|連網設備|監視器|攝影機|門禁|iot|路由器|分享器|nas|電視|智慧家電/.test(full)) {
        crowd = '🏠 家中有智慧連網家電、監視器或路由器者';
        crowdIcon = 'fa-house-signal';
        crowdTag = '智慧家庭/監視器';
    } else if (/firefox|chrome|edge|safari|瀏覽器|分頁|擴充套件|外掛/.test(full)) {
        crowd = '🌐 常用網頁瀏覽器上網者';
        crowdIcon = 'fa-globe';
        crowdTag = '網頁瀏覽族群';
    } else if (/手機|iphone|android|ios|line|社群|通訊|app|平板/.test(full)) {
        crowd = '📱 智慧型手機、LINE 與通訊軟體使用者';
        crowdIcon = 'fa-mobile-screen-button';
        crowdTag = '手機/社群用戶';
    } else if (/釣魚|郵件|簡訊|詐騙|假冒|社交工程|中獎|退稅|罰單/.test(full)) {
        crowd = '💼 經常收發 Email 或簡訊之廣大民眾';
        crowdIcon = 'fa-envelope-open-text';
        crowdTag = '郵件/簡訊收件者';
    }

    // 2. 生活危險等級 (Life Risk Level)
    let riskLevel = 'medium';
    let riskBadge = '🟡 一般風險 · 保持日常警覺';
    let riskColor = 'text-amber-700 bg-amber-50 border-amber-200';

    if (/0-day|零時差|在野利用|已遭利用|已知利用|重大|滿分|異常轉帳|盜刷|勒索|加密檔案/.test(full)) {
        riskLevel = 'critical';
        riskBadge = '🔴 極度危險！防盜刷/竊帳 (需立即自保)';
        riskColor = 'text-red-700 bg-red-50 border-red-200';
    } else if (/高風險|漏洞|權限提升|更新通道|遠端執行|rce|遭駭|外洩/.test(full)) {
        riskLevel = 'high';
        riskBadge = '🟠 高度注意 · 請盡速更新檢查';
        riskColor = 'text-orange-700 bg-orange-50 border-orange-200';
    }

    // 3. 生活化白話重點摘要 (30-second Plain TL;DR)
    let lifeSummary = '';
    const firstSentence = rawContent.split(/[。！？\n]+/)[0] || '';

    if (crowd.includes('網銀') || full.includes('轉帳')) {
        lifeSummary = '駭客正針對金融與網銀系統發動攻擊！請立刻確認網銀通知推播是否正常，並檢查近期帳戶明細，以防未經授權之異常轉帳。';
    } else if (crowd.includes('網購')) {
        lifeSummary = '相關購物或訂單系統出現安全異常，您的收件姓名、電話或訂單資料可能遭不法分子掌握，請特別提防假冒客服來電或包裹取貨詐騙簡訊！';
    } else if (crowd.includes('智慧家庭')) {
        lifeSummary = '出廠預設密碼或連網設定漏洞正遭駭客掃描探測，若未更改密碼或關閉遠端功能，家中監視器或設備可能遭外部人士窺探甚至遭惡意控制。';
    } else if (crowd.includes('瀏覽器')) {
        lifeSummary = '此版本漏洞可能讓駭客透過惡意網頁偷偷在您的電腦執行惡意程式，建議立即重啟瀏覽器檢查更新，確保上網安全。';
    } else if (crowd.includes('手機')) {
        lifeSummary = '手機系統或通訊軟體出現高風險弱點，駭客可能藉由誘導點擊連結取得手機權限，請盡速更新手機系統或通訊 App。';
    } else if (full.includes('釣魚') || full.includes('詐騙')) {
        lifeSummary = '近期出現高度逼真的偽冒通知！千萬不要隨意點擊簡訊或 Email 中的短網址，更不要在未知頁面輸入身分證字號、信用卡號或 OTP 驗證碼。';
    } else {
        lifeSummary = firstSentence.length > 10 
            ? `${firstSentence}。建議同仁與大眾保持防範，落實防護良好習慣。`
            : '本項資安動態可能影響日常系統與帳號運作，建議參考下方自保步驟落實防範。';
    }

    // 4. 生活自保 3 招 (Actionable 3-Step Life Defense)
    let tips = [
        { title: '檢查更新', text: '開啟軟體或 App 設定，確認已升級至官方最新安全版本。', icon: 'fa-arrow-up-right-dots' },
        { title: '密碼保全', text: '切勿在不同平台共用同一組密碼，並於重要帳戶全面啟用雙重驗證 (2FA)。', icon: 'fa-key' },
        { title: '提高警覺', text: '不點擊來路不明之連結與附件，帳號異常請主動向官方客服或撥打 165 查證。', icon: 'fa-shield-halved' }
    ];

    if (crowd.includes('網銀') || full.includes('轉帳') || full.includes('盜刷')) {
        tips = [
          { title: '定期對帳', text: '開啟網銀交易推播即時通知，定期檢視近一週存款與交易紀錄是否有不明扣款。', icon: 'fa-receipt' },
          { title: '更換密碼', text: '立即變更網銀登入密碼與交易密碼，切勿將帳密記錄在手機備忘錄或通訊軟體。', icon: 'fa-key' },
          { title: '雙重驗證', text: '非約定轉帳與敏感登入一律啟用手機生物辨識或動態 OTP 安全驗證。', icon: 'fa-fingerprint' }
        ];
    } else if (crowd.includes('網購') || full.includes('訂單')) {
        tips = [
          { title: '防假客服', text: '接獲自稱電商平台、銀行客服告知「誤設分期扣款或解除設定」必為詐騙，立即掛斷。', icon: 'fa-phone-slash' },
          { title: '簡訊防詐', text: '收到包裹未領取或要求點擊短網址補繳運費之簡訊，切勿點擊輸入信用卡號。', icon: 'fa-comment-slash' },
          { title: '獨立卡號', text: '網購建議使用有額度限制之虛擬信用卡或設定單筆交易上限以控制風險。', icon: 'fa-credit-card' }
        ];
    } else if (crowd.includes('智慧家庭') || full.includes('冷凍') || full.includes('監視器')) {
        tips = [
          { title: '改預設碼', text: '家用監視器、路由器與連網設備出廠預設密碼最容易被掃描破解，請立即改為高強度密碼。', icon: 'fa-lock' },
          { title: '關遠端連', text: '若平時人在家中不需要在外遙控，請於設備後台關閉「WAN遠端連線」或「UPnP」功能。', icon: 'fa-network-wired' },
          { title: '升級韌體', text: '登入設備管理後台點選「韌體升級」，確保修補原廠已知安全漏洞。', icon: 'fa-rotate' }
        ];
    } else if (crowd.includes('瀏覽器')) {
        tips = [
          { title: '重啟更新', text: '點擊瀏覽器右上角選單 ➔ 說明 ➔ 關於，讓瀏覽器自動下載更新並重新啟動。', icon: 'fa-rotate' },
          { title: '清理外掛', text: '移除平時沒在使用的瀏覽器擴充套件 (Extensions)，減少被植入廣告惡意程式風險。', icon: 'fa-puzzle-piece' },
          { title: '防釣魚網', text: '登入帳號前仔細核對網址列開頭是否為官方正版網域，切勿輕信假搜尋廣告。', icon: 'fa-link' }
        ];
    } else if (crowd.includes('手機') || crowd.includes('通訊')) {
        tips = [
          { title: '防輔助認證', text: '千萬不要幫任何人做「LINE 輔助認證」或給出簡訊認證碼，這是典型的盜帳號手法。', icon: 'fa-user-lock' },
          { title: '系統自動更新', text: '前往手機設定 ➔ 軟體更新，確保 Android 或 iOS 作業系統維持在最新版本。', icon: 'fa-mobile' },
          { title: '謹慎授權', text: '安裝新 App 時注意要求之權限，不輕易授權通訊錄、相簿或麥克風存取。', icon: 'fa-hand' }
        ];
    }

    // 5. 去除冰冷 CVE 代碼後的友善生活化標題
    let plainTitle = title
        .replace(/，修補高風險漏洞CVE-\d{4}-\d+/gi, '：官方釋出重大安全更新，請盡速升級')
        .replace(/，修補重大漏洞CVE-\d{4}-\d+/gi, '：官方釋出緊急安全性修補')
        .replace(/CVE-\d{4}-\d+/gi, '')
        .replace(/【CVSS\s*[\d.]+】/gi, '')
        .replace(/CVSS\s*[\d.]+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return {
        crowd,
        crowdIcon,
        crowdTag,
        riskLevel,
        riskBadge,
        riskColor,
        lifeSummary,
        tips,
        plainTitle
    };
}
