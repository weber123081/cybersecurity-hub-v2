<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PostCard from '../components/PostCard.vue'
import SkeletonCard from '../components/SkeletonCard.vue'
import ReportModal from '../components/ReportModal.vue'

const route = useRoute();
const router = useRouter();
const posts = ref([]);
const loading = ref(true);
const fetchError = ref(false);
const activeCategory = ref(route.query.cat || '全部動態');
const searchQuery = ref(route.query.q || '');
const sortBy = ref('latest'); // 'latest' | 'views'
const feedMode = ref(localStorage.getItem('cyberhub_feed_mode') || 'compact'); // 'compact' | 'detailed'
const showAnnouncement = ref(true);
const showReportModal = ref(route.query.report === '1');
const filterCriticalOnly = ref(false);
const filterCveOnly = ref(false);

const handleOpenReportEvent = () => {
  showReportModal.value = true;
};

watch(() => route.query.report, (val) => {
  if (val === '1') {
    showReportModal.value = true;
    router.replace({ query: { ...route.query, report: undefined } });
  }
});

function isPostCritical(post) {
  const t = (post.title || '').toLowerCase();
  const c = (post.content || '').toLowerCase();
  return t.includes('0-day') || t.includes('零時差') || t.includes('重大') || 
         t.includes('高危') || t.includes('緊急') || t.includes('critical') || 
         c.includes('零時差漏洞') || c.includes('重大漏洞');
}

function hasPostCve(post) {
  const full = (post.title || '') + ' ' + (post.content || '');
  return /CVE-\d{4}-\d{4,7}/i.test(full);
}

const criticalCount = computed(() => posts.value.filter(isPostCritical).length);
const cveCount = computed(() => posts.value.filter(hasPostCve).length);

function setFeedMode(mode) {
  feedMode.value = mode;
  localStorage.setItem('cyberhub_feed_mode', mode);
}

const PAGE_SIZE = 12;
const visibleCount = ref(PAGE_SIZE);

const categories = [
  { name: '全部動態', icon: 'fa-border-all' },
  { name: '已收藏文章', icon: 'fa-bookmark' },
  { name: '系統弱點', icon: 'fa-bug' },
  { name: '詐騙防範', icon: 'fa-mask' },
  { name: '密碼與帳號', icon: 'fa-key' },
  { name: '網路與隱私', icon: 'fa-wifi' },
  { name: '手機安全', icon: 'fa-mobile-screen' },
  { name: '軟體安全', icon: 'fa-virus' },
  { name: '新興技術', icon: 'fa-robot' },
  { name: '綜合動態', icon: 'fa-shield-halved' }
];

const stats = ref({ totalViews: 0, onlineCount: 0, postViews: {} });
const bookmarkedIds = ref(JSON.parse(localStorage.getItem('cyberhub_bookmarks') || '[]'));

function handleBookmarkChange(updatedBookmarks) {
  bookmarkedIds.value = Array.isArray(updatedBookmarks)
    ? [...updatedBookmarks]
    : JSON.parse(localStorage.getItem('cyberhub_bookmarks') || '[]');
}

function handleViewTracked(postId) {
  if (!stats.value.postViews) stats.value.postViews = {};
  stats.value.postViews[postId] = (stats.value.postViews[postId] || 0) + 1;
}

// Calculate category counts
const categoryCounts = computed(() => {
  const counts = {};
  const bookmarks = bookmarkedIds.value;
  counts['全部動態'] = posts.value.length;
  counts['已收藏文章'] = posts.value.filter(p => bookmarks.includes(p.id)).length;

  for (const post of posts.value) {
    if (post.category) {
      counts[post.category] = (counts[post.category] || 0) + 1;
    }
  }
  return counts;
});

