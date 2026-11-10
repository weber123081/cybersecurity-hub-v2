<script setup>
import { ref, computed } from 'vue';
import { analyzeLifePerspective } from '../utils/lifeAnalyzer.js';

const props = defineProps({
  post: {
    type: Object,
    required: true
  },
  viewCount: {
    type: Number,
    default: 0
  },
  searchQuery: {
    type: String,
    default: ''
  },
  compact: {
    type: Boolean,
    default: true
  },
  bookmarked: {
    type: Boolean,
    default: undefined
  },
  viewPerspective: {
    type: String,
    default: 'life' // 'life' (大眾生活模式) | 'pro' (IT 專業模式)
  }
});

const emit = defineEmits(['bookmark-change', 'view-tracked']);

const isExpanded = ref(false);
const MAX_LENGTH = 150;
const copied = ref(false);

const bookmarkedIds = ref(JSON.parse(localStorage.getItem('cyberhub_bookmarks') || '[]'));
const isBookmarked = computed(() => {
    if (typeof props.bookmarked === 'boolean') return props.bookmarked;
    return bookmarkedIds.value.includes(props.post.id);
});

const toggleBookmark = (e) => {
    if (e) e.stopPropagation();
    let bookmarks = JSON.parse(localStorage.getItem('cyberhub_bookmarks') || '[]');
    if (bookmarks.includes(props.post.id)) {
        bookmarks = bookmarks.filter(id => id !== props.post.id);
    } else {
        bookmarks.push(props.post.id);
    }
    localStorage.setItem('cyberhub_bookmarks', JSON.stringify(bookmarks));
    bookmarkedIds.value = bookmarks;
    emit('bookmark-change', bookmarks);
};

const articleRef = ref(null);

async function trackView() {
    if (!isExpanded.value) {
        isExpanded.value = true;
        emit('view-tracked', props.post.id);
        try {
            await fetch(`/api/stats/post-view/${props.post.id}`, { method: 'POST' });
        } catch (e) {
            console.error('Failed to track post view', e);
        }
    } else {
        isExpanded.value = false;
        if (articleRef.value) {
            const yOffset = -80;
            const y = articleRef.value.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }
}

const cleanContent = computed(() => {
    if (!props.post.content) return '';
    return props.post.content.replace(/(\n\n\d{4}-\d{2}-\d{2})+$/, '').trim();
});

const needsExpansion = computed(() => {
    return cleanContent.value.length > MAX_LENGTH;
});

const displayContent = computed(() => {
    if (!cleanContent.value) return '';
    if (isExpanded.value || cleanContent.value.length <= MAX_LENGTH) {
        return cleanContent.value;
    }
    return cleanContent.value.substring(0, MAX_LENGTH) + '...';
});

// Life Perspective Analyzer
const lifeData = computed(() => {
    return analyzeLifePerspective(props.post);
});

// Detect CVE IDs
const cveList = computed(() => {
    const fullText = (props.post.title || '') + ' ' + (cleanContent.value || '');
    const matches = fullText.match(/CVE-\d{4}-\d{4,7}/gi);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.toUpperCase()))].slice(0, 3);
});

// Detect High-Risk / Zero-Day
const isCritical = computed(() => {
    const t = (props.post.title || '').toLowerCase();
    const c = (cleanContent.value || '').toLowerCase();
    return t.includes('0-day') || t.includes('零時差') || t.includes('重大') || 
           t.includes('高危') || t.includes('緊急') || t.includes('critical') || 
           c.includes('零時差漏洞') || c.includes('重大漏洞');
});

const readingTime = computed(() => {
    const len = cleanContent.value.length;
    if (len < 200) return '約 1 分鐘';
    const mins = Math.ceil(len / 350);
    return `約 ${mins} 分鐘`;
});

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const highlightedTitle = computed(() => {
    const title = props.post.title || '';
    if (!props.searchQuery || !props.searchQuery.trim()) {
        return escapeHtml(title);
    }
    const q = props.searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escapeHtml(title).replace(new RegExp(`(${q})`, 'gi'), '<mark class="highlight-query">$1</mark>');
});

