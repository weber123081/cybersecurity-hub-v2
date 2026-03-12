<script setup>
import { computed } from 'vue';
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
</script>

<template>
  <nav class="navbar">
    <div class="nav-container">
      <div class="logo">
        <i class="fa-solid fa-shield-halved"></i>
        <span>生活資安觀測站</span>
      </div>
      <div class="nav-links">
        <a href="#" :class="{ active: route.path === '/' && route.query.cat !== '最新情報' }" @click.prevent="goHome('全部動態')">
          <i class="fa-solid fa-house"></i> 首頁動態
        </a>
        <a href="#" :class="{ active: route.path === '/' && route.query.cat === '最新情報' }" @click.prevent="goHome('最新情報')">
          <i class="fa-solid fa-fire"></i> 最新威脅
        </a>
        <router-link to="/dictionary" active-class="active">
          <i class="fa-solid fa-book-open"></i> 防護辭典
        </router-link>
      </div>
      <div class="user-profile">
        <div class="avatar-placeholder"><i class="fa-solid fa-user"></i></div>
      </div>
    </div>
  </nav>
</template>