const filteredPosts = computed(() => {
  let result = [...posts.value];
  
  if (activeCategory.value === '已收藏文章') {
    const bookmarks = bookmarkedIds.value;
    result = result.filter(post => bookmarks.includes(post.id));
  } else if (activeCategory.value !== '全部動態') {
    result = result.filter(post => post.category === activeCategory.value);
  }
  
  if (searchQuery.value.trim()) {
    const rawQ = searchQuery.value.toLowerCase().trim();
    const cleanQ = rawQ.replace(/\(.*?\)/g, '').trim();
    const tokens = (cleanQ || rawQ).split(/\s+/).filter(t => t.length > 0);

    result = result.filter(post => {
      const title = (post.title || '').toLowerCase();
      const content = (post.content || '').toLowerCase();

      // 1. Direct contains
      if (title.includes(rawQ) || content.includes(rawQ)) return true;
      if (cleanQ && (title.includes(cleanQ) || content.includes(cleanQ))) return true;

      // 2. All tokens match
      if (tokens.length > 0 && tokens.every(tok => title.includes(tok) || content.includes(tok))) return true;

      // 3. Fallback: Any token with length >= 2 matches
      return tokens.some(tok => tok.length >= 2 && (title.includes(tok) || content.includes(tok)));
    });
  }

  if (filterCriticalOnly.value) {
    result = result.filter(isPostCritical);
  }

  if (filterCveOnly.value) {
    result = result.filter(hasPostCve);
  }

  if (sortBy.value === 'views') {
    const viewsMap = (stats.value && stats.value.postViews) || {};
    result.sort((a, b) => (viewsMap[b.id] || 0) - (viewsMap[a.id] || 0));
  }
  
  return result;
});

const displayedPosts = computed(() => {
  return filteredPosts.value.slice(0, visibleCount.value);
});

const hasMore = computed(() => {
  return visibleCount.value < filteredPosts.value.length;
});

function loadMore() {
  visibleCount.value += PAGE_SIZE;
}

// Reset visible count when filters change
watch([activeCategory, searchQuery, sortBy, filterCriticalOnly, filterCveOnly], () => {
  visibleCount.value = PAGE_SIZE;
});

watch(() => route.query.cat, (newCat) => {
  if (newCat) {
    activeCategory.value = newCat;
  }
});

watch(() => route.query.q, (newQ) => {
  if (typeof newQ === 'string') {
    searchQuery.value = newQ;
  }
});

function clearSearch() {
  searchQuery.value = '';
  if (route.query.q) {
    router.replace({ query: { ...route.query, q: undefined } });
  }
}

async function fetchLiveNews() {
    loading.value = true;
    fetchError.value = false;
    
    try {
        const response = await fetch('/data/news.json?t=' + Date.now());
        if (!response.ok) throw new Error("Fetch failed: " + response.status);
        
        const data = await response.json();
        posts.value = data;
    } catch (error) {
        console.error("Error in fetchLiveNews:", error);
        fetchError.value = true;
    } finally {
        loading.value = false;
    }
}

async function fetchStats() {
    try {
        const response = await fetch('/api/stats/summary');
        if (response.ok) {
            const data = await response.json();
            stats.value = data;
        }
    } catch (error) {
        console.error("Failed to load stats:", error);
    }
}

const dictionary = ref([]);
const currentTip = ref(null);

async function fetchDictionary() {
    try {
        const response = await fetch('/data/dictionary.json');
        if (response.ok) {
            dictionary.value = await response.json();
            rotateTip();
        }
    } catch (error) {
        console.error("Failed to load dictionary:", error);
    }
}

function rotateTip() {
    if (dictionary.value.length > 0) {
        const randomIndex = Math.floor(Math.random() * dictionary.value.length);
        currentTip.value = dictionary.value[randomIndex];
    }
}

let statsInterval = null;
let tipInterval = null;

onMounted(() => {
    fetchLiveNews();
    fetchStats();
    fetchDictionary();
    window.addEventListener('open-report-modal', handleOpenReportEvent);
    
    if (route.query.report === '1') {
        showReportModal.value = true;
    }

    setTimeout(() => {
        if (loading.value) {
            loading.value = false;
        }
    }, 3000);

    statsInterval = setInterval(fetchStats, 10000);
    tipInterval = setInterval(rotateTip, 30000);
});

