<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import PostCard from '../components/PostCard.vue'

const route = useRoute();
const posts = ref([]);
const loading = ref(true);
const fetchError = ref(false);
const activeCategory = ref(route.query.cat || '全部動態');
const searchQuery = ref('');

const categories = [
  { name: '全部動態', icon: 'fa-border-all' },
  { name: '已收藏文章', icon: 'fa-bookmark' },
  { name: '詐騙防範', icon: 'fa-mask' },
  { name: '密碼與帳號', icon: 'fa-key' },
  { name: '網路與隱私', icon: 'fa-wifi' },
  { name: '手機安全', icon: 'fa-mobile-screen' }
];

const stats = ref({ totalViews: 0, onlineCount: 0, postViews: {} });

const filteredPosts = computed(() => {
  let result = posts.value;
  
  if (activeCategory.value === '已收藏文章') {
    const bookmarks = JSON.parse(localStorage.getItem('cyberhub_bookmarks') || '[]');
    result = result.filter(post => bookmarks.includes(post.id));
  } else if (activeCategory.value !== '全部動態') {
    result = result.filter(post => post.category === activeCategory.value);
  }
  
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    result = result.filter(post => 
      post.title.toLowerCase().includes(q) || 
      (post.content && post.content.toLowerCase().includes(q))
    );
  }
  
  return result;
});

async function fetchLiveNews() {
    console.log("[DEBUG] Starting fetchLiveNews");
    loading.value = true;
    fetchError.value = false;
    
    try {
        console.log("[DEBUG] Fetching /data/news.json...");
        const response = await fetch('/data/news.json?t=' + Date.now());
        console.log("[DEBUG] Response received:", response.status);
        
        if (!response.ok) throw new Error("Fetch failed: " + response.status);
        
        const data = await response.json();
        console.log("[DEBUG] JSON parsed, items:", data.length);
        posts.value = data;
    } catch (error) {
        console.error("[DEBUG] Error in fetchLiveNews:", error);
        fetchError.value = true;
    } finally {
        loading.value = false;
        console.log("[DEBUG] fetchLiveNews COMPLETED, loading state:", loading.value);
    }
}

async function fetchStats() {
    console.log("[DEBUG] fetchStats started");
    try {
        const response = await fetch('/api/stats/summary');
        if (response.ok) {
            const data = await response.json();
            console.log("[DEBUG] fetchStats data:", data);
            stats.value = data;
        }
    } catch (error) {
        console.error("Failed to load stats:", error);
    }
}

watch(() => route.query.cat, (newCat) => {
    if (newCat) {
        activeCategory.value = newCat;
    }
});

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

onMounted(() => {
    console.log("[DEBUG] HomeFeed onMounted");
    fetchLiveNews();
    fetchStats();
    fetchDictionary();
    
    // Safety fallback: ensure loading spinner disappears after 3 seconds
    setTimeout(() => {
        if (loading.value) {
            console.warn("[DEBUG] Loading timeout reached, forcing display");
            loading.value = false;
        }
    }, 3000);

    // Poll stats every 10 seconds
    const interval = setInterval(fetchStats, 10000);

    // Rotate tip every 30 seconds
    const tipInterval = setInterval(rotateTip, 30000);

    // Report visit to backend
    const simIp = route.query.simIp;
    fetch('/api/stats/hit', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simIp })
    }).catch(err => console.error("Stats hit error:", err));
});
</script>

<template>
  <main class="main-container">
    <aside class="sidebar left-sidebar">
      <div class="widget search-widget">
        <div class="search-box">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" v-model="searchQuery" placeholder="搜尋關鍵字..." @keyup.esc="searchQuery = ''">
        </div>
      </div>
      <div class="widget categories-widget">
        <h3>分類主題</h3>
        <ul>
          <li v-for="cat in categories" :key="cat.name" 
              :class="{ active: activeCategory === cat.name }"
              @click="activeCategory = cat.name">
            <i :class="['fa-solid', cat.icon]"></i> {{ cat.name }}
          </li>
        </ul>
      </div>
    </aside>

    <section class="feed">
      <div v-if="loading" class="feed">
        <SkeletonCard v-for="i in 5" :key="i" />
      </div>

      <div v-else-if="fetchError" class="loader-container" style="color: var(--danger-color);">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>無法載入即時情報，網路連線可能異常。</p>
        <button @click="fetchLiveNews" style="margin-top: 1rem; padding: 0.5rem 1rem; cursor:pointer;">重新載入</button>
      </div>

      <PostCard v-else v-for="post in filteredPosts" :key="post.id" :post="post" 
                :viewCount="(stats && stats.postViews && stats.postViews[post.id]) || 0" />
    </section>

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
          <strong style="display: block; margin-bottom: 0.5rem; color: var(--primary-color);">
            {{ currentTip.term }}
          </strong>
          <p>{{ currentTip.definition }}</p>
        </div>
        <div class="tip-content" v-else>
          <p>不要在公共 Wi-Fi 下輸入個人機密資訊，如需進行網路銀行交易，建議切換至 5G/4G 行動網路，保障通訊安全！</p>
        </div>
        <div class="tip-footer">
          <router-link to="/dictionary" class="more-link">查看更多辭典內容...</router-link>
        </div>
      </div>
    </aside>
  </main>
</template>
