<script setup>
import { ref, computed, onMounted } from 'vue';

const dictionaryData = ref([]);
const searchQuery = ref('');
const activeCategory = ref('全部術語');
const copiedId = ref(null);

const categories = [
  { name: '全部術語', icon: 'fa-book' },
  { name: '常見攻擊手法', icon: 'fa-skull-crossbones' },
  { name: '惡意程式類型', icon: 'fa-virus' },
  { name: '防禦與認證', icon: 'fa-shield-halved' },
  { name: '詐騙與社交工程', icon: 'fa-user-secret' }
];

function getTermCategory(item) {
  const text = (item.term + ' ' + item.definition).toLowerCase();
  if (text.includes('勒索') || text.includes('惡意程式') || text.includes('木馬') || text.includes('蠕蟲') || text.includes('間諜') || text.includes('側錄') || text.includes('挖礦') || text.includes('rootkit') || text.includes('病毒')) {
    return '惡意程式類型';
  }
  if (text.includes('釣魚') || text.includes('社交工程') || text.includes('詐騙') || text.includes('假冒') || text.includes('偽造') || text.includes('誘騙') || text.includes('魚叉')) {
    return '詐騙與社交工程';
  }
  if (text.includes('認證') || text.includes('2fa') || text.includes('mfa') || text.includes('密碼') || text.includes('備份') || text.includes('防護') || text.includes('加密') || text.includes('vpn') || text.includes('防火牆') || text.includes('零信任') || text.includes('端點')) {
    return '防禦與認證';
  }
  return '常見攻擊手法';
}

onMounted(async () => {
    try {
        const response = await fetch('/data/dictionary.json');
        if (response.ok) {
            dictionaryData.value = await response.json();
        }
    } catch (e) {
        console.error("Failed to load dictionary:", e);
    }
});