const highlightedContent = computed(() => {
    const content = displayContent.value;
    if (!props.searchQuery || !props.searchQuery.trim()) {
        return escapeHtml(content);
    }
    const q = props.searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escapeHtml(content).replace(new RegExp(`(${q})`, 'gi'), '<mark class="highlight-query">$1</mark>');
});

const highlightedFullContent = computed(() => {
    const content = cleanContent.value;
    if (!props.searchQuery || !props.searchQuery.trim()) {
        return escapeHtml(content);
    }
    const q = props.searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escapeHtml(content).replace(new RegExp(`(${q})`, 'gi'), '<mark class="highlight-query">$1</mark>');
});

const copySummary = async () => {
    try {
        let text = '';
        if (props.viewPerspective === 'life' && lifeData.value) {
            const steps = lifeData.value.tips.map((t, i) => `${i+1}. 【${t.title}】${t.text}`).join('\n');
            text = `【生活資安自保提醒】${props.post.title}\n👥 留意族群：${lifeData.value.crowd}\n⚠️ 風險程度：${lifeData.value.riskBadge}\n\n💡 30秒生活重點：\n${lifeData.value.lifeSummary}\n\n🛡️ 生活自保 3 招：\n${steps}\n\n（來源：生活資安觀測站）`;
        } else {
            text = `【資安情報】${props.post.title}\n分類：${props.post.category} · 發布時間：${props.post.timeAgo}\n\n${cleanContent.value.slice(0, 150)}...\n\n（來源：生活資安觀測站）`;
        }
        await navigator.clipboard.writeText(text);
        copied.value = true;
        setTimeout(() => {
            copied.value = false;
        }, 2200);
    } catch (e) {
        console.error('Copy failed', e);
    }
};

const actionTakeaway = computed(() => {
    const full = ((props.post.title || '') + ' ' + (cleanContent.value || '')).toLowerCase();

    if (full.includes('更新') || full.includes('修補') || full.includes('漏洞') || full.includes('cve-') || full.includes('零時差') || full.includes('0-day')) {
        return {
            type: 'update',
            icon: 'fa-wrench',
            label: '🛡️ 防護動作',
            text: '請立即至系統設定檢查更新，儘速套用官方發布之最新安全修補程式。'
        };
    }
    if (full.includes('釣魚') || full.includes('詐騙') || full.includes('簡訊') || full.includes('假冒') || full.includes('點數') || full.includes('社交工程')) {
        return {
            type: 'phishing',
            icon: 'fa-user-shield',
            label: '⚠️ 防詐提醒',
            text: '切勿點擊來源不明之連結、簡訊或可疑郵件附檔，任何金流與帳密請主動循官方管道查證。'
        };
    }
    if (full.includes('密碼') || full.includes('帳號') || full.includes('外洩') || full.includes('登入') || full.includes('憑證')) {
        return {
            type: 'account',
            icon: 'fa-key',
            label: '🔑 帳號保全',
            text: '建議更換具備 12 碼以上之高強度密碼，並於所有公私帳戶全面啟用雙重驗證 (2FA)。'
        };
    }
    if (full.includes('勒索') || full.includes('加密') || full.includes('備份') || full.includes('ransomware')) {
        return {
            type: 'ransomware',
            icon: 'fa-box-archive',
            label: '💾 備份指引',
            text: '落實關鍵業務資料 3-2-1 離線備份原則，切勿任意執行可疑 Office 巨集或不明腳本。'
        };
    }
    if (full.includes('手機') || full.includes('iphone') || full.includes('android') || full.includes('蘋果') || full.includes('app')) {
        return {
            type: 'mobile',
            icon: 'fa-mobile-screen-button',
            label: '📱 裝置安全',
            text: '定期檢視 App 之相機、麥克風與定位權限，切勿自第三方未知網站下載安裝應用程式。'
        };
    }
    return {
        type: 'general',
        icon: 'fa-shield-halved',
        label: '💡 自保建議',
        text: '落實日常資訊安全良好習慣，公私電腦與帳號分流，發現異常活動請第一時間通報。'
    };
});
</script>

