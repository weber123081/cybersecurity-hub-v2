# 生活資安觀測站 (Cybersecurity Hub)

生活資安觀測站是一個專為**封閉內網環境 (Air-Gapped Intranet)** 設計的現代化資安資訊儀表板。
透過後台自動化爬蟲技術，系統能定時將最新的資安情報（如系統漏洞、防詐騙資訊）抓取回安全的內網環境中，讓使用者在完全未連線外網的情況下，也能獲取最即時的資安動態。

## 🌟 核心特色 (Key Features)

- **絕對的內網安全 (Air-Gapped Ready)**：前端採用純靜態讀取模式，瀏覽器端**絕對不會**發送任何對外網路請求，完美符合最高級別的資安隔離規範。
- **全內文閱讀體驗 (Full-Text Content)**：捨棄傳統的「點擊閱讀原文」外部連結。後台爬蟲會自動深入原始新聞網頁（如 iThome），完整擷取所有內文，讓使用者在內網中即可掌握所有細節。
- **防止資訊過載的「閱讀全文」機制**：為了保持版面清爽，超過 150 字的長篇報導會自動摺疊。使用者有興趣時，只需點擊「閱讀全文」即可在原地無縫展開。
- **現代化社群貼文版面 (Social Feed UI)**：採用類似 Facebook/Instagram 的流暢三欄式版面設計，搭配高質感的玻璃擬物化 (Glassmorphism) CSS 效果與平滑動畫。
- **高效能 Vue 3 架構**：前端使用 Vue 3 與 Vite 打造，確保畫面渲染極度流暢且易於後續維護擴充。

---

## 🏗️ 系統架構 (Architecture)

本專案分為兩個獨立運作的部分，以實現內外網隔離：

### 1. 後台資料抓取橋接器 (Backend Fetcher)
- **位置**：部署於 DMZ 區或具有受控外部網路連線能力的伺服器。
- **功能**：由 `Node.js` 編寫。它會解析 RSS 來源 (目前設定為 iThome 資安新聞)，接著利用 `cheerio` 爬蟲套件深入每個網址抓取**完整 HTML 內容**，並剔除掉危險元素與外部連結。
- **產出**：最終結果會被編譯為一個安全的、純文字的 `public/data/news.json` 檔案。
- **啟動指令**：`node backend/fetcher.js`

### 2. 純內網靜態前端 (Isolated Vue Client)
- **位置**：部署於完全無外網連線的純內部網路伺服器。
- **功能**：由 `Vue 3` 編寫。它只會向本地端（同網域）請求 `news.json`，並利用元件化架構 (`App.vue`, `PostCard.vue`) 動態渲染出流暢的貼文牆。

---

## 🚀 快速啟動 (Getting Started)

### 安裝依賴 (Install Dependencies)
請先確保您的環境已安裝 Node.js (v20+)。

```bash
# 在專案根目錄下安裝所需套件
npm install
```

### 資料同步 (Sync Data - 需有外網能力)
此步驟會執行爬蟲，可能需要十幾秒的時間來抓取完整文章。
```bash
node backend/fetcher.js
```
執行成功後，您會在 `public/data/` 底下看到最新產生的 `news.json`。

### 本地開發預覽 (Local Development Server)
```bash
npm run dev
```
啟動後只要開啟瀏覽器，前往終端機顯示的 Localhost 網址 (如 `http://localhost:5173/`) 即可觀看結果。

### 內網正式部署 (Production Build)
當您要在正式的無網路環境部署時，請執行：
```bash
npm run build
```
接著將產生出來的 `dist/` 資料夾放進內網的 Nginx 或 Apache 伺服器中即可。之後只需定時（如透過 cron job）執行 `node backend/fetcher.js` 並將新的 `news.json` 覆蓋掉 Nginx 根目錄下的檔案，內網的畫面就會自動更新。

---

## 🛠️ 技術棧 (Tech Stack)

- **前端框架**: Vue 3 (Composition API)
- **建置工具**: Vite
- **後端抓取**: Node.js
- **爬蟲解析**: Cheerio, rss-parser
- **樣式設計**: Vanilla CSS (CSS Variables, Flexbox, Animation)
- **圖示庫**: Font Awesome 6 (Free)
