import * as XLSX from 'xlsx';
import { getDocument } from '../db/read.js';
import { updateDocument, setDocument } from '../db/write.js';
import { parseWorkbook } from '../domain/parser.js';
import { updateWorkbookState, saveWorkbookToFile } from '../domain/excel-writer.js';
import { AppState } from '../config/state.js';
import { showToast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { createIcons, Link, RefreshCw } from 'lucide';

// 同步引擎狀態
let fileHandle = null;
let selectedSheets = [];
let isSyncing = false;
let lastSyncedTime = 0;
let syncInterval = null;
let writeBackTimer = null;

// 提供給外部監聽的狀態
let currentState = { isBound: false, fileName: '', sheets: [] };
let stateListeners = [];

// IndexedDB 封裝 (用於儲存 FileSystemFileHandle)
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

/**
 * 初始化同步引擎 (在 main.js 中呼叫)
 */
export async function initSyncEngine() {
  if (!('showOpenFilePicker' in window)) return;

  try {
    const handle = await idb.get('excel_handle');
    const sheetsStr = localStorage.getItem('excel_selected_sheets');
    
    if (handle && sheetsStr) {
      fileHandle = handle;
      selectedSheets = JSON.parse(sheetsStr);
      
      const permission = await fileHandle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        currentState = { isBound: true, fileName: fileHandle.name, sheets: selectedSheets };
        notifyStateChange();
        await syncFromExcel();
        startPolling();
      }
    }
  } catch (err) {
    console.warn('[Sync Engine] 恢復綁定失敗', err);
  }
}

/**
 * 註冊狀態監聽器 (供 UI 更新按鈕狀態)
 */
export function onSyncStateChange(callback) {
  stateListeners.push(callback);
  // 立即回傳當前狀態
  callback(currentState);
}

function notifyStateChange() {
  stateListeners.forEach(cb => cb(currentState));
}

/**
 * 綁定 Excel 檔案 (觸發檔案選擇器與分頁勾選)
 */
export async function bindExcel() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'Excel 檔案',
        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] }
      }],
      multiple: false
    });

    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      showToast('需要讀寫權限才能進行雙向同步', 'error');
      return;
    }

    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    showSheetSelectionModal(handle, workbook.SheetNames);

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('[Bind Excel Error]', err);
    showToast('綁定失敗', 'error');
  }
}

function showSheetSelectionModal(handle, sheetNames) {
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
    close();
  });

  element.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
    const checked = Array.from(element.querySelectorAll('.sheet-checkbox:checked')).map(cb => cb.value);
    if (checked.length === 0) {
      showToast('請至少選擇一個分頁', 'error');
      return;
    }

    fileHandle = handle;
    selectedSheets = checked;
    
    await idb.set('excel_handle', handle);
    localStorage.setItem('excel_selected_sheets', JSON.stringify(selectedSheets));
    
    close();
    
    currentState = { isBound: true, fileName: fileHandle.name, sheets: selectedSheets };
    notifyStateChange();
    
    showToast('綁定成功，開始同步資料', 'success');
    
    await syncFromExcel();
    startPolling();
  });
}

function startPolling() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => checkForUpdates(), 5000);
}

function stopPolling() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

async function checkForUpdates() {
  if (!fileHandle || isSyncing) return;
  try {
    const permission = await fileHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') return;

    const file = await fileHandle.getFile();
    if (file.lastModified > lastSyncedTime + 1000) {
      await syncFromExcel();
    }
  } catch (err) {
    // 忽略輪詢錯誤（例如檔案被短暫鎖定）
  }
}

/**
 * 從 Excel 讀取資料並同步到網頁
 */
export async function syncFromExcel() {
  if (!fileHandle || isSyncing) return;
  isSyncing = true;

  try {
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    lastSyncedTime = file.lastModified;

    let salesMapping = [], statuses = AppState.getStatuses() || ['排產中'];
    let schema = [];
    let routeTemplates = [];
    let diffFields = [];
    
    try {
      const s = await getDocument('settings', 'main');
      if (s) { 
        salesMapping = s.sales_mapping || []; 
        statuses = s.statuses || statuses; 
        schema = s.schema || []; 
        routeTemplates = s.route_templates || [];
        diffFields = s.diff_fields || [];
      }
    } catch (err) {}

    const parsed = parseWorkbook(workbook, selectedSheets, salesMapping, statuses[0], schema);
    let added = 0, updated = 0;

    for (const order of parsed) {
      const existing = await getDocument('work_orders', order.id);
      if (existing) {
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
}

/**
 * 當網頁資料變更時，觸發寫回 Excel
 */
export function triggerWriteBack(currentData) {
  if (!fileHandle || selectedSheets.length === 0 || isSyncing) return;
  
  if (writeBackTimer) clearTimeout(writeBackTimer);
  
  writeBackTimer = setTimeout(async () => {
    isSyncing = true;
    try {
      const file = await fileHandle.getFile();
      
      if (file.lastModified > lastSyncedTime + 1000) {
        isSyncing = false;
        return;
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      const updatedWorkbook = updateWorkbookState(workbook, selectedSheets, currentData);
      await saveWorkbookToFile(fileHandle, updatedWorkbook);
      
      const newFile = await fileHandle.getFile();
      lastSyncedTime = newFile.lastModified;
      
    } catch (err) {
      console.warn('[Write Back Error]', err);
    } finally {
      isSyncing = false;
    }
  }, 1000);
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/engine/sync-engine.js
V: 1794185400
W: UPGRADE-009
═══ */