onUnmounted(() => {
    window.removeEventListener('open-report-modal', handleOpenReportEvent);
    if (statsInterval) clearInterval(statsInterval);
    if (tipInterval) clearInterval(tipInterval);
});
</script>

<template>
  <main class="main-container">
    <!-- Left Sidebar -->
    <aside class="sidebar left-sidebar">
      <!-- Prominent Monthly Report Card -->
      <div class="widget report-cta-widget">
        <div class="report-cta-header">
          <i class="fa-solid fa-file-shield"></i>
          <span>高危威脅情資月報</span>
        </div>
        <p class="report-cta-desc">自動抓取最嚴重 CVSS / 0-day 漏洞並排除重複情資，一鍵匯出標準 6 欄月報</p>
        <button class="sidebar-report-btn" @click="showReportModal = true">
          <i class="fa-solid fa-table-list"></i> 匯出高危月報
        </button>
      </div>

      <div class="widget categories-widget">
        <h3><i class="fa-solid fa-layer-group"></i> 分類主題</h3>
        <ul>
          <li v-for="cat in categories" :key="cat.name" 
              :class="{ active: activeCategory === cat.name }"
              @click="activeCategory = cat.name">
            <span class="cat-name-icon">
              <i :class="['fa-solid', cat.icon]"></i> {{ cat.name }}
            </span>
            <span class="cat-badge" v-if="categoryCounts[cat.name] !== undefined">
              {{ categoryCounts[cat.name] }}
            </span>
          </li>
        </ul>
      </div>
      <div class="widget hotline-widget">
        <h3><i class="fa-solid fa-phone-volume" style="color: var(--danger-color);"></i> 資安通報窗口</h3>
        <div class="hotline-list">
          <div class="hotline-row">
            <span class="hotline-name"><i class="fa-solid fa-shield-virus"></i> 內網資安專線</span>
            <span class="hotline-val">分機 #1199</span>
          </div>
          <div class="hotline-row">
            <span class="hotline-name"><i class="fa-solid fa-user-shield"></i> 警政署反詐專線</span>
            <span class="hotline-val">直撥 165</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Feed -->
    <section class="feed">
      <!-- Internal Notice Banner -->
      <div class="announcement-banner" v-if="showAnnouncement">
        <div class="announcement-content">
          <div class="announcement-icon">
            <i class="fa-solid fa-bullhorn"></i>
          </div>
          <div class="announcement-text">
            <strong>資訊安全防護宣導：</strong>
            近期針對內部企業之社交工程釣魚信件頻傳，請全體同仁切勿點擊不明郵件附件或短網址，發現異常請即刻通報資訊單位！
          </div>
        </div>
        <button class="announcement-close" @click="showAnnouncement = false" title="關閉公告">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Quick Horizontal Category Chips Bar -->
      <div class="category-chips-bar" v-if="!loading && !fetchError">
        <button 
          v-for="cat in categories" 
          :key="cat.name"
          class="category-chip"
          :class="{ active: activeCategory === cat.name }"
          @click="activeCategory = cat.name"
        >
          <i :class="['fa-solid', cat.icon]"></i>
          <span class="chip-label">{{ cat.name }}</span>
          <span class="chip-badge" v-if="categoryCounts[cat.name] !== undefined">
            {{ categoryCounts[cat.name] }}
          </span>
        </button>
      </div>

      <!-- Feed Controls Strip -->
      <div class="feed-controls" v-if="!loading && !fetchError">
        <div class="controls-status">
          <span class="current-filter">
            <i class="fa-solid fa-filter"></i> <strong>{{ activeCategory }}</strong>
          </span>
          <span class="post-total-count">
            共 {{ filteredPosts.length }} 則情報
          </span>
          <span v-if="searchQuery" class="active-query-tag">
            搜尋：「{{ searchQuery }}」
            <i class="fa-solid fa-xmark query-clear-icon" @click="clearSearch"></i>
          </span>
          <span v-if="filterCriticalOnly" class="active-query-tag alert-filter-tag">
            🚨 僅看緊急高危
            <i class="fa-solid fa-xmark query-clear-icon" @click="filterCriticalOnly = false"></i>
          </span>
          <span v-if="filterCveOnly" class="active-query-tag cve-filter-tag">
            🐛 僅看 CVE 漏洞
            <i class="fa-solid fa-xmark query-clear-icon" @click="filterCveOnly = false"></i>
          </span>
        </div>

        <div class="controls-actions">
          <!-- Advanced Quick Filters (Agent 4) -->
          <div class="controls-group">
            <button 
              class="ctrl-btn filter-btn-critical" 
              :class="{ active: filterCriticalOnly }" 
              @click="filterCriticalOnly = !filterCriticalOnly"
              title="僅篩選高危險性或 0-day 緊急資安漏洞情報"
            >
              <i class="fa-solid fa-triangle-exclamation"></i> 
              <span>高危</span>
              <span class="ctrl-count-badge">{{ criticalCount }}</span>
            </button>
            <button 
              class="ctrl-btn filter-btn-cve" 
              :class="{ active: filterCveOnly }" 
              @click="filterCveOnly = !filterCveOnly"
              title="僅篩選包含 CVE 漏洞編號之情資"
            >
              <i class="fa-solid fa-bug"></i> 
              <span>CVE</span>
              <span class="ctrl-count-badge">{{ cveCount }}</span>
            </button>
          </div>

          <div class="controls-divider"></div>

          <!-- Sort Modes -->
          <div class="controls-group">
            <button 
              class="ctrl-btn" 
              :class="{ active: sortBy === 'latest' }" 
              @click="sortBy = 'latest'"
              title="按發布時間排序"
            >
              <i class="fa-solid fa-clock"></i> 最新
            </button>
            <button 
              class="ctrl-btn" 
              :class="{ active: sortBy === 'views' }" 
              @click="sortBy = 'views'"
              title="按熱門瀏覽排序"
            >
              <i class="fa-solid fa-fire"></i> 熱門
            </button>
          </div>

          <div class="controls-divider"></div>

          <!-- Layout Modes -->
          <div class="controls-group">
            <button 
              class="ctrl-btn" 
              :class="{ active: feedMode === 'compact' }" 
              @click="setFeedMode('compact')"
              title="精簡速覽模式：隱藏長文，一眼聚焦核心防護動作"
            >
              <i class="fa-solid fa-bolt"></i> 速覽
            </button>
            <button 
              class="ctrl-btn" 
              :class="{ active: feedMode === 'detailed' }" 
              @click="setFeedMode('detailed')"
              title="詳細模式：展開部分內文段落"
            >
              <i class="fa-solid fa-align-left"></i> 詳細
            </button>
          </div>

          <div class="controls-divider"></div>

          <!-- Export Report Button (Agent 3) -->
          <div class="controls-group report-ctrl-group">
            <button 
              class="ctrl-btn export-report-btn" 
              @click="showReportModal = true"
              title="匯出高危資安威脅情資月報 (支援 Word / Excel CSV / PDF)"
            >
              <i class="fa-solid fa-file-shield"></i> 匯出月報
            </button>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="feed-skeletons">
        <SkeletonCard v-for="i in 4" :key="i" />
      </div>

      <!-- Error State -->
      <div v-else-if="fetchError" class="loader-container error-state">
        <i class="fa-solid fa-circle-exclamation"></i>
        <p>無法載入即時情報，網路連線可能異常。</p>
        <button class="retry-btn" @click="fetchLiveNews">
          <i class="fa-solid fa-arrow-rotate-right"></i> 重新載入
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredPosts.length === 0" class="empty-feed">
        <i class="fa-regular fa-folder-open"></i>
        <p>沒有找到符合條件的資安情報</p>
        <button v-if="searchQuery || activeCategory !== '全部動態'" class="reset-filter-btn" @click="clearSearch(); activeCategory = '全部動態'">
          重設篩選條件
        </button>
      </div>

      <!-- Posts List -->
      <div v-else class="posts-section">
        <div class="posts-grid" :class="{ 'grid-2-col': feedMode === 'compact' }">
          <PostCard 
            v-for="post in displayedPosts" 
            :key="post.id" 
            :post="post" 
            :viewCount="(stats && stats.postViews && stats.postViews[post.id]) || 0"
            :searchQuery="searchQuery"
            :compact="feedMode === 'compact'"
            :bookmarked="bookmarkedIds.includes(post.id)"
            @bookmark-change="handleBookmarkChange"
            @view-tracked="handleViewTracked"
          />
        </div>

        <!-- Load More Bar -->
        <div class="load-more-section">
          <button v-if="hasMore" class="load-more-btn" @click="loadMore">
            <i class="fa-solid fa-chevron-down"></i> 
            載入更多情報 (顯示 {{ displayedPosts.length }} / {{ filteredPosts.length }})
          </button>
          <div v-else class="all-loaded-notice">
            <i class="fa-solid fa-circle-check"></i> 已載入全部 {{ filteredPosts.length }} 則情報
          </div>
        </div>
      </div>
    </section>

    <!-- Right Sidebar -->
    <aside class="sidebar right-sidebar">
      <!-- Activity Widget -->
      <div class="widget stats-widget">
        <h3><i class="fa-solid fa-chart-line" style="color: var(--primary-color);"></i> 站內即時狀態</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">{{ stats.onlineCount }}</span>
            <span class="stat-label">在線人數</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ stats.totalViews }}</span>
            <span class="stat-label">累積造訪</span>
          </div>
        </div>
      </div>

      <!-- Tips Widget -->
      <div class="widget tips-widget">
        <h3><i class="fa-solid fa-lightbulb" style="color: #f1c40f;"></i> 今日資安小提醒</h3>
        <div class="tip-content" v-if="currentTip">
          <strong class="tip-term">
            {{ currentTip.term }}
          </strong>
          <p>{{ currentTip.definition }}</p>
        </div>
        <div class="tip-content" v-else>
          <p>不要在公共 Wi-Fi 下輸入個人機密資訊，如需進行網路銀行交易，建議切換至 5G/4G 行動網路，保障通訊安全！</p>
        </div>
        <div class="tip-footer">
          <router-link to="/dictionary" class="more-link">
            查看更多辭典內容 <i class="fa-solid fa-arrow-right"></i>
          </router-link>
        </div>
      </div>

      <!-- Trending Topics Widget -->
      <div class="widget topics-widget">
        <h3><i class="fa-solid fa-hashtag" style="color: var(--primary-color);"></i> 熱門情資標籤</h3>
        <div class="tag-cloud">
          <span 
            v-for="tag in ['CVE漏洞', '零時差', '釣魚詐騙', 'Exchange', '雙重驗證', '勒索防護', '手機安全', '微軟更新']" 
            :key="tag" 
            class="topic-tag"
            @click="searchQuery = tag"
            :title="'點擊搜尋 #' + tag"
          >
            #{{ tag }}
          </span>
        </div>
      </div>
    </aside>

    <!-- Monthly Report Export Modal -->
    <ReportModal 
      :isOpen="showReportModal" 
      :posts="posts" 
      :bookmarks="bookmarkedIds"
      @close="showReportModal = false" 
    />
  </main>
