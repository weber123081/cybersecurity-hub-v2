// scripts/build-portable.mjs
// 一鍵建立「生活資安觀測站 · 綠色免安裝便攜版 (Portable Edition)」

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const BUNDLE_DIR = path.join(RELEASE_DIR, '生活資安觀測站-便攜版');

console.log('================================================================');
console.log(' 🛡️ 開始建置：生活資安觀測站 · 綠色免安裝便攜版 (Portable Edition)');
console.log('================================================================');

// 1. 編譯前端 Vue 3 至 dist/
console.log('\n[1/7] 正在編譯前端 Vue 3 (Vite build)...');
try {
    execSync('npm.cmd run build', { cwd: ROOT_DIR, stdio: 'inherit' });
} catch (e) {
    console.error('前端編譯失敗:', e.message);
    process.exit(1);
}

// 2. 清理並建立 release 目錄
console.log('\n[2/7] 正在建立輸出目錄結構...');
if (fs.existsSync(BUNDLE_DIR)) {
    fs.rmSync(BUNDLE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(BUNDLE_DIR, { recursive: true });

// 3. 複製 runtime/node.exe
console.log('\n[3/7] 正在打包內建綠色免安裝 Node.js 執行核心...');
const runtimeDir = path.join(BUNDLE_DIR, 'runtime');
fs.mkdirSync(runtimeDir, { recursive: true });
const systemNode = process.execPath;
const targetNode = path.join(runtimeDir, 'node.exe');
fs.copyFileSync(systemNode, targetNode);
console.log(` -> 核心檔案就緒: ${targetNode} (${Math.round(fs.statSync(targetNode).size / 1024 / 1024)} MB)`);

// 4. 複製前端編譯產物 dist/ 與 public/
console.log('\n[4/7] 正在封裝前端靜態檔案 (dist/) 與情資資料庫 (public/)...');
function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

copyDirSync(path.join(ROOT_DIR, 'dist'), path.join(BUNDLE_DIR, 'dist'));

// public/data/
const bundlePublicData = path.join(BUNDLE_DIR, 'public', 'data');
fs.mkdirSync(bundlePublicData, { recursive: true });
const newsJson = path.join(ROOT_DIR, 'public', 'data', 'news.json');
const dictJson = path.join(ROOT_DIR, 'public', 'data', 'dictionary.json');
if (fs.existsSync(newsJson)) fs.copyFileSync(newsJson, path.join(bundlePublicData, 'news.json'));
if (fs.existsSync(dictJson)) fs.copyFileSync(dictJson, path.join(bundlePublicData, 'dictionary.json'));

// 5. 複製後端核心 (backend/)
console.log('\n[5/7] 正在封裝後端服務 (backend/) 與運行模組...');
const bundleBackend = path.join(BUNDLE_DIR, 'backend');
fs.mkdirSync(bundleBackend, { recursive: true });

const backendFiles = [
    'server.js',
    'fetcher.js',
    'mailer.js',
    'threat-analyzer.js',
    'gemini-analyzer.js',
    'package.json'
];
for (const file of backendFiles) {
    const src = path.join(ROOT_DIR, 'backend', file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(bundleBackend, file));
    }
}

// backend/public/
copyDirSync(path.join(ROOT_DIR, 'backend', 'public'), path.join(bundleBackend, 'public'));

// backend/data/
const bundleBackendData = path.join(bundleBackend, 'data');
fs.mkdirSync(bundleBackendData, { recursive: true });
const dataFiles = ['sources.json', 'site-config.json', 'site-config.example.json', 'ai-threat-cache.json'];
for (const f of dataFiles) {
    const src = path.join(ROOT_DIR, 'backend', 'data', f);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(bundleBackendData, f));
    }
}

// backend/node_modules/
console.log(' -> 正在複製後端 node_modules 模組...');
copyDirSync(path.join(ROOT_DIR, 'backend', 'node_modules'), path.join(bundleBackend, 'node_modules'));

// 6. 編譯原生 Windows 啟動器 .exe 與輔助腳本
console.log('\n[6/7] 正在編譯原生 Windows 啟動程式 (啟動生活資安觀測站.exe)...');
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const launcherSource = path.join(__dirname, 'Launcher.cs');
const launcherExe = path.join(BUNDLE_DIR, '啟動生活資安觀測站.exe');