<template>
  <article class="post" ref="articleRef" :class="{ 'critical-post': isCritical, 'is-expanded': isExpanded, 'is-life-mode': viewPerspective === 'life' }">
    <div class="post-header">
      <div class="post-avatar" :class="{ 'life-avatar': viewPerspective === 'life' }">
        <i :class="['fa-solid', viewPerspective === 'life' ? (lifeData ? lifeData.crowdIcon : 'fa-house-user') : (post.authorIcon || 'fa-shield-halved')]"></i>
      </div>
      <div class="post-meta">
        <span class="post-author">{{ viewPerspective === 'life' ? (lifeData ? lifeData.crowdTag : post.authorName) : post.authorName }}</span>
        <span class="post-time">
          {{ post.timeAgo }} · <i class="fa-solid fa-earth-americas"></i> {{ post.category }}
          · <i class="fa-solid fa-eye"></i> {{ viewCount }} 次瀏覽
          · <i class="fa-regular fa-clock"></i> {{ readingTime }}
        </span>
      </div>
      
      <div class="header-badges">
        <span v-if="post.isPinned" class="severity-badge pinned" title="管理員置頂之重要資安公告">
          <i class="fa-solid fa-thumbtack"></i> 置頂
        </span>
        <span v-if="isCritical" class="severity-badge critical" title="經研判為高危險性或緊急資安情報">
          <i class="fa-solid fa-triangle-exclamation"></i> 緊急警報
        </span>
        <button class="bookmark-btn" @click="toggleBookmark" :class="{ active: isBookmarked }" :title="isBookmarked ? '取消收藏' : '收藏此情報'">
          <i :class="[isBookmarked ? 'fa-solid' : 'fa-regular', 'fa-bookmark']"></i>
        </button>
      </div>
    </div>

    <!-- LIFE PERSPECTIVE: Crowd & Risk Strip -->
    <div class="life-strip" v-if="viewPerspective === 'life' && lifeData">
      <span class="life-crowd-chip">
        <i :class="['fa-solid', lifeData.crowdIcon]"></i>
        <span>{{ lifeData.crowd }}</span>
      </span>
      <span class="life-risk-chip" :class="lifeData.riskLevel">
        {{ lifeData.riskBadge }}
      </span>
    </div>

    <!-- PRO PERSPECTIVE: CVE Tag Strip -->
    <div class="cve-strip" v-else-if="cveList.length > 0">
      <span class="cve-label"><i class="fa-solid fa-bug"></i> 關聯漏洞：</span>
      <span v-for="cve in cveList" :key="cve" class="cve-tag">
        {{ cve }}
      </span>
    </div>
    
    <div class="post-content">
      <h2 class="post-title" v-html="highlightedTitle"></h2>

      <!-- LIFE PERSPECTIVE BODY -->
      <template v-if="viewPerspective === 'life' && lifeData">
        <!-- 30s Plain TLDR Box -->
        <div class="life-summary-box">
          <div class="life-summary-header">
            <i class="fa-solid fa-lightbulb"></i>
            <span>30秒生活重點</span>
          </div>
          <div class="life-summary-text">
            {{ lifeData.lifeSummary }}
          </div>
        </div>

        <!-- 3-Step Life Defense Cards -->
        <div class="life-tips-container">
          <div class="life-tips-heading">
            <i class="fa-solid fa-shield-halved"></i>
            <span>生活自保 3 招</span>
          </div>
          <div class="life-tips-grid">
            <div class="life-tip-card" v-for="(tip, idx) in lifeData.tips" :key="idx">
              <div class="tip-card-header">
                <span class="tip-step-num">{{ idx + 1 }}</span>
                <i :class="['fa-solid', tip.icon, 'tip-icon']"></i>
                <span class="tip-title">{{ tip.title }}</span>
              </div>
              <p class="tip-text">{{ tip.text }}</p>
            </div>
          </div>
        </div>

        <!-- Background details when expanded -->
        <div class="post-expanded-body" v-if="isExpanded">
          <div class="expanded-divider">
            <span><i class="fa-solid fa-align-left"></i> 詳細報導背景 (提供對照參考)</span>
          </div>
          <div class="post-full-text" v-html="highlightedFullContent"></div>
        </div>
      </template>

      <!-- PRO PERSPECTIVE BODY -->
      <template v-else>
        <!-- Actionable Guidance Takeaway (30s Lazy Bag) -->
        <div class="action-takeaway-bar" :class="actionTakeaway.type">
          <div class="takeaway-badge">
            <i :class="['fa-solid', actionTakeaway.icon]"></i>
            <span>{{ actionTakeaway.label }}</span>
          </div>
          <div class="takeaway-text">
            {{ actionTakeaway.text }}
          </div>
        </div>

        <!-- Preview Text: Only shown in detailed mode when not expanded -->
        <div class="post-preview-text" v-if="!compact && !isExpanded && cleanContent">
          <span v-html="highlightedContent"></span>
        </div>

        <!-- Full Article Body: Only shown when user clicks to read details -->
        <div class="post-expanded-body" v-if="isExpanded">
          <div class="expanded-divider">
            <span><i class="fa-solid fa-align-left"></i> 詳細報導內容</span>
          </div>
          <div class="post-full-text" v-html="highlightedFullContent"></div>
        </div>
      </template>
    </div>

    <!-- Post Action Footer -->
    <div class="post-actions">
      <button class="action-btn" @click="trackView" :class="{ 'btn-active': isExpanded }">
        <i :class="['fa-solid', isExpanded ? 'fa-compress' : 'fa-book-open-reader']"></i>
        <span>{{ isExpanded ? '收起內容 ▲' : (viewPerspective === 'life' ? '查看背景內文 ▼' : '閱讀詳細內文 ▼') }}</span>
      </button>

      <button class="action-btn" @click="copySummary" :class="{ 'btn-success': copied }">
        <i :class="['fa-solid', copied ? 'fa-check' : 'fa-copy']"></i>
        <span>{{ copied ? '已複製！' : (viewPerspective === 'life' ? '複製自保指南' : '複製摘要') }}</span>
      </button>

      <a v-if="post.originalUrl" :href="post.originalUrl" target="_blank" rel="noopener noreferrer" class="action-btn">
        <i class="fa-solid fa-arrow-up-right-from-square"></i>
        <span>查看原文</span>
      </a>
    </div>
  </article>