</template>

<style scoped>
.report-cta-widget {
    background: linear-gradient(145deg, rgba(239, 68, 68, 0.08), rgba(234, 88, 12, 0.06));
    border: 1.5px solid rgba(239, 68, 68, 0.28) !important;
}

.report-cta-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 800;
    color: #dc2626;
    margin-bottom: 0.45rem;
}

.dark-theme .report-cta-header {
    color: #f87171;
}

.report-cta-desc {
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.45;
    margin-bottom: 0.75rem;
}

.sidebar-report-btn {
    width: 100%;
    padding: 0.6rem 0.9rem;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #ef4444, #ea580c);
    color: #ffffff;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    transition: all 0.2s ease;
}

.sidebar-report-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
    filter: brightness(1.05);
}

.announcement-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-left: 3.5px solid var(--primary-color);
    border-radius: var(--radius-md, 12px);
    padding: 0.85rem 1.25rem;
    margin-bottom: 1.25rem;
    gap: 1rem;
    box-shadow: var(--shadow-card);
    animation: slideUp 0.3s ease;
}

.announcement-content {
    display: flex;
    align-items: center;
    gap: 0.85rem;
}

.announcement-icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background-color: var(--primary-light);
    color: var(--primary-color);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 0.95rem;
}

.announcement-text {
    font-size: 0.88rem;
    color: var(--text-primary);
    line-height: 1.5;
}