const categoryCounts = computed(() => {
  const counts = { '全部術語': dictionaryData.value.length };
  for (const item of dictionaryData.value) {
    const cat = getTermCategory(item);
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
});

const filteredTerms = computed(() => {
    let result = dictionaryData.value;
    
    if (activeCategory.value !== '全部術語') {
        result = result.filter(item => getTermCategory(item) === activeCategory.value);
    }

    if (searchQuery.value.trim()) {
        const lowerQuery = searchQuery.value.toLowerCase().trim();
        result = result.filter(item => 
            item.term.toLowerCase().includes(lowerQuery) || 
            item.definition.toLowerCase().includes(lowerQuery) ||
            (item.tips && item.tips.some(tip => tip.toLowerCase().includes(lowerQuery)))
        );
    }
    return result;
});

function getSearchKeyword(term) {
    if (!term) return '';
    const clean = term.replace(/\(.*?\)/g, '').trim();
    return clean || term;
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function highlightText(text) {
    if (!text) return '';
    if (!searchQuery.value.trim()) return escapeHtml(text);
    const q = searchQuery.value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escapeHtml(text).replace(new RegExp(`(${q})`, 'gi'), '<mark class="highlight-query">$1</mark>');
}

const copyTerm = async (item) => {
    try {
        const tipsText = item.tips && item.tips.length > 0 ? item.tips.map((t, idx) => `  ${idx + 1}. ${t}`).join('\n') : '';
        const text = `【資安防護術語】${item.term}\n\n說明：${item.definition}\n\n防護小建議：\n${tipsText}\n\n（來源：生活資安觀測站 防護辭典）`;
        await navigator.clipboard.writeText(text);
        copiedId.value = item.id;
        setTimeout(() => {
            if (copiedId.value === item.id) copiedId.value = null;
        }, 2200);
    } catch (e) {
        console.error("Copy failed", e);
    }
};
</script>

<template>
  <main class="main-container dictionary-layout">
    <!-- Header Hero Bar -->
    <div class="dictionary-header">
      <div class="header-left">
        <div class="header-icon-wrap">
          <i class="fa-solid fa-book-bookmark"></i>
        </div>
        <div class="header-text">
          <h2>📗 資安防護辭典</h2>
          <p>掌握專業術語與防護秘訣，將深奧的資安威脅化為實用自保能力。</p>
        </div>
      </div>
      <div class="search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" v-model="searchQuery" placeholder="搜尋術語或定義... (如: 釣魚、2FA、勒索)" />
        <i v-if="searchQuery" class="fa-solid fa-xmark clear-input-icon" @click="searchQuery = ''"></i>
      </div>
    </div>

    <!-- Category Tabs Filter Strip -->
    <div class="category-tabs-strip">
      <button 
        v-for="cat in categories" 
        :key="cat.name"
        class="cat-tab-btn"
        :class="{ active: activeCategory === cat.name }"
        @click="activeCategory = cat.name"
      >
        <i :class="['fa-solid', cat.icon]"></i>
        <span>{{ cat.name }}</span>
        <span class="tab-count-badge">{{ categoryCounts[cat.name] || 0 }}</span>
      </button>
    </div>

    <!-- Dictionary Result Grid -->
    <div class="dictionary-grid">
      <div class="term-card" v-for="item in filteredTerms" :key="item.id">
        <div class="term-card-header">
          <div class="term-title-wrap">
            <span class="term-category-tag">
              <i class="fa-solid fa-tag"></i> {{ getTermCategory(item) }}
            </span>
            <h3 class="term-title" v-html="highlightText(item.term)"></h3>
          </div>
          <div class="term-actions">
            <button 
              class="term-action-btn copy-btn" 
              @click="copyTerm(item)" 
              :class="{ success: copiedId === item.id }"
              :title="copiedId === item.id ? '已複製！' : '複製術語重點'"
            >
              <i :class="['fa-solid', copiedId === item.id ? 'fa-check' : 'fa-copy']"></i>
            </button>
            <router-link 
              :to="{ path: '/', query: { q: getSearchKeyword(item.term) } }" 
              class="term-action-btn search-link" 
              title="前往情報站搜尋此術語之相關新聞"
            >
              <i class="fa-solid fa-newspaper"></i>
            </router-link>
          </div>
        </div>

        <p class="term-def" v-html="highlightText(item.definition)"></p>

        <div class="term-tips" v-if="item.tips && item.tips.length > 0">
          <h4><i class="fa-solid fa-shield-halved"></i> 實用防護指引：</h4>
          <ul>
            <li v-for="(tip, index) in item.tips" :key="index" v-html="highlightText(tip)"></li>
          </ul>
        </div>
      </div>
      
      <!-- Empty State -->
      <div v-if="filteredTerms.length === 0" class="no-results">
        <i class="fa-regular fa-folder-open"></i>
        <h3>找不到符合的術語</h3>
        <p>查無「{{ searchQuery }}」相關詞彙，建議更換關鍵字或重設篩選條件。</p>
        <button class="reset-btn" @click="searchQuery = ''; activeCategory = '全部術語'">
          重設篩選
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.dictionary-layout {
    display: flex;
    flex-direction: column;
    max-width: 1320px;
    margin: 80px auto 2rem;
    padding: 0 1.5rem;
    gap: 1.5rem;
}

.dictionary-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--bg-card);
    padding: 1.6rem 2rem;
    border-radius: var(--radius-lg, 16px);
    box-shadow: var(--shadow-card);
    border: 1px solid var(--border-color);
    flex-wrap: wrap;
    gap: 1.5rem;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 1.15rem;
}

.header-icon-wrap {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.4rem;
    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.28);
    flex-shrink: 0;
}

.header-text h2 {
    font-size: 1.6rem;
    font-weight: 800;
    margin-bottom: 0.25rem;
    color: var(--text-primary);
    letter-spacing: -0.02em;
}

.header-text p {
    color: var(--text-secondary);
    font-size: 0.92rem;
}

.search-box {
    position: relative;
    flex: 1;
    min-width: 280px;
    max-width: 380px;
}

.search-box i.fa-magnifying-glass {
    position: absolute;
    left: 1.1rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    font-size: 0.9rem;
}

.clear-input-icon {
    position: absolute;
    right: 1.1rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.2rem;
}

.clear-input-icon:hover {
    color: var(--danger-color, #ef4444);
}

.search-box input {
    width: 100%;
    padding: 0.68rem 2.4rem 0.68rem 2.6rem;
    border: 1px solid var(--border-color);
    border-radius: 30px;
    font-size: 0.92rem;
    outline: none;
    transition: all 0.2s ease;
    background-color: var(--bg-main);
    color: var(--text-primary);
}

.search-box input:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px var(--primary-light);
    background-color: var(--bg-card);
}

