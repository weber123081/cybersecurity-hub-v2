<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  posts: {
    type: Array,
    default: () => []
  },
  bookmarks: {
    type: Array,
    default: null
  }
});

const emit = defineEmits(['close']);

const scope = ref('critical'); // 'critical', 'cve', 'bookmarks', 'latest10'
const format = ref('email'); // 'email', 'markdown'
const copied = ref(false);

const bookmarkedIds = computed(() => {
  if (Array.isArray(props.bookmarks)) return props.bookmarks;
  try {
    return JSON.parse(localStorage.getItem('cyberhub_bookmarks') || '[]');
  } catch (e) {
    return [];
  }
});

const selectedPosts = computed(() => {
  if (!props.posts || props.posts.length === 0) return [];
  
  if (scope.value === 'critical') {
    return props.posts.filter(p => {
      const t = (p.title || '').toLowerCase();
      const c = (p.content || '').toLowerCase();
      return t.includes('0-day') || t.includes('零時差') || t.includes('重大') || 
             t.includes('高危') || t.includes('緊急') || t.includes('critical') || 
             c.includes('零時差漏洞') || c.includes('重大漏洞');
    }).slice(0, 10);
  } else if (scope.value === 'cve') {
    return props.posts.filter(p => {
      const full = (p.title || '') + ' ' + (p.content || '');
      return /CVE-\d{4}-\d{4,7}/i.test(full);
    }).slice(0, 10);
  } else if (scope.value === 'bookmarks') {
    return props.posts.filter(p => bookmarkedIds.value.includes(p.id));
  } else {
    return props.posts.slice(0, 10);
  }
});

const generatedText = computed(() => {
  const now = new Date();
  const dateStr = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
  const postList = selectedPosts.value;

  if (format.value === 'email') {
    let email = `【資訊安全宣導週報】${dateStr}\n`;
    email += `收件者：全體同仁 / 資訊安全管理團隊\n`;
    email += `主旨：【資安警訊與防護指引】本週重要資安情資彙整與防禦提醒\n\n`;
    email += `各位同仁好：\n\n`;
    email += `為提升機關與同仁數位防護意識，防範近期猖獗之釣魚郵件、勒索軟體與系統漏洞威脅，資安觀測站彙整最新重大情資與因應指引如下：\n\n`;
    email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    email += `🚨 重點情資清單（共 ${postList.length} 則）\n`;
    email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (postList.length === 0) {
      email += `目前無特定選取之項目。\n\n`;
    } else {
      postList.forEach((p, idx) => {
        const cleanContent = (p.content || '').replace(/(\n\n\d{4}-\d{2}-\d{2})+$/, '').trim();
        email += `${idx + 1}. 【${p.category || '資安情資'}】${p.title}\n`;
        email += `   · 發布日期：${p.timeAgo || '近期'}\n`;
        email += `   · 核心情資：${cleanContent.slice(0, 100)}...\n`;
        email += `   · 建議作為：請同仁落實日常防護，切勿點擊來源不明信件，系統出現更新提示時請儘速套用修補。\n\n`;
      });
    }

    email += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    email += `💡 全體同仁防護三不原則：\n`;
    email += `1. 不開啟陌生郵件與不明短網址連結。\n`;
    email += `2. 不向任何人提供簡訊動態密碼 (OTP) 與帳號密碼。\n`;
    email += `3. 不在公用電腦或非信任 Wi-Fi 處理機敏公務金流。\n\n`;
    email += `如遇疑似社交工程釣魚或電腦異常行為，請即刻通報資訊單位（內網分機 #1199 或警政署 165）。\n\n`;
    email += `生活資安觀測站 · 守護資訊安全，從你我做起\n`;
    return email;
  } else {
    // Markdown format
    let md = `# 🛡️ 生活資安觀測站 - 資安情資週報\n\n`;
    md += `> **產出日期**：${dateStr}  \n`;
    md += `> **情資數量**：共 ${postList.length} 則  \n`;
    md += `> **篩選範圍**：${scopeLabel.value}\n\n`;
    md += `## 📋 重點安全情報摘要\n\n`;

    if (postList.length === 0) {
      md += `*尚無相符情資項目。*\n\n`;
    } else {
      postList.forEach((p, idx) => {
        const cleanContent = (p.content || '').replace(/(\n\n\d{4}-\d{2}-\d{2})+$/, '').trim();
        md += `### ${idx + 1}. ${p.title}\n`;
        md += `- **分類**：\`${p.category || '綜合'}\` | **時間**：${p.timeAgo || '近期'}\n`;
        md += `- **情報摘要**：${cleanContent.slice(0, 130)}...\n`;
        md += `- **處置行動**：落實軟體漏洞排查，確認端點防護常駐，提升社交工程警覺。\n\n`;
      });
    }

    md += `---\n`;
    md += `*本週報由「生活資安觀測站」自動彙整生成。*  \n`;
    return md;
  }
});

const scopeLabel = computed(() => {
  switch (scope.value) {
    case 'critical': return '🚨 本週緊急高危漏洞情報';
    case 'cve': return '🐛 關聯 CVE 弱點清單';
    case 'bookmarks': return '⭐ 已收藏之重要文章';
    default: return '⚡ 最新熱門動態 (前 10 則)';
  }
});