.announcement-close {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1.1rem;
    padding: 0.25rem;
    border-radius: 4px;
    transition: color 0.2s;
    flex-shrink: 0;
}

.announcement-close:hover {
    color: var(--text-primary);
}

/* Category Chips Bar: Hidden on desktop (left sidebar already handles categories); shown on tablet/mobile (<= 860px) */
.category-chips-bar {
    display: none;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
}

@media (max-width: 860px) {
    .category-chips-bar {
        display: flex;
    }
}

.category-chips-bar::-webkit-scrollbar {
    height: 3px;
}

.category-chips-bar::-webkit-scrollbar-thumb {
    background-color: var(--border-color);
    border-radius: 4px;
}

.category-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.38rem 0.8rem;
    background-color: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: var(--shadow-sm);
    flex-shrink: 0;
}

.category-chip:hover {
    color: var(--text-primary);
    border-color: rgba(37, 99, 235, 0.35);
    transform: translateY(-1px);
}

.category-chip.active {
    background-color: var(--primary-color);
    color: #ffffff;
    border-color: var(--primary-color);
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
}

.chip-badge {
    background: rgba(0, 0, 0, 0.06);
    padding: 0.08rem 0.42rem;
    border-radius: 10px;
    font-size: 0.72rem;
}

.dark-theme .chip-badge {
    background: rgba(255, 255, 255, 0.1);
}

