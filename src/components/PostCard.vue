<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  post: {
    type: Object,
    required: true
  },
  viewCount: {
    type: Number,
    default: 0
  }
});

const isExpanded = ref(false);
const MAX_LENGTH = 150;

const bookmarkedIds = ref(JSON.parse(localStorage.getItem('cyberhub_bookmarks') || '[]'));
const isBookmarked = computed(() => bookmarkedIds.value.includes(props.post.id));

const toggleBookmark = (e) => {
    e.stopPropagation();
    let bookmarks = JSON.parse(localStorage.getItem('cyberhub_bookmarks') || '[]');
    if (isBookmarked.value) {
        bookmarks = bookmarks.filter(id => id !== props.post.id);
    } else {
        bookmarks.push(props.post.id);
    }
    localStorage.setItem('cyberhub_bookmarks', JSON.stringify(bookmarks));
    bookmarkedIds.value = bookmarks;
};

const articleRef = ref(null);

async function trackView() {
    if (!isExpanded.value) {
        isExpanded.value = true;
        // Report view to backend
        try {
            await fetch(`/api/stats/post-view/${props.post.id}`, { method: 'POST' });
        } catch (e) {
            console.error("Failed to track post view", e);
        }
    } else {
        isExpanded.value = false;
        // Scroll back to the top of this article
        if (articleRef.value) {
            const yOffset = -80; // Navbar height + margin
            const y = articleRef.value.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }
}

const displayContent = computed(() => {
    if (!props.post.content) return '';
    
    // Defensive fix: Strip trailing dates (e.g. 2026-03-13) that might be accidentally scraped
    let cleanText = props.post.content.replace(/(\n\n\d{4}-\d{2}-\d{2})+$/, '').trim();

    if (isExpanded.value || cleanText.length <= MAX_LENGTH) {
        return cleanText;
    }
    return cleanText.substring(0, MAX_LENGTH) + '...';
});

const needsExpansion = computed(() => {
    return props.post.content && props.post.content.length > MAX_LENGTH;
});
</script>

<template>
  <article class="post" ref="articleRef">
    <div class="post-header">
      <div class="post-avatar">
        <i :class="['fa-solid', post.authorIcon]"></i>
      </div>
      <div class="post-meta">
        <span class="post-author">{{ post.authorName }}</span>
        <span class="post-time">
          {{ post.timeAgo }} · <i class="fa-solid fa-earth-americas"></i> {{ post.category }}
          · <i class="fa-solid fa-eye"></i> {{ viewCount }} 次瀏覽
        </span>
      </div>
      <button class="bookmark-btn" @click="toggleBookmark" :class="{ active: isBookmarked }">
        <i :class="[isBookmarked ? 'fa-solid' : 'fa-regular', 'fa-bookmark']"></i>
      </button>
    </div>
    
    <div class="post-content">
      <h2 class="post-title">{{ post.title }}</h2>
      <div class="post-text">
        {{ displayContent }}
        <button v-if="needsExpansion" class="read-more-btn" @click="trackView">
           {{ isExpanded ? '收起內容' : '閱讀全文' }}
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.post {
    background-color: var(--bg-card);
    border-radius: 12px;
    box-shadow: var(--shadow-sm);
    overflow: hidden;
    animation: slideUp 0.4s ease forwards;
}

@keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.post-header {
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.post-avatar {
    width: 44px;
    height: 44px;
    background-color: var(--primary-color);
    color: white;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.2rem;
    font-weight: bold;
}

.post-meta {
    display: flex;
    flex-direction: column;
}

.post-author {
    font-weight: 700;
    font-size: 1rem;
}

.post-time {
    color: var(--text-secondary);
    font-size: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.bookmark-btn {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.25rem;
    color: var(--text-secondary);
    transition: all 0.2s;
    padding: 0.5rem;
    border-radius: 50%;
}

.bookmark-btn:hover {
    background-color: var(--bg-main);
    color: var(--primary-color);
}

.bookmark-btn.active {
    color: var(--primary-color);
}

.post-content {
    padding: 0 1.25rem 1rem;
}

.post-title {
    font-size: 1.35rem; /* Larger title */
    margin-bottom: 0.75rem;
    line-height: 1.3;
}

.post-text {
    font-size: 1.05rem; /* Larger text */
    color: var(--text-primary);
    white-space: pre-line;
    line-height: 1.8; /* Higher line height for reading comfort */
    letter-spacing: 0.02em;
}

.read-more-btn {
    background: none;
    border: none;
    color: var(--primary-color);
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    margin-left: 8px;
    font-size: 0.95rem;
}

.read-more-btn:hover {
    text-decoration: underline;
}

.post-tip {
    margin-top: 1rem;
    padding: 1rem;
    background-color: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    display: flex;
    gap: 0.75rem;
    font-weight: 500;
    color: #166534;
}

.post-tip i {
    color: #22c55e;
    font-size: 1.2rem;
    margin-top: 2px;
}

.post-link {
    display: block;
    margin-top: 1rem;
    padding: 0.75rem;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    text-decoration: none;
    color: var(--text-primary);
    transition: background 0.2s;
}

.post-link:hover {
    background-color: #f1f5f9;
}

.post-link-title {
    font-weight: 600;
    font-size: 0.95rem;
    margin-bottom: 0.25rem;
}

.post-link-domain {
    font-size: 0.8rem;
    color: var(--text-secondary);
    text-transform: uppercase;
}

.post-actions {
    display: flex;
    border-top: 1px solid #ebedf0;
    padding: 0.5rem 1.25rem;
    gap: 0.5rem;
}

.action-btn {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.95rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
}

.action-btn:hover {
    background-color: #f0f2f5;
}
</style>
