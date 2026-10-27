import { initRouter } from './router.js';
import { createIcons } from 'lucide';

/**
 * 系統啟動入口
 * 負責等待 DOM 載入完成後，初始化路由與圖示
 */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app-root');
  
  if (!root) {
    console.error('[System Error] 找不到 #app-root 容器，無法啟動系統。');
    return;
  }

  // 顯示初始載入動畫 (可選，這裡假設 index.html 有預設的 loading 遮罩)
  const loadingEl = document.getElementById('app-loading');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }

  try {
    // 初始化 Lucide 圖示
    createIcons();

    // 啟動路由系統
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
F: src/engine/main.js
V: 1792903518
W: webapp-20261026-001#30
═══ */