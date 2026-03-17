<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import Navbar from './components/Navbar.vue';

const showBackToTop = ref(false);
const scrollProgress = ref(0);

const handleScroll = () => {
  const scrollTop = window.pageYOffset;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  scrollProgress.value = (scrollTop / docHeight) * 100;
  showBackToTop.value = scrollTop > 400;
};

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

onMounted(() => {
  window.addEventListener('scroll', handleScroll);
  // Ensure theme is applied on mount
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.classList.add('dark-theme');
  }
});

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll);
});
</script>

<template>
  <div class="progress-container">
    <div class="progress-bar" :style="{ width: scrollProgress + '%' }"></div>
  </div>
  
  <Navbar />
  <main class="content-wrapper">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </main>

  <button 
    class="back-to-top" 
    :class="{ visible: showBackToTop }"
    @click="scrollToTop"
    title="回頂端"
  >
    <i class="fa-solid fa-arrow-up"></i>
  </button>
  
  <footer class="site-footer">
    <span>© 2026 資訊中心 · 守護資訊安全，從你我做起 · 為您提供最即時的全球資安情資</span>
  </footer>
</template>
