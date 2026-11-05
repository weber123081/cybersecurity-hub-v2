<script setup>
import { ref, computed, watch } from 'vue';

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

// Filter & Deduplication Controls
const scope = ref('critical'); // 'critical' | 'twcert' | 'bookmarks'
const maxRows = ref(10); // 8 | 10 | 15 | 20 | 999
const reportDate = ref(new Date().toISOString().slice(0, 10).replace(/-/g, '/'));
const excludeExportedHistory = ref(false);
const defaultNotePreset = ref('經清查本單位未使用該產品，持續監控相關情資。');
const copied = ref(false);

// Track previously exported post keys in localStorage so user can optionally exclude already-exported items
const EXPORTED_STORAGE_KEY = 'cyberhub_exported_monthly_keys';
const exportedHistoryKeys = ref(loadExportedHistory());

function loadExportedHistory() {
  try {
    return JSON.parse(localStorage.getItem(EXPORTED_STORAGE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveExportedHistory(keys) {
  try {
    const merged = [...new Set([...exportedHistoryKeys.value, ...keys])];
    exportedHistoryKeys.value = merged;
    localStorage.setItem(EXPORTED_STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.error('Failed to save exported history:', e);
  }
}

function clearExportedHistory() {
  exportedHistoryKeys.value = [];
  localStorage.removeItem(EXPORTED_STORAGE_KEY);
}

const bookmarkedIds = computed(() => {
  if (Array.isArray(props.bookmarks)) return props.bookmarks;
  try {
    return JSON.parse(localStorage.getItem('cyberhub_bookmarks') || '[]');
  } catch (e) {
    return [];
  }
});

// ==========================================
// 1. Severity Scoring & Metadata Extraction
// ==========================================
function extractMaxCvss(text) {
  const scores = [];
  // TWCERT format: 9.8 (Critical) CVSS:3.1
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*\((?:Critical|High|Medium|Low)\)\s*CVSS/gi)) {
    const val = parseFloat(m[1]);
    if (val >= 1 && val <= 10) scores.push(val);
  }
  // Strip range phrases like "0 至 10 分" and CVSS version numbers like "CVSS v3.1" or "CVSS 4.0"
  const cleaned = text
    .replace(/0\s*[至到~-]\s*10\s*分?/g, '')
    .replace(/CVSS\s*(?:v|version|:)?\s*[34]\.[01](\s*及\s*[34]\.[01])?/gi, 'CVSS')
    .replace(/CVSS\s*[34]\.x/gi, 'CVSS');
  for (const m of cleaned.matchAll(/CVSS[^。；\n]{0,25}?(10(?:\.0)?|[1-9]\.\d)/gi)) {
    const val = parseFloat(m[1]);
    if (val >= 1 && val <= 10) scores.push(val);
  }
  if (/CVSS[^。；\n]{0,15}?滿分|滿分(?:重大)?(?:資安)?漏洞/i.test(cleaned)) {
    scores.push(10.0);
  }
  return scores.length ? Math.max(...scores) : null;
}

function extractCves(text) {
  return [...new Set((text.match(/CVE-\d{4}-\d{4,7}/gi) || []).map(c => c.toUpperCase()))];
}

function extractSubjectKey(title) {
  const t = (title || '').toLowerCase();
  // TWCERT format: 廠商｜產品 - ...
  const twMatch = (title || '').match(/^([^｜|]+)[｜|]([^-\s]+)/);
  if (twMatch) return twMatch[2].trim().toLowerCase();

  const knownEntities = [
    'teamviewer', 'wordpress', 'chromeos', 'chrome', 'firefox', 'node-red',
    'node.js', 'langflow', 'hugging face', 'huggingface', 'drupal', 'gitlab',
    'php', 'next.js', 'ahsaycbs', 'ahsay', '思科', 'cisco', 'palo alto',
    'ivanti', 'docker hub', 'sap', 'secushare', 'teamplus', 'tronclass',
    'webitr', 'ba-workflow', 'oneapp', 'armorx', '永豐銀行', 'fortinet',
    'fortigate', 'sharepoint', 'exchange', 'vmware', 'citrix', 'confluence'
  ];
  for (const entity of knownEntities) {
    if (t.includes(entity)) return entity;
  }
  return t.replace(/[^\u4e00-\u9fa5a-z0-9]/g, '').slice(0, 8);
}

function getTitleBigrams(title) {
  const clean = (title || '').toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
  const set = new Set();
  for (let i = 0; i < clean.length - 1; i++) {
    set.add(clean.slice(i, i + 2));
  }
  return set;
}

function isTitleSimilar(titleA, titleB) {
  const bgA = getTitleBigrams(titleA);
  const bgB = getTitleBigrams(titleB);
  if (bgA.size === 0 || bgB.size === 0) return false;
  let intersection = 0;
  for (const bg of bgA) {
    if (bgB.has(bg)) intersection++;
  }
  const similarity = intersection / Math.min(bgA.size, bgB.size);
  return similarity >= 0.45;
}

function evaluatePostSeverity(post) {
  const title = post.title || '';
  const content = post.content || '';
  const full = title + '\n' + content;

  // Exclude daily digest roundups (【資安日報】) since individual threat posts are already present
  if (/【資安日報】/.test(title)) {
    return { score: -1, cvss: null, cves: [], level: 'low' };
  }

  const cvss = extractMaxCvss(full);
  const cves = extractCves(full);
  let score = 0;

  if (cvss !== null) {
    score += cvss * 10; // 9.8 -> 98
  } else if (/重大漏洞|嚴重漏洞|滿分漏洞|零時差漏洞|0-day|高度重大/i.test(full)) {
    score += 86;
  } else if (/高風險漏洞|高危|重大資安|漏洞遭.*利用/i.test(full)) {
    score += 76;
  } else if (/漏洞|弱點/i.test(full)) {
    score += 65;
  } else if (/勒索軟體|後門|殭屍網路|APT|供應鏈攻擊|資料外洩|不明轉帳|憑證遭竊/i.test(full)) {
    score += 68;
  } else {
    score += 30;
  }

  // Active exploitation / Zero-day bonus
  if (/已遭利用|積極利用|出現攻擊嘗試|嘗試利用|零時差|0-day|已被利用/i.test(full)) {
    score += 18;
  }
  // High-impact RCE / Auth bypass bonus
  if (/遠端(?:程式碼)?執行|執行任意程式碼|執行任意.*指令|RCE|OS Command Injection|繞過身分驗證|存取控制繞過|權限提升|反向攻擊/i.test(full)) {
    score += 12;
  }
  // Explicit CVE bonus
  if (cves.length > 0) {
    score += 8;
  }
  // TWCERT official advisory bonus
  if ((post.authorName || '').includes('TWCERT/CC')) {
    score += 6;
  }

  let level = 'medium';
  if ((cvss !== null && cvss >= 9.0) || score >= 110) {
    level = 'critical';
  } else if ((cvss !== null && cvss >= 7.0) || score >= 80) {
    level = 'high';
  }

  return {
    score: Math.round(score * 10) / 10,
    cvss,
    cves,
    level
  };
}

// ==========================================
// 2. Auto-Extraction for the 6 Table Columns
// ==========================================
function extractSection(content, sectionNames) {
  const pattern = Array.isArray(sectionNames) ? sectionNames.join('|') : sectionNames;
  const regex = new RegExp('【(?:' + pattern + ')】\\s*([\\s\\S]*?)(?=\\n\\n【|$)');
  const m = content.match(regex);
  return m ? m[1].trim() : '';
}

function buildRowFromPost(post, meta) {
  const rawContent = (post.content || '').replace(/(\n\n\d{4}-\d{2}-\d{2})+$/, '').trim();
  const sentences = rawContent
    .split(/[。！？\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 6 && !/^【.*】$/.test(s));

  // Column 1: 搜集日期
  const collectDate = post.timeAgo || (post.pubDate ? post.pubDate.slice(0, 10) : new Date().toISOString().slice(0, 10));

  // Column 2: 搜集來源
  const rawSource = (post.authorName || post.author?.name || '資安情報').replace(/^資安情報\s*[·・-]\s*/, '').trim();
  let source = rawSource;
  if (rawSource.includes('iThome')) source = 'iThome 資安新聞';
  else if (rawSource.includes('趨勢科技')) source = '趨勢科技資安部落格';

  // Column 3: 威脅情資說明
  const tags = [];
  if (meta.cvss !== null) tags.push(`CVSS ${meta.cvss.toFixed(1)}`);
  else if (meta.level === 'critical') tags.push('重大高危');
  if (meta.cves.length > 0) tags.push(meta.cves.slice(0, 2).join('、'));
  const tagPrefix = tags.length > 0 ? `【${tags.join('｜')}】` : '';

  const twProblem = extractSection(rawContent, ['問題描述', '漏洞說明']);
  let descText = post.title || '';
  if (twProblem) {
    descText = `${post.title}：${twProblem.replace(/\n+/g, ' ')}`;
  } else {
    const leadSent = sentences.find(s => !s.includes('CVSS（通用漏洞評分系統）'));
    if (leadSent) {
      if (leadSent.includes(post.title.slice(0, 6))) {
        descText = `${leadSent}。`;
      } else {
        descText = `${post.title}。${leadSent}。`;
      }
    }
  }
  const description = `${tagPrefix}${descText}`;

  // Column 4: 可能之影響
  const twProduct = extractSection(rawContent, ['影響產品']);
  const impactCand = sentences.find((s, idx) =>
    idx > 0 &&
    /攻擊者可|可能導致|可遠端|可藉此|造成|竊取|繞過|執行任意|植入後門|勒索|癱瘓|未經身分|未通過身分|控制端|寫入任意/.test(s)
  ) || sentences.find(s =>
    /攻擊者可|可能導致|可遠端|可藉此|造成|竊取|繞過|執行任意|植入後門|勒索|癱瘓|未經身分|未通過身分/.test(s)
  );

  let impact = '';
  if (twProduct && twProblem) {
    const impactPart = twProblem.includes('，') ? twProblem.split('，').slice(1).join('，') : twProblem;
    impact = `受影響產品：${twProduct.replace(/\n+/g, '、')}。${impactPart}`;
  } else if (impactCand && !description.includes(impactCand)) {
    impact = `${impactCand}。`;
    if (twProduct) {
      impact = `受影響產品：${twProduct.replace(/\n+/g, '、')}；${impact}`;
    }
  } else if (/遠端.*執行|RCE|任意程式碼|任意.*指令/i.test(rawContent)) {
    impact = '未經授權之攻擊者可遠端執行任意程式碼 (RCE)，進而植入後門、竊取機敏資料或控制伺服器。';
  } else if (/繞過.*驗證|存取控制/i.test(rawContent)) {
    impact = '攻擊者可繞過身分驗證或存取控制機制，非法存取受限系統功能與機敏資料。';
  } else {
    impact = '可能導致受影響系統遭未授權存取、植入惡意程式、機敏資料外洩或服務中斷。';
  }

  // Column 5: 因應方案
  const twSolution = extractSection(rawContent, ['解決方法', '解決辦法']);
  let solution = '';
  if (twSolution) {
    solution = twSolution.replace(/\n+/g, ' ');
  } else {
    const solSent = sentences.find(s =>
      /官方已推出|已釋出|發布.*更新|更新為|更新至|升級至|修補版本|完成修補|緩解措施|呼籲用戶/.test(s)
    );
    if (solSent) {
      solution = `${solSent}；請盤點內部環境是否使用受影響版本並儘速完成修補。`;
    } else {
      solution = '1. 立即盤點內部環境是否使用受影響之軟硬體版本並套用官方安全修補更新。\n2. 限制管理介面外部存取並加強異常連線監控。';
    }
  }

  // Column 6: 備註
  const uniqueKey = meta.cves[0] || `post-${post.id}`;

  return {
    id: post.id,
    uniqueKey,
    level: meta.level,
    score: meta.score,
    cvss: meta.cvss,
    cves: meta.cves,
    collectDate,
    source,
    description,
    impact,
    solution,
    note: defaultNotePreset.value
  };
}

// ==========================================
// 3. Deduplication & Ranking Pipeline
// ==========================================
const deduplicatedStats = ref({ totalCandidates: 0, skippedDuplicates: 0, skippedExported: 0 });
const editableRows = ref([]);

function rebuildReportRows() {
  if (!props.posts || props.posts.length === 0) {
    editableRows.value = [];
    return;
  }

  // Step 1: Score all posts
  let candidates = props.posts.map(post => {
    const meta = evaluatePostSeverity(post);
    return { post, meta };
  });

  // Step 2: Filter by selected scope
  if (scope.value === 'critical') {
    candidates = candidates.filter(x => x.meta.score >= 65);
    // Sort by severity score descending (most severe first), then newest date
    candidates.sort((a, b) =>
      b.meta.score - a.meta.score ||
      new Date(b.post.pubDate || b.post.timeAgo || 0) - new Date(a.post.pubDate || a.post.timeAgo || 0)
    );
  } else if (scope.value === 'twcert') {
    candidates = candidates.filter(x =>
      (x.post.authorName || '').includes('TWCERT/CC') && x.meta.score > 0
    );
    candidates.sort((a, b) => b.meta.score - a.meta.score);
  } else if (scope.value === 'bookmarks') {
    candidates = candidates.filter(x => bookmarkedIds.value.includes(x.post.id));
    candidates.sort((a, b) => b.meta.score - a.meta.score);
  }

  const totalCandidates = candidates.length;
  let skippedDuplicates = 0;
  let skippedExported = 0;

  // Step 3: Multi-layer Deduplication (CVE overlap + Subject/Product + Title similarity)
  const seenCves = new Set();
  const seenSubjects = new Set();
  const acceptedTitles = [];
  const uniqueRows = [];

  for (const item of candidates) {
    const { post, meta } = item;
    const uniqueKey = meta.cves[0] || `post-${post.id}`;

    // Layer 0: Optional exclusion of previously exported items
    if (excludeExportedHistory.value && exportedHistoryKeys.value.includes(uniqueKey)) {
      skippedExported++;
      continue;
    }

    // Layer 1: Shared CVE ID with a higher-severity item already included
    const hasOverlappingCve = meta.cves.length > 0 && meta.cves.some(c => seenCves.has(c));

    // Layer 2: Same product/vendor subject key
    const subjKey = extractSubjectKey(post.title);
    const hasSameSubject = subjKey && seenSubjects.has(subjKey);

    // Layer 3: Fuzzy title bigram similarity >= 45%
    const hasSimilarTitle = acceptedTitles.some(prevTitle => isTitleSimilar(post.title, prevTitle));

    if (hasOverlappingCve || hasSameSubject || hasSimilarTitle) {
      skippedDuplicates++;
      continue;
    }

    meta.cves.forEach(c => seenCves.add(c));
    if (subjKey) seenSubjects.add(subjKey);
    acceptedTitles.push(post.title);

    uniqueRows.push(buildRowFromPost(post, meta));
  }

  deduplicatedStats.value = {
    totalCandidates,
    skippedDuplicates,
    skippedExported
  };

  editableRows.value = uniqueRows.slice(0, maxRows.value);
}

watch(
  () => [props.isOpen, props.posts, scope.value, maxRows.value, excludeExportedHistory.value],
  () => {
    if (props.isOpen) {
      rebuildReportRows();
    }
  },
  { immediate: true }
);

function applyNotePresetToAll(presetText) {
  defaultNotePreset.value = presetText;
  editableRows.value.forEach(row => {
    row.note = presetText;
  });
}

function removeRow(index) {
  editableRows.value.splice(index, 1);
}

function addBlankRow() {
  editableRows.value.push({
    id: 'custom-row-' + Date.now(),
    uniqueKey: 'custom-' + Date.now(),
    level: 'high',
    score: 90,
    cvss: null,
    cves: [],
    collectDate: new Date().toISOString().slice(0, 10),
    source: '內部資安盤點',
    description: '',
    impact: '',
    solution: '',
    note: defaultNotePreset.value
  });
}

// ==========================================
// 4. Export Functions (Word .doc / Excel .csv / Print PDF / Copy)
// ==========================================
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

function buildPrintableHtmlDocument() {
  const rowsHtml = editableRows.value.map(r => `
    <tr>
      <td style="text-align:center; white-space:nowrap;">${escapeHtml(r.collectDate)}</td>
      <td style="text-align:center;">${escapeHtml(r.source)}</td>
      <td>${escapeHtml(r.description)}</td>
      <td>${escapeHtml(r.impact)}</td>
      <td>${escapeHtml(r.solution)}</td>
      <td>${escapeHtml(r.note)}</td>
    </tr>
  `).join('');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:w="urn:schemas-microsoft-com:office:word"
        xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>資安威脅情資月報_${reportDate.value}</title>
  <style>
    @page WordSection1 {
      size: 841.9pt 595.3pt; /* A4 Landscape */
      mso-page-orientation: landscape;
      margin: 36.0pt 36.0pt 36.0pt 36.0pt;
    }
    div.WordSection1 { page: WordSection1; }
    body {
      font-family: "微軟正黑體", "Microsoft JhengHei", "標楷體", sans-serif;
      font-size: 10.5pt;
      color: #000000;
    }
    .report-meta {
      font-size: 11pt;
      margin-bottom: 10pt;
      font-weight: normal;
    }
    table.threat-table {
      width: 100%;
      border-collapse: collapse;
      border: 1pt solid #000000;
      table-layout: fixed;
    }
    table.threat-table th,
    table.threat-table td {
      border: 1pt solid #000000;
      padding: 6pt 8pt;
      vertical-align: middle;
      word-wrap: break-word;
      line-height: 1.45;
      font-size: 10pt;
    }
    table.threat-table th {
      text-align: center;
      font-weight: bold;
      background-color: #ffffff;
    }
  </style>
</head>
<body>
  <div class="WordSection1">
    <div class="report-meta">製表日期：${escapeHtml(reportDate.value)}</div>
    <table class="threat-table">
      <thead>
        <tr>
          <th style="width: 10%;">搜集日期</th>
          <th style="width: 12%;">搜集來源</th>
          <th style="width: 25%;">威脅情資說明</th>
          <th style="width: 22%;">可能之影響</th>
          <th style="width: 20%;">因應方案</th>
          <th style="width: 11%;">備註</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function recordCurrentExport() {
  const keys = editableRows.value.map(r => r.uniqueKey).filter(Boolean);
  saveExportedHistory(keys);
}

function exportWordDoc() {
  const html = buildPrintableHtmlDocument();
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `資安高危威脅情資月報_${reportDate.value.replace(/\//g, '-')}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  recordCurrentExport();
}

function exportExcelCsv() {
  const headers = ['搜集日期', '搜集來源', '威脅情資說明', '可能之影響', '因應方案', '備註'];
  const escapeCsv = (val) => {
    const str = String(val || '').replace(/"/g, '""');
    return `"${str}"`;
  };
  const lines = [
    `"製表日期：${reportDate.value}","","","","",""`,
    headers.map(escapeCsv).join(','),
    ...editableRows.value.map(r =>
      [r.collectDate, r.source, r.description, r.impact, r.solution, r.note].map(escapeCsv).join(',')
    )
  ];
  const csvContent = '\ufeff' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `資安高危威脅情資月報_${reportDate.value.replace(/\//g, '-')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  recordCurrentExport();
}

function printOrSavePdf() {
  const html = buildPrintableHtmlDocument();
  const printWin = window.open('', '_blank', 'width=1100,height=800');
  if (!printWin) {
    alert('請允許瀏覽器開啟彈出視窗以進行列印 / 另存 PDF');
    return;
  }
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => {
    printWin.print();
  }, 300);
  recordCurrentExport();
}

async function copyTableToClipboard() {
  try {
    const html = buildPrintableHtmlDocument();
    const plainLines = [
      `製表日期：${reportDate.value}`,
      ['搜集日期', '搜集來源', '威脅情資說明', '可能之影響', '因應方案', '備註'].join('\t'),
      ...editableRows.value.map(r =>
        [r.collectDate, r.source, r.description, r.impact, r.solution, r.note]
          .map(v => String(v || '').replace(/\n+/g, ' '))
          .join('\t')
      )
    ].join('\n');

    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainLines], { type: 'text/plain' })
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(plainLines);
    }
    copied.value = true;
    recordCurrentExport();
    setTimeout(() => {
      copied.value = false;
    }, 2500);
  } catch (e) {
    console.error('Copy failed:', e);
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-card">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="header-title">
            <div class="icon-wrap">
              <i class="fa-solid fa-file-shield"></i>
            </div>
            <div>
              <h3>資安高危威脅情資月報（自動去重 & 表單匯出）</h3>
              <p>自動依 CVSS 嚴重度、零時差與 RCE 風險排序，排除跨來源重複報導，一鍵匯出 Word / Excel 標準表單</p>
            </div>
          </div>
          <button class="close-btn" @click="emit('close')">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Modal Body -->
        <div class="modal-body">
          <!-- Top Control Bar -->
          <div class="config-bar">
            <div class="config-row">
              <div class="config-item">
                <label><i class="fa-solid fa-fire-flame-curved"></i> 抓取條件：</label>
                <div class="pill-group">
                  <button
                    :class="{ active: scope === 'critical' }"
                    @click="scope = 'critical'"
                  >🚨 最嚴重高危優先 (CVSS / 0-day / RCE)</button>
                  <button
                    :class="{ active: scope === 'twcert' }"
                    @click="scope = 'twcert'"
                  >🇹🇼 TWCERT/CC 漏洞通告</button>
                  <button
                    :class="{ active: scope === 'bookmarks' }"
                    @click="scope = 'bookmarks'"
                  >⭐ 已收藏情資 ({{ bookmarkedIds.length }})</button>
                </div>
              </div>

              <div class="config-item">
                <label><i class="fa-solid fa-list-ol"></i> 匯出筆數：</label>
                <div class="pill-group">
                  <button :class="{ active: maxRows === 8 }" @click="maxRows = 8">Top 8</button>
                  <button :class="{ active: maxRows === 10 }" @click="maxRows = 10">Top 10</button>
                  <button :class="{ active: maxRows === 15 }" @click="maxRows = 15">Top 15</button>
                  <button :class="{ active: maxRows === 20 }" @click="maxRows = 20">Top 20</button>
                  <button :class="{ active: maxRows === 999 }" @click="maxRows = 999">全部 ({{ deduplicatedStats.totalCandidates - deduplicatedStats.skippedDuplicates }})</button>
                </div>
              </div>
            </div>

            <div class="config-row">
              <div class="config-item">
                <label><i class="fa-regular fa-calendar"></i> 製表日期：</label>
                <input type="text" v-model="reportDate" class="date-input" placeholder="YYYY/MM/DD" />
              </div>

              <div class="config-item dedup-status-wrap">
                <span class="dedup-badge" title="系統已自動比對 CVE 漏洞編號、受影響產品名稱與標題相似度，排除重複情資">
                  <i class="fa-solid fa-filter-circle-xmark"></i>
                  已自動排除 <strong>{{ deduplicatedStats.skippedDuplicates }}</strong> 筆重複報導/日報彙整
                </span>

                <label class="history-check-label" title="勾選後，曾經點擊匯出過的舊情資將不再重複出現">
                  <input type="checkbox" v-model="excludeExportedHistory" />
                  排除已匯出過的舊情資 (已記錄 {{ exportedHistoryKeys.length }} 筆)
                </label>
                <button
                  v-if="exportedHistoryKeys.length > 0"
                  class="clear-history-btn"
                  @click="clearExportedHistory"
                  title="清除已匯出歷史紀錄"
                >
                  重設紀錄
                </button>
              </div>
            </div>

            <!-- Quick Note Presets -->
            <div class="config-row note-preset-row">
              <div class="config-item">
                <label><i class="fa-solid fa-pen-clip"></i> 備註快填：</label>
                <div class="pill-group">
                  <button @click="applyNotePresetToAll('經清查本單位未使用該產品，持續監控相關情資。')">
                    未使用該產品
                  </button>
                  <button @click="applyNotePresetToAll('已通知系統管理員進行盤點與版本更新修補。')">
                    已通知管理員修補
                  </button>
                  <button @click="applyNotePresetToAll('已完成安全性更新修補，服務運作正常。')">
                    已完成更新修補
                  </button>
                  <button @click="applyNotePresetToAll('已發布內部資安通告提醒同仁加強防範。')">
                    已發布內部宣導
                  </button>
                </div>
              </div>
              <button class="add-row-btn" @click="addBlankRow">
                <i class="fa-solid fa-plus"></i> 新增自訂列
              </button>
            </div>
          </div>

          <!-- Interactive 6-Column Formal Table Preview (Matching User Screenshot) -->
          <div class="formal-sheet-container">
            <div class="sheet-top-bar">
              <div class="sheet-date-line">
                製表日期：<span>{{ reportDate }}</span>
              </div>
              <div class="sheet-hint">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                提示：下方表格文字皆可直接點擊修改，匯出時將完整保留您的修改內容
              </div>
            </div>

            <div class="table-scroll-wrap">
              <table class="formal-report-table">
                <thead>
                  <tr>
                    <th style="width: 95px;">搜集日期</th>
                    <th style="width: 115px;">搜集來源</th>
                    <th style="width: 24%;">威脅情資說明</th>
                    <th style="width: 22%;">可能之影響</th>
                    <th style="width: 22%;">因應方案</th>
                    <th style="width: 14%;">備註</th>
                    <th style="width: 42px;" class="no-print">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in editableRows" :key="row.id">
                    <td>
                      <input type="text" v-model="row.collectDate" class="cell-input center" />
                      <div class="severity-indicator">
                        <span v-if="row.cvss" class="cvss-pill" :class="row.cvss >= 9 ? 'crit' : 'high'">
                          CVSS {{ row.cvss.toFixed(1) }}
                        </span>
                        <span v-else class="cvss-pill high">高危</span>
                      </div>
                    </td>
                    <td>
                      <textarea v-model="row.source" rows="3" class="cell-textarea center"></textarea>
                    </td>
                    <td>
                      <textarea v-model="row.description" rows="4" class="cell-textarea"></textarea>
                    </td>
                    <td>
                      <textarea v-model="row.impact" rows="4" class="cell-textarea"></textarea>
                    </td>
                    <td>
                      <textarea v-model="row.solution" rows="4" class="cell-textarea"></textarea>
                    </td>
                    <td>
                      <textarea v-model="row.note" rows="4" class="cell-textarea"></textarea>
                    </td>
                    <td class="action-cell no-print">
                      <button class="del-row-btn" @click="removeRow(idx)" title="從本次報表移除此列">
                        <i class="fa-solid fa-trash-can"></i>
                      </button>
                    </td>
                  </tr>
                  <tr v-if="editableRows.length === 0">
                    <td colspan="7" class="empty-row">
                      目前沒有符合條件的情資，請調整上方篩選條件或重設已匯出紀錄。
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Modal Footer: Export Actions -->
        <div class="modal-footer">
          <div class="footer-left">
            <span class="row-count-summary">
              共納入 <strong>{{ editableRows.length }}</strong> 筆最嚴重不重複情資
            </span>
          </div>

          <div class="footer-actions">
            <button class="modal-btn secondary" @click="emit('close')">
              關閉
            </button>

            <button class="modal-btn outline" @click="copyTableToClipboard" :class="{ success: copied }">
              <i :class="['fa-solid', copied ? 'fa-check' : 'fa-copy']"></i>
              <span>{{ copied ? '已複製表格！可直接貼至 Word/信件' : '複製表格' }}</span>
            </button>

            <button class="modal-btn outline" @click="printOrSavePdf">
              <i class="fa-solid fa-print"></i> 列印 / 另存 PDF
            </button>

            <button class="modal-btn excel-btn" @click="exportExcelCsv">
              <i class="fa-solid fa-file-csv"></i> 匯出 Excel (.csv)
            </button>

            <button class="modal-btn primary" @click="exportWordDoc">
              <i class="fa-solid fa-file-word"></i> 匯出 Word 表單 (.doc)
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.25rem;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-card {
  background-color: var(--bg-card);
  border-radius: 16px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-color);
  width: 100%;
  max-width: 1220px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: scaleUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scaleUp {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.modal-header {
  padding: 1.15rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #dc2626, #ea580c);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.28);
  flex-shrink: 0;
}

.header-title h3 {
  font-size: 1.18rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.1rem;
}

.header-title p {
  font-size: 0.82rem;
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
  padding: 1.1rem 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.config-bar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--bg-main);
  padding: 0.9rem 1.15rem;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.config-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.config-item label {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--text-primary);
}

.date-input {
  padding: 0.3rem 0.65rem;
  font-size: 0.84rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-primary);
  width: 125px;
  font-family: monospace;
}

.dedup-status-wrap {
  gap: 0.75rem;
}

.dedup-badge {
  font-size: 0.8rem;
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.3);
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
}

.dark-theme .dedup-badge {
  color: #34d399;
}

.history-check-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem !important;
  font-weight: 600 !important;
  color: var(--text-secondary) !important;
  cursor: pointer;
}

.clear-history-btn {
  font-size: 0.75rem;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
}

.clear-history-btn:hover {
  color: #dc2626;
  border-color: #dc2626;
}

.pill-group {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.pill-group button {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 0.3rem 0.7rem;
  border-radius: 18px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.18s;
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

.add-row-btn {
  background-color: var(--bg-card);
  border: 1px dashed var(--primary-color);
  color: var(--primary-color);
  padding: 0.3rem 0.75rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.add-row-btn:hover {
  background-color: var(--primary-color);
  color: white;
}

/* Formal Sheet Preview (Matching User Screenshot) */
.formal-sheet-container {
  background: #ffffff;
  color: #111827;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 1rem 1.2rem;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.05);
}

.sheet-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.65rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.sheet-date-line {
  font-size: 0.95rem;
  font-weight: 700;
  color: #111827;
}

.sheet-hint {
  font-size: 0.78rem;
  color: #6b7280;
}

.table-scroll-wrap {
  overflow-x: auto;
  max-height: 430px;
  overflow-y: auto;
  border: 1px solid #000000;
}

.formal-report-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  background: #ffffff;
}

.formal-report-table th,
.formal-report-table td {
  border: 1px solid #000000;
  padding: 0.45rem 0.5rem;
  vertical-align: top;
  color: #111827;
  font-size: 0.84rem;
}

.formal-report-table th {
  background: #f9fafb;
  font-weight: 700;
  text-align: center;
  position: sticky;
  top: 0;
  z-index: 2;
  border-bottom: 1.5px solid #000000;
}

.cell-input,
.cell-textarea {
  width: 100%;
  border: 1px solid transparent;
  background: transparent;
  color: #111827;
  font-family: inherit;
  font-size: 0.83rem;
  line-height: 1.48;
  padding: 0.15rem 0.25rem;
  border-radius: 4px;
  resize: vertical;
  outline: none;
}

.cell-input.center,
.cell-textarea.center {
  text-align: center;
}

.cell-input:focus,
.cell-textarea:focus {
  border-color: #3b82f6;
  background: #eff6ff;
}

.severity-indicator {
  display: flex;
  justify-content: center;
  margin-top: 0.25rem;
}

.cvss-pill {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
}

.cvss-pill.crit {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.cvss-pill.high {
  background: #ffedd5;
  color: #c2410c;
  border: 1px solid #fdba74;
}

.action-cell {
  text-align: center;
  vertical-align: middle !important;
}

.del-row-btn {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 0.25rem;
  font-size: 0.9rem;
  border-radius: 4px;
}

.del-row-btn:hover {
  color: #dc2626;
  background: #fef2f2;
}

.empty-row {
  text-align: center;
  padding: 2rem !important;
  color: #6b7280 !important;
}

/* Footer */
.modal-footer {
  padding: 0.95rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  background-color: var(--bg-main);
}

.row-count-summary {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.footer-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.modal-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1.05rem;
  border-radius: 8px;
  font-size: 0.85rem;
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

.modal-btn.outline.success {
  background-color: #10b981;
  border-color: #10b981;
  color: white;
}

.modal-btn.excel-btn {
  background-color: #059669;
  color: white;
  border: 1px solid #059669;
}

.modal-btn.excel-btn:hover {
  background-color: #047857;
}

.modal-btn.primary {
  background-color: #2563eb;
  color: white;
  border: 1px solid #2563eb;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
}

.modal-btn.primary:hover {
  background-color: #1d4ed8;
  transform: translateY(-1px);
}
</style>