/* Category Tabs Strip */
.category-tabs-strip {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
    background-color: var(--bg-card);
    padding: 0.65rem 0.85rem;
    border-radius: 12px;
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-sm);
}

.cat-tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
}

.cat-tab-btn:hover {
    color: var(--text-primary);
    background-color: var(--bg-main);
}

.cat-tab-btn.active {
    background-color: var(--primary-color);
    color: white;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
}

.tab-count-badge {
    background-color: rgba(0, 0, 0, 0.08);
    padding: 0.08rem 0.45rem;
    border-radius: 10px;
    font-size: 0.72rem;
}

.cat-tab-btn.active .tab-count-badge {
    background-color: rgba(255, 255, 255, 0.22);
    color: white;
}

.dark-theme .tab-count-badge {
    background-color: rgba(255, 255, 255, 0.12);
}

/* Dictionary Grid & Equal Height Cards */
.dictionary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 1.5rem;
    align-items: stretch;
}

.term-card {
    background-color: var(--bg-card);
    padding: 1.5rem;
    border-radius: var(--radius-md, 12px);
    box-shadow: var(--shadow-card);
    border: 1px solid var(--border-color);
    border-top: 3.5px solid var(--primary-color);
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.term-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
    border-color: rgba(37, 99, 235, 0.3);
}

.term-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.9rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--border-color);
    gap: 0.75rem;
}

.term-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

.term-category-tag {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
}

.term-title {
    font-size: 1.22rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.4;
    letter-spacing: -0.015em;
    margin: 0;
}

.term-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-shrink: 0;
}

.term-action-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.88rem;
    border: 1px solid var(--border-color);
    background-color: var(--bg-main);
    color: var(--text-secondary);
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s ease;
}

.term-action-btn:hover {
    color: var(--primary-color);
    border-color: var(--primary-color);
    background-color: var(--bg-card);
}

.term-action-btn.success {
    color: #10b981;
    border-color: #10b981;
}

.term-def {
    color: var(--text-secondary);
    line-height: 1.65;
    font-size: 0.95rem;
    margin-bottom: 1.25rem;
    flex: 1;
}

.term-tips {
    background-color: rgba(16, 185, 129, 0.08);
    padding: 0.85rem 1rem;
    border-radius: 8px;
    border: 1px solid rgba(16, 185, 129, 0.22);
    margin-top: auto;
}

.term-tips h4 {
    color: #059669;
    font-size: 0.86rem;
    font-weight: 700;
    margin-bottom: 0.45rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
}

.dark-theme .term-tips h4 {
    color: #34d399;
}

.term-tips ul {
    list-style-type: disc;
    padding-left: 1.2rem;
    color: var(--text-primary);
    font-size: 0.86rem;
    line-height: 1.6;
}

.highlight-query {
    background-color: #fef08a;
    color: #854d0e;
    padding: 0 0.2rem;
    border-radius: 2px;
    font-weight: 700;
}

.dark-theme .highlight-query {
    background-color: #854d0e;
    color: #fef08a;
}

.no-results {
    grid-column: 1 / -1;
    text-align: center;
    padding: 4rem 1.5rem;
    color: var(--text-secondary);
    background-color: var(--bg-card);
    border-radius: 12px;
    border: 1px solid var(--border-color);
}

.no-results i {
    font-size: 2.8rem;
    margin-bottom: 1rem;
    color: var(--text-muted);
}

.no-results h3 {
    font-size: 1.25rem;
    color: var(--text-primary);
    margin-bottom: 0.4rem;
}

.no-results p {
    font-size: 0.92rem;
    margin-bottom: 1.25rem;
}

.reset-btn {
    background-color: var(--primary-color);
    color: white;
    border: none;
    padding: 0.55rem 1.4rem;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.88rem;
    cursor: pointer;
    transition: all 0.2s;
}

.reset-btn:hover {
    background-color: var(--primary-hover);
}

@keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
    .dictionary-layout {
        margin-top: 72px;
        padding: 0 1rem;
    }

    .dictionary-header {
        flex-direction: column;
        align-items: stretch;
        padding: 1.25rem;
    }

    .search-box {
        max-width: 100%;
    }

    .dictionary-grid {
        grid-template-columns: 1fr;
    }
}
</style>
