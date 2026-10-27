import { initRouter } from './router.js';
import { getCollection, getDocument } from '../db/read.js';
import { updateDocument } from '../db/write.js';

/**
 * 系統啟動入口
 * 負責等待 DOM 載入完成後，初始化路由與背景任務
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
    initRouter();
    console.log('[System] UPGRADE-WO 系統啟動成功。');

    // 背景任務：自動修正歷史錯誤日期
    fixLegacyDatesInBackground();
    
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

/**
 * 將 Excel 日期序列號轉換為 YYYY-MM-DD 格式
 */
function formatDate(val) {
  if (!val) return "";
  if (typeof val === 'string' && (val.includes('-') || val.includes('/'))) {
    return val.trim();
  }
  const num = Number(val);
  if (!isNaN(num) && num > 20000 && num < 80000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!date.getTime || isNaN(date.getTime())) {
      const d = new Date((num - 25569) * 86400 * 1000);
      return d.toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
  }
  return String(val).trim();
}

/**
 * 背景自動修正歷史資料中的錯誤日期（例如 46300 轉為 YYYY-MM-DD）
 */
async function fixLegacyDatesInBackground() {
  try {
    // 檢查是否有管理員權限或已登入，避免未登入時報錯
    const userStr = sessionStorage.getItem('upgrade_user');
    if (!userStr) return;
    
    // 為了避免每次重整都掃描，可以存個標記在 localStorage，但這裡為了確保資料正確，每次啟動掃描
    const orders = await getCollection('work_orders');
    let fixCount = 0;

    for (const order of orders) {
      let needsUpdate = false;
      const updates = {};

      // 檢查 uploadDate
      if (order.uploadDate && typeof order.uploadDate === 'number' || (typeof order.uploadDate === 'string' && !order.uploadDate.includes('-'))) {
        const formatted = formatDate(order.uploadDate);
        if (formatted !== order.uploadDate && formatted !== '') {
          updates.uploadDate = formatted;
          needsUpdate = true;
        }
      }

      // 檢查 dueDate
      if (order.dueDate && (typeof order.dueDate === 'number' || (typeof order.dueDate === 'string' && !order.dueDate.includes('-')))) {
        const formatted = formatDate(order.dueDate);
        if (formatted !== order.dueDate && formatted !== '') {
          updates.dueDate = formatted;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await updateDocument('work_orders', order.id, updates);
        fixCount++;
      }
    }

    if (fixCount > 0) {
      console.log(`[System] 背景自動修正了 ${fixCount} 筆工單的日期格式。`);
      // 可選：觸發一個自訂事件讓當前頁面重新渲染
      window.dispatchEvent(new Event('data:dates-fixed'));
    }

  } catch (error) {
    // 在背景靜默處理，避免干擾使用者
    console.warn('[System Background Task] 自動修正日期時發生錯誤:', error);
  }
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/engine/main.js
V: 1792912800
W: UPGRADE-002
═══ */