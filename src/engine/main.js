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
  { id: 'settings-material', label: '資料庫中心', icon: 'database', showSidebar: true, showTop: false, isEnabled: true }, // 💡 改名為資料庫中心
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
    let updatePayload = {};
    
    if (data.statuses) AppState.setStatuses(data.statuses);
    
    // 1. 導覽列遷移
    if (data.nav_config && Array.isArray(data.nav_config)) {
      let configUpdated = false;
      const migratedConfig = data.nav_config.map(item => {
        if (item.id === 'admin-data') {
          configUpdated = true;
          return null; 
        }
        // 如果舊配置中還是「物料管理」，自動改名為「資料庫中心」
        if (item.id === 'settings-material' && item.label === '物料管理') {
          item.label = '資料庫中心';
          item.icon = 'database';
          configUpdated = true;
        }
        return item;
      }).filter(Boolean);

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
        updatePayload.nav_config = migratedConfig;
        needSave = true;
      }
      AppState.setNavConfig(data.nav_config);
    } else {
      AppState.setNavConfig(defaultNavConfig);
      updatePayload.nav_config = defaultNavConfig;
      needSave = true;
    }

    // 2. 💡 低程式碼資料庫無損遷移
    if (!data.custom_databases) {
      const migratedDbs = [];
      
      // 遷移供應商
      if (Array.isArray(data.suppliers) && data.suppliers.length > 0) {
        migratedDbs.push({
          id: 'db_suppliers',
          name: '外發供應商',
          fields: data.supplier_schema || [],
          items: data.suppliers
        });
      } else {
        migratedDbs.push({ id: 'db_suppliers', name: '外發供應商', fields: [], items: [] });
      }

      // 遷移物料
      if (Array.isArray(data.materials) && data.materials.length > 0) {
        migratedDbs.push({
          id: 'db_materials',
          name: '物料資料',
          fields: data.material_schema || [],
          items: data.materials
        });
      } else {
        migratedDbs.push({ id: 'db_materials', name: '物料資料', fields: [], items: [] });
      }

      // 遷移銷售員對照表 (轉為資料庫形式)
      if (Array.isArray(data.sales_mapping) && data.sales_mapping.length > 0) {
        // 將 { name, aliases } 轉為 items 結構
        const salesItems = data.sales_mapping.map((sm, i) => ({
          id: 'sm_' + i,
          name: sm.name,
          data: { aliases: (sm.aliases || []).join(', ') }
        }));
        migratedDbs.push({
          id: 'db_sales',
          name: '銷售員對照表',
          fields: [{ key: 'aliases', label: '別名 (逗號隔開)', type: 'string' }],
          items: salesItems
        });
      } else {
        migratedDbs.push({ id: 'db_sales', name: '銷售員對照表', fields: [{ key: 'aliases', label: '別名 (逗號隔開)', type: 'string' }], items: [] });
      }

      updatePayload.custom_databases = migratedDbs;
      needSave = true;
      
      // 注意：我們不刪除舊的 data.suppliers, data.materials，確保資料 100% 安全
    }

    if (needSave) {
      try {
        await updateDocument('settings', 'main', updatePayload);
      } catch (err) {
        console.warn('無法儲存預設或遷移配置', err);
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
V: 1793080000
W: UPGRADE-007
*/