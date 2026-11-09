import * as XLSX from 'xlsx';
import { AppState } from '../config/state.js';
import { listenCollection, getDocument, getCollection } from '../db/read.js';
import { setDocument, deleteDocument, updateDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { exportToExcel, exportToPDF } from '../lib/io.js';
import { showToast } from '../ui/toast.js';
import { openConfirm, openModal } from '../ui/modal.js';
import { renderOrderView } from '../ui/order-view.js';
import { parseExcelData, parseWorkbook } from '../domain/parser.js';
import { checkDiff } from '../domain/data-diff.js';
import { updateWorkbookState, saveWorkbookToFile } from '../domain/excel-writer.js';
import { createIcons, Download, FileText, Upload, RefreshCw, Link, Settings } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let schema = [];
let viewConfig = {};
let route_templates = [];
let currentCategory = 'ALL';
let currentSettings = null;
let diffFields = [];

// 雙向同步相關變數
let syncInterval = null;
let fileHandle = null;
let selectedSheets = [];
let isSyncing = false;
let lastSyncedTime = 0; // 避免寫回迴圈

// 簡單的 IndexedDB 封裝 (用於儲存 FileSystemFileHandle)
const idb = {
  get: (key) => new Promise((resolve) => {
    const req = indexedDB.open('AppDB', 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('handles');
    req.onsuccess = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('handles')) return resolve(null);
      const tx = db.transaction('handles', 'readonly');
      const getReq = tx.objectStore('handles').get(key);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  }),
  set: (key, val) => new Promise((resolve) => {
    const req = indexedDB.open('AppDB', 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('handles');
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(val, key);
      tx.oncomplete = () => resolve();
    };
  })
};

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

    const isSupported = 'showOpenFilePicker' in window;

    renderPageLayout({
      title: '管理總表',
      subtitle: '所有工單的狀態、時間與流程追蹤列表',
      headerActions: `
        <div class="flex flex-wrap items-center gap-2">
          ${isSupported ? `
            <button id="btn-bind-excel" class="bg-white text-brand border border-brand/30 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-brand/5 flex items-center gap-2 shadow-sm transition-colors">
              <i data-lucide="link" class="w-4 h-4"></i> 綁定 Excel
            </button>
          ` : ''}
          <button id="btn-import-excel" class="bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-[10px] text-sm font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm">
            <i data-lucide="upload" class="w-4 h-4"></i> 匯入
          </button>
          <input type="file" id="excel-import-input" accept=".xlsx, .xls" class="hidden">
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

    // 綁定手動匯入
    document.getElementById('btn-import-excel')?.addEventListener('click', () => document.getElementById('excel-import-input').click());
    document.getElementById('excel-import-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.processExcelFile(file);
      e.target.value = '';
    });

    // 綁定自動同步 (選擇檔案)
    document.getElementById('btn-bind-excel')?.addEventListener('click', () => this.setupFileBinding());

    window.addEventListener('focus', this.checkForUpdates.bind(this));
    window.addEventListener('refresh-table', this.updateUI.bind(this));
    
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

    createIcons({ icons: { Download, FileText, Upload, RefreshCw, Link, Settings }, attrs: { class: 'w-4 h-4' } });

    // 初始化時嘗試恢復綁定
    this.restoreFileBinding();

    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenCollection('work_orders', (orders) => {
      // 如果是背景寫回觸發的更新，不重複觸發寫回
      if (!isSyncing) {
        currentOrders = orders;
        this.updateUI();
        // 觸發寫回 Excel (如果已綁定)
        this.triggerWriteBack(orders);
      } else {
        currentOrders = orders;
        this.updateUI();
      }
    });
  },

  async restoreFileBinding() {
    if (!('showOpenFilePicker' in window)) return;

    try {
      const handle = await idb.get('excel_handle');
      const sheetsStr = localStorage.getItem('excel_selected_sheets');
      
      if (handle && sheetsStr) {
        fileHandle = handle;
        selectedSheets = JSON.parse(sheetsStr);
        
        // 檢查權限
        const permission = await fileHandle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          this.updateBindButtonState(true);
          // 重新讀取一次最新資料
          await this.syncFromExcel();
          // 啟動輪詢檢查
          this.startPolling();
        } else {
          this.updateBindButtonState(false);
        }
      }
    } catch (err) {
      console.warn('[Restore Binding Error]', err);
    }
  },

  updateBindButtonState(isBound) {
    const btn = document.getElementById('btn-bind-excel');
    if (!btn) return;
    if (isBound) {
      btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin-slow"></i> 已綁定：${fileHandle.name}`;
      btn.classList.add('bg-brand/5');
    } else {
      btn.innerHTML = `<i data-lucide="link" class="w-4 h-4"></i> 綁定 Excel`;
      btn.classList.remove('bg-brand/5');
    }
    createIcons({ icons: { Link, RefreshCw }, attrs: { class: 'w-4 h-4' } });
  },

  async setupFileBinding() {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Excel 檔案',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] }
        }],
        multiple: false
      });

      // 請求寫入權限
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        showToast('需要讀寫權限才能進行雙向同步', 'error');
        return;
      }

      fileHandle = handle;
      await idb.set('excel_handle', handle);

      // 讀取檔案以獲取分頁清單
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      this.showSheetSelectionModal(workbook.SheetNames);

    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[Bind Excel Error]', err);
      showToast('綁定失敗', 'error');
    }
  },

  showSheetSelectionModal(sheetNames) {
    const content = `
      <div class="flex flex-col gap-4">
        <p class="text-sm text-slate-600">請勾選要與網頁同步的工單分頁（系統會自動跳過沒有單號表頭的分頁）：</p>
        <div class="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
          ${sheetNames.map(name => `
            <label class="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:border-brand">
              <input type="checkbox" class="sheet-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${name}" ${selectedSheets.includes(name) ? 'checked' : ''}>
              <span class="font-medium text-slate-700">${name}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;

    const footer = `
      <div class="flex justify-end gap-3">
        <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
        <button id="modal-confirm-btn" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">確認綁定</button>
      </div>
    `;

    const { close, element } = openModal({ title: '選擇同步分頁', content, footer });

    element.querySelector('#modal-cancel-btn').addEventListener('click', () => {
      fileHandle = null;
      idb.set('excel_handle', null);
      close();
    });

    element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
      const checked = Array.from(element.querySelectorAll('.sheet-checkbox:checked')).map(cb => cb.value);
      if (checked.length === 0) {
        showToast('請至少選擇一個分頁', 'error');
        return;
      }

      selectedSheets = checked;
      localStorage.setItem('excel_selected_sheets', JSON.stringify(selectedSheets));
      
      close();
      this.updateBindButtonState(true);
      showToast('綁定成功，開始同步資料', 'success');
      
      await this.syncFromExcel();
      this.startPolling();
    });
  },

  startPolling() {
    if (syncInterval) clearInterval(syncInterval);
    // 每 5 秒檢查一次檔案是否有變更
    syncInterval = setInterval(() => this.checkForUpdates(), 5000);
  },

  stopPolling() {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  },

  async checkForUpdates() {
    if (!fileHandle || isSyncing) return;
    try {
      const permission = await fileHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') return;

      const file = await fileHandle.getFile();
      // 如果檔案修改時間大於上次同步時間（容許 1 秒誤差），則觸發讀取
      if (file.lastModified > lastSyncedTime + 1000) {
        await this.syncFromExcel();
      }
    } catch (err) {
      // 跳過輪詢錯誤（例如檔案被短暫鎖定）
    }
  },

  async syncFromExcel() {
    if (!fileHandle || isSyncing) return;
    isSyncing = true;

    try {
      const file = await fileHandle.getFile();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      
      lastSyncedTime = file.lastModified;

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

      const parsed = parseWorkbook(workbook, selectedSheets, salesMapping, statuses[0], schema);
      let added = 0, updated = 0, diffCount = 0;

      for (const order of parsed) {
        const existing = await getDocument('work_orders', order.id);
        if (existing) {
          // 檢查是否有實質變更，若無則不寫入資料庫（避免觸發無謂的寫回）
          const hasChanged = JSON.stringify(existing.data) !== JSON.stringify(order.data) ||
                             existing.status !== order.status ||
                             JSON.stringify(existing.route) !== JSON.stringify(order.route) ||
                             existing.area !== order.area;
                             
          if (hasChanged) {
            await updateDocument('work_orders', order.id, { 
              status: order.status,
              route: order.route,
              area: order.area,
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

      if (added > 0 || updated > 0) {
        showToast(`同步完成：新增 ${added}，更新 ${updated}`, 'success');
      }
    } catch (err) {
      console.error('[Sync From Excel Error]', err);
      showToast('讀取 Excel 失敗，請確認檔案是否被鎖定', 'error');
    } finally {
      isSyncing = false;
    }
  },

  async triggerWriteBack(currentData) {
    if (!fileHandle || selectedSheets.length === 0 || isSyncing) return;
    
    // 延遲 1 秒執行，避免短時間內大量寫入觸發多次
    if (this.writeBackTimer) clearTimeout(this.writeBackTimer);
    
    this.writeBackTimer = setTimeout(async () => {
      isSyncing = true;
      try {
        const file = await fileHandle.getFile();
        
        // 如果檔案在上次讀取後有被修改（例如使用者手動改了 Excel），先取消這次寫回
        if (file.lastModified > lastSyncedTime + 1000) {
          isSyncing = false;
          return;
        }

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });

        // 更新 Workbook 內容
        const updatedWorkbook = updateWorkbookState(workbook, selectedSheets, currentData);

        // 寫回檔案
        await saveWorkbookToFile(fileHandle, updatedWorkbook);
        
        // 更新時間戳記，防止被當作外部修改而觸發讀取迴圈
        const newFile = await fileHandle.getFile();
        lastSyncedTime = newFile.lastModified;
        
        console.log('[Write Back] Excel 已更新狀態');
        
      } catch (err) {
        console.warn('[Write Back Error]', err);
        // 若檔案被鎖定，會走到這裡，不跳 Toast 以免干擾
      } finally {
        isSyncing = false;
      }
    }, 1000);
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

    let visibleFields = (viewConfig['table'] || []).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

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

  processExcelFile(file) {
    // 保留手動匯入功能 (單次解析第一個分頁)
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
        
        if (jsonData.length === 0) {
          showToast('無資料', 'error');
          return;
        }
        showToast('正在解析資料', 'info');
        
        let salesMapping = [], statuses = AppState.getStatuses() || ['排產中'];
        try {
          const s = await getDocument('settings', 'main');
          if (s) { 
            salesMapping = s.sales_mapping || []; 
            statuses = s.statuses || statuses; 
          }
        } catch (err) {}

        const parsed = parseExcelData(jsonData[0], jsonData.slice(1), salesMapping, statuses[0], schema);
        let added = 0, updated = 0;

        for (const order of parsed) {
          const existing = await getDocument('work_orders', order.id);
          if (existing) {
             await updateDocument('work_orders', order.id, { 
              salesReps: order.salesReps, 
              uploadDate: order.uploadDate,
              data: order.data 
            });
            updated++;
          } else {
             await setDocument('work_orders', order.id, order);
            added++;
          }
        }
        showToast(`匯入完成！新增 ${added}，更新 ${updated}`, 'success');
      } catch (error) {
        showToast(`失敗: ${error.message}`, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    this.stopPolling();
    if (this.writeBackTimer) clearTimeout(this.writeBackTimer);
    window.removeEventListener('focus', this.checkForUpdates.bind(this));
    window.removeEventListener('refresh-table', this.updateUI.bind(this));
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/table.js
V: 1794185300
W: UPGRADE-009
═══ */