</template>

<style scoped>
.post {
    background-color: var(--bg-card);
    border-radius: var(--radius-md, 12px);
    box-shadow: var(--shadow-card);
    border: 1px solid var(--border-color);
    overflow: hidden;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease, border-color 0.25s ease;
    margin-bottom: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.post:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
    border-color: rgba(37, 99, 235, 0.25);
}

.dark-theme .post:hover {
    border-color: rgba(56, 189, 248, 0.35);
}

.post.critical-post {
    border-left: 3.5px solid var(--danger-color, #ef4444);
}

.post.is-expanded {
    grid-column: 1 / -1;
}

@keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}

.post-header {
    padding: 1.15rem 1.4rem 0.65rem;
    display: flex;
    align-items: center;
    gap: 0.85rem;
}

.post-avatar {
    width: 38px;
    height: 38px;
    background: linear-gradient(135deg, var(--primary-color), #2563eb);
    color: white;
    border-radius: 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.05rem;
    font-weight: 600;
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
}

.post-avatar.life-avatar {
    background: linear-gradient(135deg, #10b981, #059669);
    box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
}

.post-meta {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
}

.post-author {
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text-primary);
    letter-spacing: -0.01em;
}

.post-time {
    color: var(--text-secondary);
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 1px;
}

.header-badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
}

.severity-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
}

.severity-badge.pinned {
    background-color: rgba(37, 99, 235, 0.12);
    color: var(--primary-color);
    border: 1px solid rgba(37, 99, 235, 0.25);
}

