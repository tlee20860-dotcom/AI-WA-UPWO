import { initRouter } from './router.js';
import { getCollection, listenDocument } from '../db/read.js';
import { updateDocument } from '../db/write.js';
import { AppState } from '../config/state.js';
import '../ui/order-view-editor.js';

// 💡 更新：全新的四大設定中心預設配置
const defaultNavConfig = [
  { id: 'kanban', label: '工單進度表', icon: 'layout-dashboard', showSidebar: true, showTop: true, isEnabled: true },
  { id: 'search', label: '全域搜尋', icon: 'search', showSidebar: true, showTop: false, isEnabled: true },
  { id: 'table', label: '管理總表', icon: 'table', showSidebar: true, showTop: true, isEnabled: true },
  { id: 'overview', label: '總狀態', icon: 'pie-chart', showSidebar: true, showTop: true, isEnabled: true },
  { id: 'category', label: '類別視圖', icon: 'layers', showSidebar: true, showTop: true, isEnabled: true },
  { id: 'salesperson', label: '銷售員', icon: 'users', showSidebar: true, showTop: true, isEnabled: true },
  { id: 'area', label: '生產區域', icon: 'map-pin', showSidebar: true, showTop: false, isEnabled: true },
  { id: 'settings-material', label: '物料管理', icon: 'package', showSidebar: true, showTop: false, isEnabled: true },
  { id: 'settings', label: '生產管理設定', icon: 'settings', showSidebar: true, showTop: false, isEnabled: true },
  { id: 'settings-form', label: '工單管理設定', icon: 'sliders', showSidebar: true, showTop: false, isEnabled: true },
  { id: 'settings-system', label: '系統管理設定', icon: 'shield', showSidebar: true, showTop: false, isEnabled: true }
];

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app-root');
  
  if (!root) {
    console.error('[System Error] 找不到 #app-root 容器，無法啟動系統。');
    return;
  }

  const loadingEl = document.getElementById('app-loading');
  if (loadingEl) {
    loadingEl.classList.add('hidden');
  }

  try {
    initRouter();
    console.log('[System] UPGRADE-WO 系統啟動成功。');
    listenSettingsUpdates();
    fixLegacyDatesInBackground();
    registerServiceWorker();
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

function listenSettingsUpdates() {
  listenDocument('settings', 'main', async (data) => {
    if (!data) return;
    
    let needSave = false;
    
    if (data.statuses) AppState.setStatuses(data.statuses);
    
    if (data.nav_config && Array.isArray(data.nav_config)) {
      // 💡 自動遷移：如果用戶的舊配置中還有 data-entry 或 admin-data，自動轉換為新結構
      let configUpdated = false;
      const migratedConfig = data.nav_config.map(item => {
        if (item.id === 'admin-data') {
          configUpdated = true;
          return null; // 移除舊的 admin-data
        }
        return item;
      }).filter(Boolean);

      // 檢查是否缺少新的設定頁面
      const newSettingsPages = ['settings-material', 'settings-system'];
      newSettingsPages.forEach(id => {
        if (!migratedConfig.some(c => c.id === id)) {
          const defaultItem = defaultNavConfig.find(c => c.id === id);
          if (defaultItem) {
            migratedConfig.push(defaultItem);
            configUpdated = true;
          }
        }
      });

      if (configUpdated) {
        data.nav_config = migratedConfig;
        needSave = true;
      }

      AppState.setNavConfig(data.nav_config);
    } else {
      AppState.setNavConfig(defaultNavConfig);
      data.nav_config = defaultNavConfig;
      needSave = true;
    }

    if (needSave) {
      try {
        await updateDocument('settings', 'main', { nav_config: data.nav_config });
      } catch (err) {
        console.warn('無法儲存預設導覽配置', err);
      }
    }
    
    window.dispatchEvent(new Event('settings-updated'));
    window.dispatchEvent(new Event('nav-config-updated'));
  });
}

function formatDate(val) {
  if (!val) return "";
  if (typeof val === 'string' && (val.includes('-') || val.includes('/'))) {
    return val.trim();
  }
  const num = Number(val);
  if (!isNaN(num) && num > 20000 && num < 80000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  return String(val).trim();
}

async function fixLegacyDatesInBackground() {
  try {
    const userStr = sessionStorage.getItem('upgrade_user');
    if (!userStr) return; 
    
    const orders = await getCollection('work_orders');
    let fixCount = 0;

    for (const order of orders) {
      let needsUpdate = false;
      const updates = {};

      if (order.uploadDate && (typeof order.uploadDate === 'number' || (typeof order.uploadDate === 'string' && !order.uploadDate.includes('-')))) {
        const formatted = formatDate(order.uploadDate);
        if (formatted !== order.uploadDate && formatted !== '') {
          updates.uploadDate = formatted;
          needsUpdate = true;
        }
      }

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
      window.dispatchEvent(new Event('data:dates-fixed'));
    }

  } catch (error) {
    console.warn('[System Background Task] 自動修正日期時發生錯誤:', error);
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[PWA] ServiceWorker 註冊成功，範圍為:', registration.scope);
        })
        .catch((error) => {
          console.warn('[PWA] ServiceWorker 註冊失敗:', error);
        });
    });
  }
}

/*
F: AI-WA-UPWO/src/engine/main.js
V: 1793060000
W: UPGRADE-007
*/