.category-chip.active .chip-badge {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
}

.feed-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--bg-card);
    padding: 0.75rem 1.25rem;
    border-radius: 10px;
    margin-bottom: 1.25rem;
    box-shadow: var(--shadow-sm);
    flex-wrap: wrap;
    gap: 0.75rem;
}

.controls-status {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.92rem;
    flex-wrap: wrap;
}

.current-filter {
    color: var(--primary-color);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
}

.post-total-count {
    color: var(--text-secondary);
    font-size: 0.85rem;
}

.active-query-tag {
    background-color: rgba(24, 119, 242, 0.1);
    color: var(--primary-color);
    padding: 0.2rem 0.6rem;
    border-radius: 20px;
    font-size: 0.8rem;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
}

.query-clear-icon {
    cursor: pointer;
    font-size: 0.75rem;
}

.query-clear-icon:hover {
    color: var(--danger-color, #ef4444);
}

.controls-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.controls-group {
    display: flex;
    gap: 2px;
    background-color: var(--bg-main);
    padding: 3px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
}

.controls-divider {
    width: 1px;
    height: 18px;
    background-color: var(--border-color);
    margin: 0 0.1rem;
}

.ctrl-btn {
    background: transparent;
    border: none;
    padding: 0.32rem 0.65rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-secondary);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
}

.ctrl-btn:hover {
    color: var(--text-primary);
}

.ctrl-btn.active {
    background-color: var(--bg-card);
    color: var(--primary-color);
    box-shadow: var(--shadow-sm);
}

.ctrl-count-badge {
    background-color: rgba(0, 0, 0, 0.08);
    padding: 0.05rem 0.35rem;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 700;
}

.dark-theme .ctrl-count-badge {
    background-color: rgba(255, 255, 255, 0.15);
}

.filter-btn-critical.active {
    background-color: #ef4444 !important;
    color: #ffffff !important;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35) !important;
}

.filter-btn-critical.active .ctrl-count-badge {
    background-color: rgba(0, 0, 0, 0.2);
    color: #ffffff;
}

.filter-btn-cve.active {
    background-color: #ea580c !important;
    color: #ffffff !important;
    box-shadow: 0 2px 8px rgba(234, 88, 12, 0.35) !important;
}

