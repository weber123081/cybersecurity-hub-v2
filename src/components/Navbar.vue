<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const goHome = (category = '全部動態') => {
  if (route.path !== '/') {
    router.push({ path: '/', query: { cat: category } });
  } else {
    // If already on home, we could emit an event. 
    // To keep it simple, we use query params to pass state to HomeFeed
    router.replace({ path: '/', query: { cat: category } });
  }
};

const visitorCount = ref(0);
const fetchVisitors = async () => {
  try {
    // Deduplication: Only send hit if not already done in this tab session
    const hasHit = sessionStorage.getItem('cyberhub_visitor_hit');
    
    if (!hasHit) {
      await fetch('http://localhost:3000/api/stats/hit', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      sessionStorage.setItem('cyberhub_visitor_hit', 'true');
    }
    
    // Always fetch the latest count
    const res = await fetch('http://localhost:3000/api/stats/summary', {
      credentials: 'include'
    });
    const data = await res.json();
    visitorCount.value = data.totalViews;
  } catch (e) {
    console.error('Failed to fetch visitor count:', e);
  }
};

onMounted(() => {
  fetchVisitors();
});
</script>

<template>
  <nav class="navbar">
    <div class="nav-container">
      <div class="logo">
        <i class="fa-solid fa-shield-halved"></i>
        <span>生活資安觀測站</span>
      </div>
      <div class="nav-links">
        <a href="#" :class="{ active: route.path === '/' }" @click.prevent="goHome('全部動態')">
          <i class="fa-solid fa-house"></i> 首頁動態
        </a>
        <router-link to="/dictionary" active-class="active">
          <i class="fa-solid fa-book-open"></i> 防護辭典
        </router-link>
      </div>
      <div class="user-profile">
        <div class="visitor-badge" v-if="visitorCount > 0">
          <i class="fa-solid fa-eye mr-1"></i> 瀏覽人數: <span>{{ visitorCount }}</span> 人
        </div>
        <div class="avatar-placeholder ml-4"><i class="fa-solid fa-user"></i></div>
      </div>
    </div>
  </nav>
</template>
