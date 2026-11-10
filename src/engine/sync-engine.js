import * as XLSX from 'xlsx';
import { getDocument } from '../db/read.js';
import { updateDocument, setDocument } from '../db/write.js';
import { parseWorkbook } from '../domain/parser.js';
import { updateWorkbookState, saveWorkbookToFile } from '../domain/excel-writer.js';
import { AppState } from '../config/state.js';
import { showToast } from '../ui/toast.js';

// 同步引擎狀態
let fileHandle = null;
let selectedSheets = [];
let isSyncing = false;
let lastSyncedTime = 0;
let syncInterval = null;
let writeBackTimer = null;

let currentState = { isBound: false, fileName: '', sheets: [] };
let stateListeners = [];

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

export function onSyncStateChange(callback) {
  stateListeners.push(callback);
  callback(currentState);
}

function notifyStateChange() {
  stateListeners.forEach(cb => cb(currentState));
}

export async function bindExcel() {
  console.log('[Bind Excel] 點擊綁定按鈕');
  
  if (!('showOpenFilePicker' in window)) {
    showToast('您的瀏覽器不支援此功能，請使用 Chrome 或 Edge', 'error');
    return;
  }

  try {
    console.log('[Bind Excel] 準備開啟檔案選擇器');
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'Excel 檔案',
        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/vnd.ms-excel': ['.xls'] }
      }],
      multiple: false
    });

    if (!handle) {
      console.log('[Bind Excel] 未選擇檔案');
      return;
    }

    console.log('[Bind Excel] 使用者已選擇檔案', handle.name);
    
    // 1. 請求權限
    showToast('正在請求讀寫權限，請點擊瀏覽器提示的「允許」', 'info');
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    
    if (permission !== 'granted') {
      showToast('未獲得讀寫權限，請重新綁定並點擊「允許」', 'error');
      return;
    }

    // 2. 讀取檔案
    showToast('正在讀取 Excel 檔案，請稍候', 'info');
    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    
    // 3. 解析 Excel
    const workbook = XLSX.read(buffer, { type: 'array' });

    // 4. 彈出分頁選擇視窗
    showSheetSelectionModal(handle, workbook.SheetNames);

  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[Bind Excel] 使用者取消選擇');
      return;
    }
    console.error('[Bind Excel Error]', err);
    showToast(`綁定失敗: ${err.message}。請確認 Excel 檔案是否已關閉。`, 'error');
  }
}

// 原生 DOM 實作分頁選擇視窗，避免依賴 openModal 載入失敗
function showSheetSelectionModal(handle, sheetNames) {
  console.log('[Bind Excel] 準備彈出分頁視窗', sheetNames);
  
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4';
  
  const modal = document.createElement('div');
  modal.className = 'bg-white border border-slate-100 shadow-soft rounded-[20px] w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden';
  
  modal.innerHTML = `
    <div class="flex justify-between items-center p-5 border-b border-slate-100 flex-shrink-0">
      <h3 class="text-lg font-bold text-slate-900">選擇同步分頁</h3>
      <button id="close-sheet-modal" class="text-slate-400 hover:text-slate-600">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <div class="p-5 text-slate-600 overflow-y-auto flex-1">
      <p class="text-sm text-slate-600 mb-4">請勾選要與網頁同步的工單分頁：</p>
      <div class="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
        ${sheetNames.map(name => `
          <label class="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:border-brand transition-colors">
            <input type="checkbox" class="sheet-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${name}" ${selectedSheets.includes(name) ? 'checked' : ''}>
            <span class="font-medium text-slate-700">${name}</span>
          </label>
        `).join('')}
      </div>
    </div>
    <div class="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
      <button id="cancel-sheet-modal" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
      <button id="confirm-sheet-modal" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">確認綁定</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeModal = () => {
    overlay.remove();
  };

  document.getElementById('close-sheet-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-sheet-modal').addEventListener('click', closeModal);

  document.getElementById('confirm-sheet-modal').addEventListener('click', async () => {
    const checked = Array.from(modal.querySelectorAll('.sheet-checkbox:checked')).map(cb => cb.value);
    if (checked.length === 0) {
      showToast('請至少選擇一個分頁', 'error');
      return;
    }

    fileHandle = handle;
    selectedSheets = checked;
    
    await idb.set('excel_handle', handle);
    localStorage.setItem('excel_selected_sheets', JSON.stringify(selectedSheets));
    
    closeModal();
    
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
    // 忽略輪詢錯誤
  }
}

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
    
    try {
      const s = await getDocument('settings', 'main');
      if (s) { 
        salesMapping = s.sales_mapping || []; 
        statuses = s.statuses || statuses; 
        schema = s.schema || []; 
        routeTemplates = s.route_templates || [];
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
V: 1794186200
W: UPGRADE-009
═══ */