import { initRouter } from './router.js';

/**
 * 系統啟動入口
 * 負責等待 DOM 載入完成後，初始化路由
 */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app-root');
  
  if (!root) {
    console.error('[System Error] 找不到 #app-root 容器，無法啟動系統。');
    return;
  }

  // 隱藏初始載入動畫
  const loadingEl = document.getElementById('app-loading');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }

  try {
    // 啟動路由系統
    // 註：全域 createIcons 已移除，圖示由各頁面或佈局元件自行呼叫 createIcons 處理
    initRouter();
    
    console.log('[System] UPGRADE-WO 系統啟動成功。');
  } catch (error) {
    console.error('[System Error] 系統啟動失敗:', error);
    root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-bg text-slate-600">
        <div class="glass-card p-8 text-center max-w-md">
          <h2 class="text-xl font-bold text-rose-500 mb-2">系統啟動失敗</h2>
          <p class="text-sm">請檢查 Console 錯誤訊息，或重新整理頁面。</p>
        </div>
      </div>
    `;
  }
});

/* ═══ EOF ═══
F: AI-WA-UPWO/src/engine/main.js
V: 1792909601
W: UPGRADE-002
═══ */