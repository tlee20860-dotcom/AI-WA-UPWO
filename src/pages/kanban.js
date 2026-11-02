import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { updateDocument, setDocument, deleteDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderOrderView } from '../ui/order-view.js';
import { parseExcelData } from '../domain/parser.js';
import { checkDiff } from '../domain/data-diff.js';
import * as XLSX from 'xlsx';
import { createIcons, Upload, RefreshCw } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let currentCategory = 'ALL';
let schema = [];
let viewConfig = {};
let route_templates = [];
let settingsCategories = [];
let diffFields = [];

// 自動同步相關變數
let autoSyncInterval = null;
let directoryHandle = null;
let lastSyncTime = 0;
let isSyncing = false;

/**
 * 輔助函式：將可能是字串或陣列的 route 統一轉為陣列
 */
function normalizeRoute(route) {
  if (Array.isArray(route)) return route;
  if (typeof route === 'string') {
    if (route.includes(',')) return route.split(',').map(s => s.trim()).filter(Boolean);
    if (route.includes('→')) return route.split('→').map(s => s.trim()).filter(Boolean);
    return [route.trim()];
  }
  return [];
}

export default {
  async render() {
    if (!AppState.getUser()) return;

    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        schema = settingsDoc.schema || [];
        viewConfig = settingsDoc.view_configs || {};
        route_templates = settingsDoc.route_templates || [];
        settingsCategories = settingsDoc.categories || [];
        diffFields = settingsDoc.diff_fields || [];
      }
    } catch (err) {}

    const isSupported = 'showDirectoryPicker' in window;

    renderPageLayout({
      title: '生產進度控制台',
      subtitle: '即時追蹤工單狀態與生產進度',
      headerActions: `
        <div class="flex items-center gap-3">
          ${isSupported ? `
            <button id="btn-auto-sync" class="bg-white text-brand border border-brand/30 px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-brand/5 flex items-center gap-2 shadow-sm transition-colors">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> 自動同步
            </button>
          ` : ''}
          <button id="btn-import-excel" class="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
            <i data-lucide="upload" class="w-4 h-4"></i> 匯入
          </button>
          <input type="file" id="excel-import-input" accept=".xlsx, .xls" class="hidden">
        </div>
      `,
      controls: `
        <div id="category-tabs" class="flex flex-wrap gap-2 mb-4"></div>
      `,
      listContainerId: 'kanban-container'
    });

    document.getElementById('btn-import-excel')?.addEventListener('click', () => document.getElementById('excel-import-input').click());
    document.getElementById('excel-import-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.processExcelFile(file);
      e.target.value = '';
    });

    document.getElementById('btn-auto-sync')?.addEventListener('click', () => this.setupAutoSync());

    window.addEventListener('focus', this.checkForUpdates.bind(this));

    window.addEventListener('refresh-kanban', this.updateUI.bind(this));
    window.addEventListener('settings-updated', async () => {
      try {
        const settingsDoc = await getDocument('settings', 'main');
        if (settingsDoc) {
          schema = settingsDoc.schema || [];
          viewConfig = settingsDoc.view_configs || {};
          route_templates = settingsDoc.route_templates || [];
          settingsCategories = settingsDoc.categories || [];
          diffFields = settingsDoc.diff_fields || [];
          this.updateUI();
        }
      } catch (err) {}
    });
    
    createIcons({ icons: { Upload, RefreshCw }, attrs: { class: 'w-4 h-4' } });

    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.updateUI();
    });
  },

  updateUI() {
    const orderCats = Array.from(new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他')));
    const combinedCats = settingsCategories.concat(orderCats);
    const allCats = Array.from(new Set(combinedCats)).filter(c => c !== 'ALL').sort();

    const tabsContainer = document.getElementById('category-tabs');
    if (tabsContainer) {
      const tabs = ['ALL'].concat(allCats);
      tabsContainer.innerHTML = tabs.map(c => {
        const label = c === 'ALL' ? '全部類別' : c;
        const count = c === 'ALL' 
          ? currentOrders.length 
          : currentOrders.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === c).length;
        
        return `
          <button class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border ${c === currentCategory ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'}" data-cat="${c}">
            <span>${label}</span>
            <span class="text-xs px-1.5 py-0.5 rounded-md ${c === currentCategory ? 'bg-white/20' : 'bg-slate-100'}">${count}</span>
          </button>
        `;
      }).join('');

      tabsContainer.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentCategory = btn.dataset.cat; this.updateUI(); };
      });
    }

    let filtered = currentOrders;
    if (currentCategory !== 'ALL') {
      filtered = filtered.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === currentCategory);
    }

    const visibleFields = (viewConfig['kanban'] || []).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    renderOrderView({
      containerId: 'kanban-container',
      orders: filtered,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'kanban',
      route_templates: route_templates,
      groupBy: 'status',
      onAction: async (action, id, newStatus) => {
        if (action === 'delete') {
          if (await openConfirm({ title: '刪除', message: `確定刪除 ${id}？`, isDanger: true })) {
            await deleteDocument('work_orders', id);
            showToast('已刪除', 'success');
          }
        } else if (action === 'status_change') {
          if (newStatus) {
            await updateDocument('work_orders', id, { status: newStatus, statusUpdateDate: new Date().toISOString() });
            showToast('已更新生產進度', 'success');
          }
        }
      }
    });
  },

  async setupAutoSync() {
    if (!('showDirectoryPicker' in window)) {
      showToast('您的瀏覽器不支援自動同步功能，請改用手動匯入', 'error');
      return;
    }

    try {
      directoryHandle = await window.showDirectoryPicker({ mode: 'read' });
      showToast('已綁定資料夾，開始自動監聽更新', 'success');
      
      const btn = document.getElementById('btn-auto-sync');
      if (btn) {
        btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> 同步中...`;
        btn.classList.add('bg-brand/10');
        createIcons({ icons: { RefreshCw }, attrs: { class: 'w-4 h-4' } });
      }

      await this.checkForUpdates();

      if (autoSyncInterval) clearInterval(autoSyncInterval);
      autoSyncInterval = setInterval(() => this.checkForUpdates(), 2000);

    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[Auto Sync Error]', err);
      showToast('綁定資料夾失敗，請確認瀏覽器權限', 'error');
    }
  },

  async checkForUpdates() {
    if (!directoryHandle || isSyncing) return;

    try {
      const permission = await directoryHandle.queryPermission({ mode: 'read' });
      if (permission !== 'granted') {
        this.stopAutoSync();
        showToast('資料夾授權已失效，請重新點擊「自動同步」', 'error');
        return;
      }

      isSyncing = true;
      let latestFile = null;
      let latestTime = lastSyncTime;

      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file' && (entry.name.endsWith('.xlsx') || entry.name.endsWith('.xls'))) {
          const file = await entry.getFile();
          if (file.lastModified > latestTime) {
            latestTime = file.lastModified;
            latestFile = file;
          }
        }
      }

      if (latestFile) {
        console.log(`[Auto Sync] 發現更新檔案：${latestFile.name}`);
        await this.processExcelFile(latestFile, true);
        lastSyncTime = latestTime;
      }

    } catch (err) {
      console.error('[Auto Sync Check Error]', err);
    } finally {
      isSyncing = false;
    }
  },

  stopAutoSync() {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
    directoryHandle = null;
    lastSyncTime = 0;
    
    const btn = document.getElementById('btn-auto-sync');
    if (btn) {
      btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4"></i> 自動同步`;
      btn.classList.remove('bg-brand/10');
      createIcons({ icons: { RefreshCw }, attrs: { class: 'w-4 h-4' } });
    }
  },

  async processExcelFile(file, isAuto = false) {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        if (jsonData.length < 2) {
          if (!isAuto) showToast('無資料', 'error');
          return;
        }

        if (!isAuto) showToast('解析中...', 'info');
        
        let salesMapping = [], statuses = AppState.getStatuses() || ['排產中'];
        let routeTemplates = [];
        
        try {
          const s = await getDocument('settings', 'main');
          if (s) { 
            salesMapping = s.sales_mapping || []; 
            statuses = s.statuses || statuses; 
            schema = s.schema || schema; 
            routeTemplates = s.route_templates || [];
            diffFields = s.diff_fields || [];
          }
        } catch (err) {}

        const parsed = parseExcelData(jsonData[0], jsonData.slice(1), salesMapping, statuses[0], schema);
        let added = 0, updated = 0, diffCount = 0;

        for (const order of parsed) {
          const existing = await getDocument('work_orders', order.id);
          if (existing) {
            if (existing.source === 'manual') {
              const diffResult = checkDiff(existing, order, diffFields);
              if (diffResult) {
                await updateDocument('work_orders', order.id, { diff: diffResult });
                diffCount++;
              }
            } else {
              await updateDocument('work_orders', order.id, { 
                salesReps: order.salesReps, 
                data: order.data 
              });
              updated++;
            }
          } else {
            const orderCategory = String(order.data.category || '其他').toUpperCase().trim();
            let matchedTemplate = routeTemplates.find(t => {
              // 💡 修正：強化比對邏輯，去除空白並轉大寫
              if (t.categories && Array.isArray(t.categories) && t.categories.length > 0) {
                return t.categories.map(c => String(c).toUpperCase().trim()).includes(orderCategory);
              }
              if (typeof t.category === 'string' && t.category.trim() !== '') {
                return t.category.toUpperCase().trim() === orderCategory;
              }
              return false;
            });
            
            if (!matchedTemplate) {
              // Fallback 到沒有設定類別的通用模板
              matchedTemplate = routeTemplates.find(t => (!t.categories || t.categories.length === 0) && (!t.category || t.category.trim() === ''));
            }

            if (!order.route || order.route.length === 0) {
              if (matchedTemplate && matchedTemplate.steps && matchedTemplate.steps.length > 0) {
                order.route = matchedTemplate.steps.slice();
                order.status = matchedTemplate.steps[0];
              } else {
                order.route = statuses.slice();
                order.status = statuses[0];
              }
            }

            if (!order.source) order.source = 'excel';

            await setDocument('work_orders', order.id, order);
            added++;
          }
        }
        
        let msg = isAuto ? '自動同步完成！' : '匯入完成！';
        msg += ` 新增 ${added}，更新 ${updated}`;
        if (diffCount > 0) {
          msg += `，其中 ${diffCount} 筆與手動輸入資料不符`;
        }

        showToast(msg, 'success');
        
      } catch (error) {
        console.error('[Import Error]', error);
        if (!isAuto) showToast(`失敗: ${error.message}`, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    this.stopAutoSync();
    window.removeEventListener('focus', this.checkForUpdates.bind(this));
    window.removeEventListener('refresh-kanban', this.updateUI.bind(this));
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/*
F: AI-WA-UPWO/src/pages/kanban.js
V: 1793038000
W: UPGRADE-007
*/