.severity-badge.critical {
    background-color: rgba(239, 68, 68, 0.12);
    color: var(--danger-color, #ef4444);
    border: 1px solid rgba(239, 68, 68, 0.3);
    animation: pulseAlert 2.5s infinite;
}

@keyframes pulseAlert {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

.bookmark-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1.05rem;
    padding: 0.35rem 0.45rem;
    border-radius: 6px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.bookmark-btn:hover {
    color: #eab308;
    background-color: rgba(234, 179, 8, 0.12);
}

.bookmark-btn.active {
    color: #eab308;
}

/* Life Mode: Strip */
.life-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 1.4rem 0.65rem;
}

.life-crowd-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    font-weight: 700;
    color: #065f46;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 0.22rem 0.65rem;
    border-radius: 9999px;
}

.dark-theme .life-crowd-chip {
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.18);
    border-color: rgba(16, 185, 129, 0.4);
}

.life-risk-chip {
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.2rem 0.55rem;
    border-radius: 6px;
}

.life-risk-chip.critical {
    background: rgba(239, 68, 68, 0.12);
    color: #dc2626;
    border: 1px solid rgba(239, 68, 68, 0.3);
}

.life-risk-chip.high {
    background: rgba(249, 115, 22, 0.12);
    color: #ea580c;
    border: 1px solid rgba(249, 115, 22, 0.3);
}

.life-risk-chip.medium {
    background: rgba(245, 158, 11, 0.12);
    color: #d97706;
    border: 1px solid rgba(245, 158, 11, 0.3);
}

.dark-theme .life-risk-chip.critical { color: #fca5a5; }
.dark-theme .life-risk-chip.high { color: #fdba74; }
.dark-theme .life-risk-chip.medium { color: #fde68a; }

/* CVE Strip */
.cve-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 0 1.4rem 0.65rem;
}

.cve-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-secondary);
}

.cve-tag {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.75rem;
    font-weight: 700;
    color: #b91c1c;
    background-color: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    letter-spacing: -0.02em;
}

.dark-theme .cve-tag {
    color: #f87171;
    background-color: rgba(239, 68, 68, 0.18);
    border-color: rgba(239, 68, 68, 0.35);
}

.post-content {
    padding: 0 1.4rem 1.15rem;
    flex-grow: 1;
}

.post-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.45;
    margin-bottom: 0.85rem;
    letter-spacing: -0.01em;
}

/* LIFE MODE: 30s Plain Summary */
.life-summary-box {
    background: linear-gradient(135deg, rgba(240, 253, 244, 0.85), rgba(240, 249, 255, 0.85));
    border: 1px solid rgba(16, 185, 129, 0.25);
    border-radius: 10px;
    padding: 0.75rem 0.95rem;
    margin-bottom: 0.85rem;
}

.dark-theme .life-summary-box {
    background: linear-gradient(135deg, rgba(6, 78, 59, 0.25), rgba(30, 58, 138, 0.25));
    border-color: rgba(16, 185, 129, 0.35);
}

.life-summary-header {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.82rem;
    font-weight: 700;
    color: #059669;
    margin-bottom: 0.35rem;
}

.dark-theme .life-summary-header {
    color: #34d399;
}

.life-summary-text {
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--text-primary);
    font-weight: 500;
}

/* LIFE MODE: 3-Step Defense Cards */
.life-tips-container {
    margin-bottom: 0.85rem;
}

.life-tips-heading {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
}

.life-tips-heading i {
    color: #10b981;
}

.life-tips-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.55rem;
}

@media (max-width: 640px) {
    .life-tips-grid {
        grid-template-columns: 1fr;
    }
}

.life-tip-card {
    background: var(--bg-hover, rgba(0, 0, 0, 0.02));
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0.6rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    transition: all 0.2s ease;
}

.life-tip-card:hover {
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.04);
}

.dark-theme .life-tip-card {
    background: rgba(255, 255, 255, 0.03);
}

.tip-card-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.tip-step-num {
    width: 18px;
    height: 18px;
    background: #10b981;
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.tip-icon {
    font-size: 0.78rem;
    color: #059669;
}

.dark-theme .tip-icon {
    color: #34d399;
}

.tip-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-primary);
}

