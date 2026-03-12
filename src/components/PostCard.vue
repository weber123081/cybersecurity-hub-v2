<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  post: {
    type: Object,
    required: true
  }
});

const isExpanded = ref(false);
const MAX_LENGTH = 150;

const displayContent = computed(() => {
    if (!props.post.content) return '';
    if (isExpanded.value || props.post.content.length <= MAX_LENGTH) {
        return props.post.content;
    }
    return props.post.content.substring(0, MAX_LENGTH) + '...';
});

const needsExpansion = computed(() => {
    return props.post.content && props.post.content.length > MAX_LENGTH;
});
</script>

<template>
  <article class="post">
    <div class="post-header">
      <div class="post-avatar">
        <i :class="['fa-solid', post.authorIcon]"></i>
      </div>
      <div class="post-meta">
        <span class="post-author">{{ post.authorName }}</span>
        <span class="post-time">
          {{ post.timeAgo }} · <i class="fa-solid fa-earth-americas"></i> {{ post.category }}
        </span>
      </div>
    </div>
    
    <div class="post-content">
      <h2 class="post-title">{{ post.title }}</h2>
      <div class="post-text">
        {{ displayContent }}
        <button v-if="needsExpansion" class="read-more-btn" @click="isExpanded = !isExpanded">
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

.post-content {
    padding: 0 1.25rem 1rem;
}

.post-title {
    font-size: 1.2rem;
    margin-bottom: 0.5rem;
    line-height: 1.4;
}

.post-text {
    font-size: 1rem;
    color: var(--text-primary);
    white-space: pre-line;
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
