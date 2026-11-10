import * as XLSX from 'xlsx';
import { getDocument } from '../db/read.js';
import { updateDocument, setDocument } from '../db/write.js';
import { parseWorkbook } from '../domain/parser.js';
import { updateWorkbookState, downloadWorkbook } from '../domain/excel-writer.js';
import { AppState } from '../config/state.js';
import { showToast } from '../ui/toast.js';

// 同步引擎狀態
let directoryHandle = null;
let targetFileHandle = null;
let targetFileName = '';
let selectedSheets = [];
let isSyncing = false;
let lastSyncedTime = 0;
let syncInterval = null;

let currentState = { isBound: false, fileName: '', sheets: [] };
let stateListeners = [];

// 簡單的 IndexedDB 封裝
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
  if (!('showDirectoryPicker' in window)) return;

  try {
    const dirHandle = await idb.get('dir_handle');
    const configStr = localStorage.getItem('excel_sync_config');
    
    if (dirHandle && configStr) {
      const config = JSON.parse(configStr);
      const permission = await dirHandle.queryPermission({ mode: 'read' });
      
      if (permission === 'granted') {
        directoryHandle = dirHandle;
        targetFileName = config.fileName;
        selectedSheets = config.sheets;
        
        try {
          targetFileHandle = await directoryHandle.getFileHandle(targetFileName);
          currentState = { isBound: true, fileName: targetFileName, sheets: selectedSheets };
          notifyStateChange();
          await syncFromExcel();
          startPolling();
        } catch (e) {
          console.warn('找不到原本綁定的檔案', e);
        }
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

export async function bindFolder() {
  console.log('[Bind Folder] 點擊綁定按鈕');
  
  if (!('showDirectoryPicker' in window)) {
    showToast('您的瀏覽器不支援此功能，請使用 Chrome 或 Edge', 'error');
    return;
  }

  try {
    // 請求資料夾讀取權限
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    if (!dirHandle) return;

    console.log('[Bind Folder] 使用者已選擇資料夾', dirHandle.name);
    const excelFiles = [];

    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && (entry.name.endsWith('.xlsx') || entry.name.endsWith('.xls'))) {
        excelFiles.push(entry);
      }
    }

    if (excelFiles.length === 0) {
      showToast('該資料夾內沒有 Excel 檔案', 'error');
      return;
    }

    // 顯示檔案選擇與分頁勾選 UI
    showSetupModal(dirHandle, excelFiles);

  } catch (err) {
    console.error('[Bind Folder Error]', err);
    if (err.name === 'AbortError') {
      showToast('已取消選擇資料夾', 'info');
      return;
    }
    showToast(`綁定失敗: ${err.message}`, 'error');
  }
}

// 原生 UI：選擇 Excel 檔案與分頁
function showSetupModal(dirHandle, excelFiles) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4';
  
  const modal = document.createElement('div');
  modal.className = 'bg-white border border-slate-100 shadow-soft rounded-[20px] w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden';
  
  modal.innerHTML = `
    <div class="flex justify-between items-center p-5 border-b border-slate-100 flex-shrink-0">
      <h3 class="text-lg font-bold text-slate-900">設定同步檔案與分頁</h3>
      <button id="close-setup-modal" class="text-slate-400 hover:text-slate-600">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <div class="p-5 text-slate-600 overflow-y-auto flex-1">
      <div class="flex flex-col gap-2 mb-6">
        <label class="text-sm font-bold text-slate-800">1. 選擇要同步的 Excel 檔案</label>
        <select id="file-select" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none">
          ${excelFiles.map(f => `<option value="${f.name}">${f.name}</option>`).join('')}
        </select>
      </div>
      
      <div class="flex flex-col gap-2">
        <label class="text-sm font-bold text-slate-800">2. 勾選要讀取的工單分頁</label>
        <div id="sheet-list-container" class="flex flex-col gap-2 max-h-[250px] overflow-y-auto p-1">
          <div class="text-sm text-slate-400 text-center py-4">請先在上方選擇檔案</div>
        </div>
      </div>
    </div>
    <div class="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
      <button id="cancel-setup-modal" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
      <button id="confirm-setup-modal" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">確認綁定</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const fileSelect = document.getElementById('file-select');
  const sheetListContainer = document.getElementById('sheet-list-container');
  let currentSheetNames = [];

  const loadSheets = async (fileName) => {
    sheetListContainer.innerHTML = '<div class="text-sm text-slate-400 text-center py-4">讀取中</div>';
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      currentSheetNames = workbook.SheetNames;
      
      sheetListContainer.innerHTML = currentSheetNames.map(name => `
        <label class="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:border-brand transition-colors">
          <input type="checkbox" class="sheet-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${name}" checked>
          <span class="font-medium text-slate-700">${name}</span>
        </label>
      `).join('');
    } catch (err) {
      sheetListContainer.innerHTML = `<div class="text-sm text-rose-500 text-center py-4">讀取失敗：請確認檔案是否被鎖定</div>`;
    }
  };

  fileSelect.addEventListener('change', (e) => loadSheets(e.target.value));
  // 初始載入第一個檔案
  loadSheets(excelFiles[0].name);

  const closeModal = () => overlay.remove();
  document.getElementById('close-setup-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-setup-modal').addEventListener('click', closeModal);

  document.getElementById('confirm-setup-modal').addEventListener('click', async () => {
    const targetFile = fileSelect.value;
    const checked = Array.from(modal.querySelectorAll('.sheet-checkbox:checked')).map(cb => cb.value);
    
    if (checked.length === 0) {
      showToast('請至少選擇一個分頁', 'error');
      return;
    }

    directoryHandle = dirHandle;
    targetFileName = targetFile;
    selectedSheets = checked;
    
    try {
      targetFileHandle = await directoryHandle.getFileHandle(targetFileName);
      await idb.set('dir_handle', directoryHandle);
      localStorage.setItem('excel_sync_config', JSON.stringify({
        fileName: targetFileName,
        sheets: selectedSheets
      }));
      
      closeModal();
      
      currentState = { isBound: true, fileName: targetFileName, sheets: selectedSheets };
      notifyStateChange();
      
      showToast('綁定成功，開始同步資料', 'success');
      
      await syncFromExcel();
      startPolling();
    } catch (err) {
      showToast('綁定失敗，請重試', 'error');
    }
  });
}

function startPolling() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => checkForUpdates(), 5000);
}

async function checkForUpdates() {
  if (!targetFileHandle || isSyncing) return;
  try {
    const file = await targetFileHandle.getFile();
    if (file.lastModified > lastSyncedTime + 1000) {
      await syncFromExcel();
    }
  } catch (err) {
    // 忽略輪詢錯誤
  }
}

export async function syncFromExcel() {
  if (!targetFileHandle || isSyncing) return;
  isSyncing = true;

  try {
    const file = await targetFileHandle.getFile();
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
    // 這裡不跳 Toast，避免每 5 秒干擾使用者
  } finally {
    isSyncing = false;
  }
}

/**
 * 下載包含最新網頁狀態的 Excel
 */
export async function downloadLatestExcel() {
  if (!targetFileHandle) {
    showToast('請先綁定資料夾與 Excel 檔案', 'error');
    return;
  }

  try {
    const file = await targetFileHandle.getFile();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    // 取得所有工單最新資料
    const { getCollection } = await import('../db/read.js');
    const allOrders = await getCollection('work_orders');

    // 更新 Workbook
    const updatedWorkbook = updateWorkbookState(workbook, selectedSheets, allOrders);

    // 觸發下載
    const downloadName = targetFileName.replace(/\.(xlsx|xls)$/i, '_已同步.xlsx');
    downloadWorkbook(updatedWorkbook, downloadName);
    
    showToast('已下載最新進度，請覆蓋原檔', 'success');
  } catch (err) {
    console.error('[Download Error]', err);
    showToast('下載失敗，請檢查檔案是否被鎖定', 'error');
  }
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/engine/sync-engine.js
V: 1794186900
W: UPGRADE-009
═══ */