.tip-text {
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--text-secondary);
    margin: 0;
}

/* Action Takeaway (PRO MODE) */
.action-takeaway-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 0.95rem;
    border-radius: 8px;
    margin-bottom: 0.95rem;
    font-size: 0.92rem;
    line-height: 1.5;
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.25);
    color: var(--text-primary);
}

.action-takeaway-bar.update {
    background: rgba(59, 130, 246, 0.08);
    border-color: rgba(59, 130, 246, 0.25);
}

.action-takeaway-bar.phishing {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.25);
}

.action-takeaway-bar.account {
    background: rgba(234, 88, 12, 0.08);
    border-color: rgba(234, 88, 12, 0.25);
}

.action-takeaway-bar.ransomware {
    background: rgba(168, 85, 247, 0.08);
    border-color: rgba(168, 85, 247, 0.25);
}

.takeaway-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 700;
    font-size: 0.82rem;
    white-space: nowrap;
    padding: 0.2rem 0.55rem;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.06);
    flex-shrink: 0;
}

.dark-theme .takeaway-badge {
    background: rgba(255, 255, 255, 0.12);
}

.action-takeaway-bar.update .takeaway-badge { color: #2563eb; }
.action-takeaway-bar.phishing .takeaway-badge { color: #dc2626; }
.action-takeaway-bar.account .takeaway-badge { color: #ea580c; }
.action-takeaway-bar.ransomware .takeaway-badge { color: #9333ea; }
.action-takeaway-bar.general .takeaway-badge { color: #059669; }

.takeaway-text {
    flex: 1;
    font-weight: 500;
    color: var(--text-primary);
}

.post-preview-text {
    font-size: 0.92rem;
    line-height: 1.6;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
}

.post-expanded-body {
    margin-top: 0.85rem;
}

.expanded-divider {
    display: flex;
    align-items: center;
    margin-bottom: 0.75rem;
    border-bottom: 1px dashed var(--border-color);
    padding-bottom: 0.4rem;
}

.expanded-divider span {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
}

.post-full-text {
    font-size: 0.93rem;
    line-height: 1.7;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
}

.post-actions {
    display: flex;
    border-top: 1px solid var(--border-color);
    background-color: var(--bg-hover, rgba(0, 0, 0, 0.015));
    padding: 0.35rem 0.5rem;
    margin-top: auto;
}

.action-btn {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.45rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.86rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s ease;
}

.action-btn:hover {
    background-color: rgba(0, 0, 0, 0.04);
    color: var(--primary-color);
}

.dark-theme .action-btn:hover {
    background-color: rgba(255, 255, 255, 0.06);
}

.action-btn.btn-success {
    color: #10b981;
}

.action-btn.btn-active {
    color: var(--primary-color);
}

/* Global / Unscoped style for highlight-query */
:deep(.highlight-query) {
    background-color: #fef08a;
    color: #854d0e;
    padding: 0 2px;
    border-radius: 2px;
    font-weight: 600;
}

.dark-theme :deep(.highlight-query) {
    background-color: #854d0e;
    color: #fef08a;
}


@media (max-width: 480px) {
    .post-header {
        padding: 0.75rem 0.85rem 0.5rem;
        gap: 0.6rem;
    }
    .post-avatar {
        width: 36px;
        height: 36px;
        font-size: 1rem;
    }
    .post-author {
        font-size: 0.88rem;
    }
    .post-time {
        font-size: 0.72rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.2rem 0.4rem;
    }
    .post-content {
        padding: 0 0.85rem 0.75rem;
    }
    .post-title {
        font-size: 1.02rem;
        line-height: 1.45;
    }
    .life-summary-box {
        padding: 0.65rem 0.8rem;
        font-size: 0.86rem;
    }
    .post-actions {
        padding: 0.25rem 0.35rem;
        gap: 0.2rem;
    }
    .action-btn {
        font-size: 0.76rem;
        padding: 0.45rem 0.25rem;
        gap: 0.25rem;
    }
}
</style>