try {
    execSync(`"${cscPath}" /nologo /target:exe /out:"${launcherExe}" "${launcherSource}"`, { stdio: 'inherit' });
    console.log(' -> 原生啟動器編譯成功: 啟動生活資安觀測站.exe');
} catch (e) {
    console.warn(' -> C# 編譯器失敗，將採用批次檔為主要啟動方式');
}

// 建立 啟動生活資安觀測站.bat
fs.writeFileSync(path.join(BUNDLE_DIR, '啟動生活資安觀測站.bat'), `@echo off
chcp 65001 >nul
title 生活資安觀測站 · 便攜獨立版
echo ==================================================================
echo         生活資安觀測站 · 便攜獨立版 (Portable Edition)
echo ==================================================================
echo [狀態] 正在以內建免安裝環境啟動服務...
echo.
start "" "http://localhost:3000/"
".\\runtime\\node.exe" ".\\backend\\server.js"
pause
`, 'utf8');

// 建立 停止生活資安觀測站.bat
fs.writeFileSync(path.join(BUNDLE_DIR, '停止生活資安觀測站.bat'), `@echo off
chcp 65001 >nul
title 停止生活資安觀測站
echo 正在停止本機後台服務進程...
taskkill /f /im node.exe >nul 2>&1
echo [完成] 生活資安觀測站服務已安全關閉。
timeout /t 2 >nul
`, 'utf8');

// 建立 說明文件.txt
fs.writeFileSync(path.join(BUNDLE_DIR, '使用說明.txt'), `==================================================================
  🛡️ 生活資安觀測站 · 綠色免安裝便攜版 (Portable Edition)
==================================================================

【快速啟動】
1. 直接雙擊執行「啟動生活資安觀測站.exe」（或執行「啟動生活資安觀測站.bat」）。
2. 系統會自動調用資料夾內建的免安裝 Node.js 核心啟動服務，並自動開啟預設瀏覽器：
   - 公開生活防護前台：http://localhost:3000/
   - 資訊中心管理後台：http://localhost:3000/admin.html
3. 將黑色的伺服器視窗最小化，即可在背景持續運行排程抓取與定時郵件通報。
4. 欲停止服務：直接關閉該視窗，或雙擊執行「停止生活資安觀測站.bat」。

【可攜式（Portable）特性】
* 100% 免安裝環境：內附乾淨的 Node.js Runtime，目標電腦完全不需要安裝任何程式。
* 隨身碟隨插即用：可將此資料夾整包放進 USB 隨身碟，插上任意 Windows 電腦皆可直接執行。
* 資料完全持久化：所有設定（AI 金鑰、排程時間、SMTP 寄信參數）、爬取的情資與 AI 研判快取，
  均即時保存在本資料夾內的 data/ 目錄中，資料備份只要複製此資料夾即可，絕對不會遺失。

【常見問題】
Q: 打開時提示連接埠 3000 已被佔用？
A: 表示您已經啟動了一份觀測站，可以直接在瀏覽器輸入 http://localhost:3000/ 即可訪問。
==================================================================
`, 'utf8');

// 7. 壓成 ZIP 壓縮檔
console.log('\n[7/7] 正在打包產生 ZIP 壓縮檔...');
const zipFile = path.join(RELEASE_DIR, '生活資安觀測站-便攜版.zip');
if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);

try {
    // 使用 PowerShell 內建 Compress-Archive 快速封裝
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${BUNDLE_DIR}' -DestinationPath '${zipFile}' -Force"`, { stdio: 'inherit' });
    const zipSizeMB = (fs.statSync(zipFile).size / 1024 / 1024).toFixed(1);
    console.log(`\n🎉 封裝完成！壓縮檔位於: ${zipFile} (${zipSizeMB} MB)`);
} catch (e) {
    console.warn('ZIP 壓縮失敗，但便攜資料夾已就緒:', e.message);
}

console.log('\n================================================================');
console.log(`✅ 便攜版資料夾已輸出至: ${BUNDLE_DIR}`);
console.log('================================================================');