const copyReport = async () => {
  try {
    await navigator.clipboard.writeText(generatedText.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2500);
  } catch (e) {
    console.error("Copy failed", e);
  }
};

const downloadMarkdown = () => {
  const blob = new Blob([generatedText.value], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = `cybersecurity-report-${new Date().toISOString().slice(0, 10)}.md`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-card">
      <div class="modal-header">
        <div class="header-title">
          <div class="icon-wrap">
            <i class="fa-solid fa-file-shield"></i>
          </div>
          <div>
            <h3>資安情資週報 / 宣導範本產出</h3>
            <p>一鍵將重要情資編排為全體同仁宣導信件或 Markdown 報表</p>
          </div>
        </div>
        <button class="close-btn" @click="emit('close')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="modal-body">
        <!-- Configuration Controls -->
        <div class="config-bar">
          <div class="config-item">
            <label><i class="fa-solid fa-filter"></i> 匯出範圍：</label>
            <div class="pill-group">
              <button 
                :class="{ active: scope === 'critical' }" 
                @click="scope = 'critical'"
              >🚨 緊急高危</button>
              <button 
                :class="{ active: scope === 'cve' }" 
                @click="scope = 'cve'"
              >🐛 CVE 漏洞</button>
              <button 
                :class="{ active: scope === 'bookmarks' }" 
                @click="scope = 'bookmarks'"
              >⭐ 已收藏 ({{ bookmarkedIds.length }})</button>
              <button 
                :class="{ active: scope === 'latest10' }" 
                @click="scope = 'latest10'"
              >⚡ 最新 Top 10</button>
            </div>
          </div>

          <div class="config-item">
            <label><i class="fa-solid fa-file-lines"></i> 輸出格式：</label>
            <div class="pill-group">
              <button 
                :class="{ active: format === 'email' }" 
                @click="format = 'email'"
              ><i class="fa-solid fa-envelope"></i> 全體同仁宣導信 (繁中 Email)</button>
              <button 
                :class="{ active: format === 'markdown' }" 
                @click="format = 'markdown'"
              ><i class="fa-solid fa-code"></i> Markdown 格式</button>
            </div>
          </div>
        </div>

        <!-- Preview Box -->
        <div class="preview-container">
          <div class="preview-header">
            <span><i class="fa-regular fa-eye"></i> 即時預覽內容 (共納入 {{ selectedPosts.length }} 則情資)</span>
            <span class="preview-tag">{{ format.toUpperCase() }}</span>
          </div>
          <textarea 
            class="report-textarea" 
            readonly 
            :value="generatedText"
          ></textarea>
        </div>
      </div>

      <div class="modal-footer">
        <button class="modal-btn secondary" @click="emit('close')">
          關閉
        </button>

        <button v-if="format === 'markdown'" class="modal-btn outline" @click="downloadMarkdown">
          <i class="fa-solid fa-download"></i> 下載 .md 檔案
        </button>

        <button class="modal-btn primary" @click="copyReport" :class="{ success: copied }">
          <i :class="['fa-solid', copied ? 'fa-check' : 'fa-copy']"></i>
          <span>{{ copied ? '已複製到剪貼簿！' : '一鍵複製全文' }}</span>
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.5rem;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-card {
  background-color: var(--bg-card);
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-color);
  width: 100%;
  max-width: 780px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleUp {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  padding: 1.4rem 1.6rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-color), #3b82f6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
  flex-shrink: 0;
}

.header-title h3 {
  font-size: 1.22rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.15rem;
}

.header-title p {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 8px;
  transition: all 0.2s;
}

.close-btn:hover {
  background-color: var(--bg-main);
  color: var(--text-primary);
}

.modal-body {
  padding: 1.4rem 1.6rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.config-bar {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  background: var(--bg-main);
  padding: 1rem 1.2rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.config-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.config-item label {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 90px;
}

.pill-group {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.pill-group button {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.pill-group button:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.pill-group button.active {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
}

.preview-container {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.65rem 1rem;
  background-color: var(--bg-main);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.preview-tag {
  background-color: rgba(37, 99, 235, 0.1);
  color: var(--primary-color);
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-family: monospace;
  font-weight: 700;
}

.report-textarea {
  width: 100%;
  height: 250px;
  padding: 1rem;
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.86rem;
  line-height: 1.65;
  resize: vertical;
  outline: none;
}

.modal-footer {
  padding: 1.1rem 1.6rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background-color: var(--bg-main);
}

.modal-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 1.25rem;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-btn.secondary {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.modal-btn.secondary:hover {
  background-color: var(--bg-card);
  color: var(--text-primary);
}

.modal-btn.outline {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.modal-btn.outline:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.modal-btn.primary {
  background-color: var(--primary-color);
  color: white;
  border: 1px solid var(--primary-color);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
}

.modal-btn.primary:hover {
  background-color: var(--primary-hover);
  transform: translateY(-1px);
}

.modal-btn.primary.success {
  background-color: #10b981;
  border-color: #10b981;
}
</style>
