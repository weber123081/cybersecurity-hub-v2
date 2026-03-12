<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import PostCard from '../components/PostCard.vue'

const route = useRoute();
const posts = ref([]);
const loading = ref(true);
const fetchError = ref(false);
const activeCategory = ref(route.query.cat || '全部動態');

const categories = [
  { name: '全部動態', icon: 'fa-border-all' },
  { name: '詐騙防範', icon: 'fa-mask' },
  { name: '密碼與帳號', icon: 'fa-key' },
  { name: '網路與隱私', icon: 'fa-wifi' },
  { name: '手機安全', icon: 'fa-mobile-screen' },
  { name: '最新情報', icon: 'fa-fire' } // Added this so it matches the header
];

const filteredPosts = computed(() => {
  if (activeCategory.value === '全部動態') {
    return posts.value;
  }
  return posts.value.filter(post => post.category === activeCategory.value);
});

async function fetchLiveNews() {
    loading.value = true;
    fetchError.value = false;
    const DATA_URL = '/data/news.json';

    try {
        const response = await fetch(`${DATA_URL}?t=${new Date().getTime()}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        posts.value = data;
    } catch (error) {
        console.error("Failed to load local intranet news data:", error);
        fetchError.value = true;
    } finally {
        loading.value = false;
    }
}

watch(() => route.query.cat, (newCat) => {
    if (newCat) {
        activeCategory.value = newCat;
    }
});

onMounted(() => {
    fetchLiveNews();
});
</script>

<template>
  <main class="main-container">
    <aside class="sidebar left-sidebar">
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
      <div v-if="loading" id="loader" class="loader-container">
        <div class="spinner"></div>
        <p>正在努力為您抓取並轉譯最新的資安情報...</p>
      </div>

      <div v-else-if="fetchError" class="loader-container" style="color: var(--danger-color);">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>無法載入即時情報，網路連線可能異常。</p>
        <button @click="fetchLiveNews" style="margin-top: 1rem; padding: 0.5rem 1rem; cursor:pointer;">重新載入</button>
      </div>

      <PostCard v-else v-for="post in filteredPosts" :key="post.id" :post="post" />
    </section>

    <aside class="sidebar right-sidebar">
      <div class="widget alert-widget">
        <h3><i class="fa-solid fa-triangle-exclamation" style="color: #ff4757;"></i> 動態資料來源 (內網)</h3>
        <div class="alert-item" style="border-left-color: var(--accent-color); background-color: #f0fdf4;">
          <span class="badge" style="background-color: var(--accent-color); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">封閉安全模式</span>
          <p>為了確保高規格資安，本網站在使用者端**完全斷網運行**。資料由後台排程獨立同步，前端無任何對外連線。</p>
        </div>
      </div>
    </aside>
  </main>
</template>
