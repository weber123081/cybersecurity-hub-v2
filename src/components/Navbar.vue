<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const isDark = ref(localStorage.getItem('theme') === 'dark');

const toggleTheme = () => {
  isDark.value = !isDark.value;
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
  if (isDark.value) {
    document.documentElement.classList.add('dark-theme');
  } else {
    document.documentElement.classList.remove('dark-theme');
  }
};

const route = useRoute();
const router = useRouter();

// goHome function removed to maintain clean URL

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
  if (isDark.value) {
    document.documentElement.classList.add('dark-theme');
  }
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
        <router-link to="/" active-class="active" exact>
          <i class="fa-solid fa-house"></i> 首頁動態
        </router-link>
        <router-link to="/dictionary" active-class="active">
          <i class="fa-solid fa-book-open"></i> 防護辭典
        </router-link>
        <router-link to="/lab" active-class="active">
          <i class="fa-solid fa-flask"></i> 實戰演練
        </router-link>
      </div>
      <div class="user-profile">
        <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切換至淺色模式' : '切換至深色模式'">
          <svg v-if="isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="sun-icon">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <i v-else class="fa-solid fa-moon"></i>
        </button>
        <div class="visitor-badge" v-if="visitorCount > 0">
          <i class="fa-solid fa-eye mr-1"></i> 瀏覽人數: <span>{{ visitorCount }}</span> 人
        </div>
      </div>
    </div>
  </nav>
</template>
