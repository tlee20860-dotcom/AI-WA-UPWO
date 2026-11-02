import * as XLSX from 'xlsx';
import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { setDocument, deleteDocument, updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { exportToExcel, exportToPDF } from '../lib/io.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderOrderView } from '../ui/order-view.js';
import { openOrderModal } from '../ui/order-detail-modal.js';
import { parseExcelData } from '../domain/parser.js';
import { checkDiff } from '../domain/data-diff.js';
import { createIcons, Download, FileText, Plus, Upload, RefreshCw } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let schema = [];
let viewConfig = {};
let route_templates = [];
let currentCategory = 'ALL';
let currentSettings = null;
let diffFields = [];

// 自動同步相關變數
let autoSyncInterval = null;
let directoryHandle = null;
let isSyncing = false;

export default {
  async render() {
    if (!AppState.getUser()) return;

    try {
      currentSettings = await getDocument('settings', 'main');
      if (currentSettings) {
        schema = currentSettings.schema || [];
        viewConfig = currentSettings.view_configs || {};
        route_templates = currentSettings.route_templates || [];
        diffFields = currentSettings.diff_fields || [];
      }
    } catch (err) {}

    const isSupported = 'showDirectoryPicker' in window;

    renderPageLayout({
      title: '管理總表',
      subtitle: '所有工單的狀態、時間與流程追蹤列表',
      headerActions: `
        <div class="flex flex-wrap items-center gap-2">
          ${isSupported ? `
            <button id="btn-auto-sync" class="bg-white text-brand border border-brand/30 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-brand/5 flex items-center gap-2 shadow-sm transition-colors">
              <i data-lucide="refresh-cw" class="w-4 h-4"></i> 自動同步
            </button>
          ` : ''}
          <button id="btn-import-excel" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
            <i data-lucide="upload" class="w-4 h-4"></i> 匯入
          </button>
          <input type="file" id="excel-import-input" accept=".xlsx, .xls" class="hidden">
          <button id="btn-new-order" class="bg-brand text-white border border-brand px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-brand-hover flex items-center gap-2 shadow-sm transition-colors">
            <i data-lucide="plus" class="w-4 h-4"></i> 新增工單
          </button>
          <button id="btn-export-excel" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
            <i data-lucide="download" class="w-4 h-4"></i> Excel
          </button>
          <button id="btn-export-pdf" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
            <i data-lucide="file-text" class="w-4 h-4"></i> PDF
          </button>
        </div>
      `,
      controls: `
        <div class="flex items-center gap-2 mb-4">
          <span class="text-sm font-medium text-slate-600">類別：</span>
          <select id="filter-category" class="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none shadow-sm min-w-[120px]"></select>
        </div>
      `,
      listContainerId: 'table-container'
    });

    // 綁定匯出
    document.getElementById('btn-export-excel')?.addEventListener('click', () => this.handleExport('excel'));
    document.getElementById('btn-export-pdf')?.addEventListener('click', () => this.handleExport('pdf'));
    
    // 綁定篩選
    document.getElementById('filter-category')?.addEventListener('change', (e) => {
      currentCategory = e.target.value;
      this.updateUI();
    });

    // 綁定新增工單
    document.getElementById('btn-new-order')?.addEventListener('click', () => {
      openOrderModal({ 
        orderId: null, 
        currentSettings: currentSettings,
        onSaved: () => this.updateUI() 
      });
    });

    // 綁定匯入
    document.getElementById('btn-import-excel')?.addEventListener('click', () => document.getElementById('excel-import-input').click());
    document.getElementById('excel-import-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.processExcelFile(file);
      e.target.value = '';
    });

    // 綁定自動同步
    document.getElementById('btn-auto-sync')?.addEventListener('click', () => this.setupAutoSync());
    window.addEventListener('focus', this.checkForUpdates.bind(this));

    // 監聽工單資料
    window.addEventListener('refresh-table', this.updateUI.bind(this));
    
    // 監聽系統設定（當新增流程或修改視圖配置時刷新）
    window.addEventListener('settings-updated', async () => {
      try {
        const settingsDoc = await getDocument('settings', 'main');
        if (settingsDoc) {
          currentSettings = settingsDoc;
          schema = settingsDoc.schema || [];
          viewConfig = settingsDoc.view_configs || {};
          route_templates = settingsDoc.route_templates || [];
          diffFields = settingsDoc.diff_fields || [];
          this.updateUI();
        }
      } catch (err) {}
    });

    createIcons({ icons: { Download, FileText, Plus, Upload, RefreshCw }, attrs: { class: 'w-4 h-4' } });

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
    const catSelect = document.getElementById('filter-category');
    if (catSelect) {
      const cats = Array.from(new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他'))).sort();
      catSelect.innerHTML = `<option value="ALL">全部類別</option>` + cats.map(c => `<option value="${c}" ${c === currentCategory ? 'selected' : ''}>${c}</option>`).join('');
    }

    let filtered = currentOrders;
    if (currentCategory !== 'ALL') {
      filtered = filtered.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === currentCategory);
    }

    // 依使用者設定的順序對齊欄位
    let visibleFields = (viewConfig['table'] || []).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    // 強制插入「製程路線圖」欄位（若不存在）
    if (!visibleFields.some(f => f.key === 'route_select')) {
      visibleFields.unshift({ key: 'route_select', label: '製程路線圖', isVisible: true });
    }

    renderOrderView({
      containerId: 'table-container',
      orders: filtered,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'table',
      route_templates: route_templates,
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

  handleExport(type) {
    if (currentOrders.length === 0) return showToast('無資料可匯出', 'info');
    const statuses = AppState.getStatuses() || [];
    try {
      if (type === 'excel') exportToExcel(currentOrders, statuses, '工單總表', schema, viewConfig['export']);
      else exportToPDF(currentOrders, statuses, '工單總表', schema);
      showToast('匯出成功', 'success');
    } catch (err) {
      console.error(err);
      showToast('匯出失敗', 'error');
    }
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

      let syncTimestamps = {};
      try {
        const stored = localStorage.getItem('excel_sync_timestamps');
        if (stored) syncTimestamps = JSON.parse(stored);
      } catch (e) {}

      let filesToSync = [];

      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file' && (entry.name.endsWith('.xlsx') || entry.name.endsWith('.xls'))) {
          const file = await entry.getFile();
          const lastModified = file.lastModified;
          const lastSynced = syncTimestamps[file.name] || 0;

          if (lastModified > lastSynced) {
            filesToSync.push(file);
          }
        }
      }

      if (filesToSync.length > 0) {
        filesToSync.sort((a, b) => a.lastModified - b.lastModified);
        console.log(`[Auto Sync] 發現 ${filesToSync.length} 個更新檔案準備匯入`);

        for (const file of filesToSync) {
          await this.processExcelFile(file, true);
          syncTimestamps[file.name] = file.lastModified;
        }
        
        localStorage.setItem('excel_sync_timestamps', JSON.stringify(syncTimestamps));
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
    
    const btn = document.getElementById('btn-auto-sync');
    if (btn) {
      btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4"></i> 自動同步`;
      btn.classList.remove('bg-brand/10');
      createIcons({ icons: { RefreshCw }, attrs: { class: 'w-4 h-4' } });
    }
  },

  async processExcelFile(file, isAuto = false) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
          const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
          
          if (jsonData.length === 0) {
            if (!isAuto) showToast('無資料', 'error');
            resolve();
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
                  uploadDate: order.uploadDate,
                  data: order.data 
                });
                updated++;
              }
            } else {
              const orderCategory = String(order.data.category || '其他').toUpperCase().trim();
              let matchedTemplate = routeTemplates.find(t => {
                if (t.categories && Array.isArray(t.categories) && t.categories.length > 0) {
                  return t.categories.map(c => String(c).toUpperCase().trim()).includes(orderCategory);
                }
                if (typeof t.category === 'string' && t.category.trim() !== '') {
                  return t.category.toUpperCase().trim() === orderCategory;
                }
                return false;
              });
              
              if (!matchedTemplate) {
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
          if (added > 0 || updated > 0 || diffCount > 0) {
            msg += ` 新增 ${added}，更新 ${updated}`;
            if (diffCount > 0) msg += `，比對不符 ${diffCount}`;
            showToast(msg, 'success');
          }
          
          resolve();
          
        } catch (error) {
          console.error('[Import Error]', error);
          if (!isAuto) showToast(`失敗: ${error.message}`, 'error');
          resolve();
        }
      };
      reader.readAsArrayBuffer(file);
    });
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    this.stopAutoSync();
    window.removeEventListener('focus', this.checkForUpdates.bind(this));
    window.removeEventListener('refresh-table', this.updateUI.bind(this));
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/*
F: AI-WA-UPWO/src/pages/table.js
V: 1793052000
W: UPGRADE-007
*/