.filter-btn-cve.active .ctrl-count-badge {
    background-color: rgba(0, 0, 0, 0.2);
    color: #ffffff;
}

.alert-filter-tag {
    background-color: rgba(239, 68, 68, 0.12) !important;
    color: #ef4444 !important;
}

.cve-filter-tag {
    background-color: rgba(234, 88, 12, 0.12) !important;
    color: #ea580c !important;
}

.report-ctrl-group {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
}

.export-report-btn {
    background: linear-gradient(135deg, #ef4444, #ea580c) !important;
    color: #ffffff !important;
    font-weight: 700 !important;
    padding: 0.38rem 0.85rem !important;
    border-radius: 8px !important;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3) !important;
}

.export-report-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
    filter: brightness(1.06);
}

.cat-name-icon {
    display: flex;
    align-items: center;
    gap: 0.6rem;
}

.cat-badge {
    background-color: rgba(0, 0, 0, 0.06);
    color: var(--text-secondary);
    padding: 0.1rem 0.45rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
}

.dark-theme .cat-badge {
    background-color: rgba(255, 255, 255, 0.1);
}

.categories-widget li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 0.85rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 0.2rem;
}

.clear-search-btn {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.25rem;
}

.clear-search-btn:hover {
    color: var(--text-primary);
}

.load-more-section {
    display: flex;
    justify-content: center;
    padding: 1rem 0 2rem;
}

.load-more-btn {
    background-color: var(--bg-card);
    border: 1px solid var(--border-color, #e5e7eb);
    color: var(--primary-color);
    padding: 0.75rem 2rem;
    font-size: 0.95rem;
    font-weight: 600;
    border-radius: 30px;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
}

.load-more-btn:hover {
    background-color: var(--primary-color);
    color: #ffffff;
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
}

.all-loaded-notice {
    color: var(--text-secondary);
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
}

.empty-feed {
    background-color: var(--bg-card);
    border-radius: 12px;
    padding: 3rem 1.5rem;
    text-align: center;
    color: var(--text-secondary);
    box-shadow: var(--shadow-sm);
}

.empty-feed i {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.6;
}

.empty-feed p {
    font-size: 1.05rem;
    margin-bottom: 1rem;
}

.reset-filter-btn {
    background-color: var(--primary-color);
    color: white;
    border: none;
    padding: 0.5rem 1.25rem;
    border-radius: 20px;
    font-size: 0.9rem;
    cursor: pointer;
}

.tip-term {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--primary-color);
    font-size: 1.05rem;
}

.error-state {
    color: var(--danger-color, #ef4444);
    text-align: center;
    padding: 3rem;
}

.error-state i {
    font-size: 2.5rem;
    margin-bottom: 1rem;
}

.retry-btn {
    margin-top: 1rem;
    padding: 0.5rem 1.25rem;
    cursor: pointer;
    background-color: var(--primary-color);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.9rem;
}

/* Posts Grid Layout (Balanced 2-Column in Compact Mode) */
.posts-grid {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
}

.posts-grid.grid-2-col {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.25rem;
    align-items: stretch;
}

@media (max-width: 960px) {
    .posts-grid.grid-2-col {
        grid-template-columns: 1fr;
    }
}

/* Hotline Widget */
.hotline-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
}

.hotline-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.55rem 0.75rem;
    background-color: var(--bg-main);
    border-radius: 8px;
    border: 1px solid var(--border-color);
    font-size: 0.84rem;
}

.hotline-title {
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 500;
}

.hotline-val {
    font-weight: 700;
    color: var(--danger-color, #ef4444);
    font-size: 0.88rem;
}

/* Topics Widget */
.tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.25rem;
}

.topic-tag {
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.25rem 0.55rem;
    border-radius: 20px;
    background-color: var(--bg-main);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    cursor: pointer;
    transition: all 0.2s ease;
}

.topic-tag:hover {
    color: var(--primary-color);
    border-color: var(--primary-color);
    background-color: var(--primary-light);
    transform: translateY(-1px);
}
</style>
