<script setup>
import { ref, computed, onMounted } from 'vue';

const dictionaryData = ref([]);
const searchQuery = ref('');

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

const filteredTerms = computed(() => {
    if (!searchQuery.value) return dictionaryData.value;
    const lowerQuery = searchQuery.value.toLowerCase();
    return dictionaryData.value.filter(item => 
        item.term.toLowerCase().includes(lowerQuery) || 
        item.definition.toLowerCase().includes(lowerQuery)
    );
});
</script>

<template>
  <main class="main-container dictionary-layout">
    <div class="dictionary-header">
      <div class="header-text">
        <h2>📗 資安防護辭典</h2>
        <p>快速查詢常見的資安專業術語，守護個人與企業安全。</p>
      </div>
      <div class="search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" v-model="searchQuery" placeholder="搜尋術語... (例如: 漏洞、詐騙)" />
      </div>
    </div>

    <div class="dictionary-grid">
      <div class="term-card" v-for="item in filteredTerms" :key="item.id">
        <h3 class="term-title">{{ item.term }}</h3>
        <p class="term-def">{{ item.definition }}</p>
        <div class="term-tips">
          <h4>💡 防護小建議：</h4>
          <ul>
            <li v-for="(tip, index) in item.tips" :key="index">{{ tip }}</li>
          </ul>
        </div>
      </div>
      
      <div v-if="filteredTerms.length === 0" class="no-results">
        <i class="fa-regular fa-face-frown-open"></i>
        <p>找不到符合的術語，請嘗試其他關鍵字。</p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.dictionary-layout {
    display: flex;
    flex-direction: column;
    max-width: 1000px;
    margin: 0 auto;
    padding: 2rem 1rem;
    gap: 2rem;
}

.dictionary-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--bg-card);
    padding: 2rem;
    border-radius: 12px;
    box-shadow: var(--shadow-sm);
    flex-wrap: wrap;
    gap: 1.5rem;
}

.header-text h2 {
    font-size: 1.8rem;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
}

.header-text p {
    color: var(--text-secondary);
}

.search-box {
    position: relative;
    flex: 1;
    min-width: 280px;
    max-width: 400px;
}

.search-box i {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
}

.search-box input {
    width: 100%;
    padding: 0.8rem 1rem 0.8rem 2.5rem;
    border: 1px solid #e2e8f0;
    border-radius: 30px;
    font-size: 1rem;
    outline: none;
    transition: all 0.3s ease;
    background-color: #f8fafc;
}

.search-box input:focus {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
    background-color: white;
}

.dictionary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
}

.term-card {
    background-color: var(--bg-card);
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: var(--shadow-sm);
    transition: transform 0.2s, box-shadow 0.2s;
    animation: slideUp 0.4s ease forwards;
    border-top: 4px solid var(--primary-color);
    display: flex;
    flex-direction: column;
}

.term-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
}

.term-title {
    font-size: 1.25rem;
    color: var(--primary-color);
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #f1f5f9;
}

.term-def {
    color: var(--text-primary);
    line-height: 1.6;
    margin-bottom: 1.5rem;
    flex-grow: 1;
}

.term-tips {
    background-color: #f0fdf4;
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid #bbf7d0;
}

.term-tips h4 {
    color: #166534;
    font-size: 0.95rem;
    margin-bottom: 0.5rem;
}

.term-tips ul {
    list-style-type: disc;
    padding-left: 1.5rem;
    color: #15803d;
    font-size: 0.9rem;
    line-height: 1.5;
}

.no-results {
    grid-column: 1 / -1;
    text-align: center;
    padding: 4rem;
    color: var(--text-secondary);
    background-color: var(--bg-card);
    border-radius: 12px;
}

.no-results i {
    font-size: 3rem;
    margin-bottom: 1rem;
}

@keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 768px) {
    .dictionary-header {
        flex-direction: column;
        align-items: flex-start;
    }
    .search-box {
        width: 100%;
        max-width: 100%;
    }
}
</style>
