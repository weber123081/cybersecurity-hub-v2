<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
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

const navSearchInput = ref(null);
const navSearchQuery = ref(route.query.q || '');

watch(() => route.query.q, (newQ) => {
  navSearchQuery.value = newQ || '';
});

const handleNavSearch = () => {
  const q = navSearchQuery.value.trim();
  router.push({ path: '/', query: q ? { q } : {} });
};

const clearNavSearch = () => {
  navSearchQuery.value = '';
  if (route.query.q) {
    router.push({ path: '/', query: {} });
  }
};

// Global '/' keyboard shortcut to focus search
const handleGlobalKeydown = (e) => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    if (navSearchInput.value) {
      navSearchInput.value.focus();
    }
  }
};

const visitorCount = ref(0);
const fetchVisitors = async () => {
  try {
    const simIp = new URLSearchParams(window.location.search).get('simIp') || undefined;
    
    // Register visitor hit
    await fetch('/api/stats/hit', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ simIp })
    });
    
    const res = await fetch('/api/stats/summary', {
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
  window.addEventListener('keydown', handleGlobalKeydown);
  if (isDark.value) {
    document.documentElement.classList.add('dark-theme');
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <nav class="navbar">
    <div class="nav-container">
      <router-link to="/" class="logo" title="回首頁">
        <i class="fa-solid fa-shield-halved"></i>
        <span>生活資安觀測站</span>
      </router-link>

      <!-- Center Global Search Bar -->
      <div class="nav-search-wrapper">
        <div class="nav-search-box">
          <i class="fa-solid fa-magnifying-glass nav-search-icon"></i>
          <input 
            ref="navSearchInput"
            type="text" 
            v-model="navSearchQuery" 
            placeholder="全站資安情報檢索... (按 / 鍵搜尋)" 
            @keyup.enter="handleNavSearch"
            @keyup.esc="clearNavSearch"
          />
          <kbd v-if="!navSearchQuery" class="nav-search-kbd" title="按下鍵盤 / 快速聚焦搜尋">/</kbd>
          <button v-else class="nav-search-clear" @click="clearNavSearch" title="清除">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="nav-links">
        <router-link to="/" active-class="active" exact title="首頁動態">
          <i class="fa-solid fa-house"></i> <span class="nav-label">首頁動態</span>
        </router-link>
        <router-link to="/dictionary" active-class="active" title="防護辭典">
          <i class="fa-solid fa-book-open"></i> <span class="nav-label">防護辭典</span>
        </router-link>
        <router-link to="/lab" active-class="active" title="實戰演練">
          <i class="fa-solid fa-flask"></i> <span class="nav-label">實戰演練</span>
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
        <div class="visitor-badge" v-if="visitorCount > 0" title="自部署以來的累計閱覽總人次">
          <i class="fa-solid fa-eye mr-1"></i> <span>{{ visitorCount }}</span>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.logo {
    text-decoration: none;
    cursor: pointer;
    transition: transform 0.2s ease;
    flex-shrink: 0;
}

.logo:hover {
    transform: scale(1.02);
}

.nav-search-wrapper {
    flex: 1;
    max-width: 420px;
    margin: 0 1rem;
}

.nav-search-box {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
}

.nav-search-icon {
    position: absolute;
    left: 12px;
    font-size: 0.85rem;
    color: var(--text-secondary);
    pointer-events: none;
}

.nav-search-box input {
    width: 100%;
    padding: 0.45rem 2.2rem 0.45rem 2.2rem;
    font-size: 0.88rem;
    background-color: var(--bg-main);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 20px;
    outline: none;
    transition: all 0.2s ease;
}

.nav-search-box input:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(24, 119, 242, 0.15);
    background-color: var(--bg-card);
}

.nav-search-kbd {
    position: absolute;
    right: 12px;
    font-family: monospace;
    font-size: 0.75rem;
    background: rgba(0, 0, 0, 0.08);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 1px 6px;
    pointer-events: none;
}

.dark-theme .nav-search-kbd {
    background: rgba(255, 255, 255, 0.12);
}

.nav-search-clear {
    position: absolute;
    right: 10px;
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.85rem;
    padding: 2px 4px;
}

.nav-search-clear:hover {
    color: var(--text-primary);
}

@media (max-width: 900px) {
    .nav-search-wrapper {
        display: none;
    }
}

@media (max-width: 640px) {
    .nav-label {
        display: none;
    }
    .nav-links a {
        padding: 0.5rem 0.65rem;
        font-size: 1.05rem;
    }
    .logo span {
        font-size: 1.1rem;
    }
}

@media (max-width: 420px) {
    .logo span {
        font-size: 0.98rem;
    }
    .nav-container {
        padding: 0 0.75rem;
        gap: 0.5rem;
    }
    .visitor-badge {
        display: none;
    }
}
</style>
