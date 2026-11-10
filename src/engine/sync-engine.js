import * as XLSX from 'xlsx';
import { getDocument, getCollection } from '../db/read.js';
import { updateDocument, setDocument } from '../db/write.js';
import { parseWorkbook } from '../domain/parser.js';
import { updateWorkbookState, downloadWorkbook } from '../domain/excel-writer.js';
import { AppState } from '../config/state.js';
import { showToast } from '../ui/toast.js';

let currentFile = null;
let targetFileName = '';
let selectedSheets = [];
let targetMonth = '';
let isSyncing = false;

let currentState = { isBound: false, fileName: '', sheets: [] };
let stateListeners = [];

export function onSyncStateChange(callback) {
  stateListeners.push(callback);
  callback(currentState);
}

function notifyStateChange() {
  stateListeners.forEach(cb => cb(currentState));
}

export function initSyncEngine() {
  try {
    const configStr = localStorage.getItem('excel_sync_config');
    if (configStr) {
      const config = JSON.parse(configStr);
      targetFileName = config.fileName || '';
      selectedSheets = config.sheets || [];
      targetMonth = config.month || '';
      
      currentState = { isBound: true, fileName: targetFileName, sheets: selectedSheets };
      notifyStateChange();
    }
  } catch (err) {
    console.warn('[Sync Engine] 恢復設定失敗', err);
  }
}

// 新增：解除綁定功能
export function clearBinding() {
  currentFile = null;
  targetFileName = '';
  selectedSheets = [];
  targetMonth = '';
  localStorage.removeItem('excel_sync_config');
  currentState = { isBound: false, fileName: '', sheets: [] };
  notifyStateChange();
  showToast('已解除綁定，請重新上傳', 'success');
}

export function handleExcelUpload(file) {
  console.log('[Sync Engine] 收到上傳檔案', file.name);
  if (!file) return;

  if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
    showToast('請選擇 Excel 檔案 (.xlsx 或 .xls)', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const buffer = evt.target.result;
      const workbook = XLSX.read(buffer, { type: 'array' });
      
      // 只要檔案有選擇，一律跳出設定視窗，讓使用者重新確認分頁與月份
      showSetupModal(file.name, workbook.SheetNames, buffer);
    } catch (err) {
      console.error('[Sync Engine] 解析檔案失敗', err);
      showToast(`無法解析此 Excel 檔案: ${err.message}`, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function showSetupModal(fileName, sheetNames, buffer) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4';
  
  const modal = document.createElement('div');
  modal.className = 'bg-white border border-slate-100 shadow-soft rounded-[20px] w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden';
  
  modal.innerHTML = `
    <div class="flex justify-between items-center p-5 border-b border-slate-100 flex-shrink-0">
      <h3 class="text-lg font-bold text-slate-900">設定同步分頁與月份</h3>
      <button id="close-setup-modal" class="text-slate-400 hover:text-slate-600">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>
    <div class="p-5 text-slate-600 overflow-y-auto flex-1 flex flex-col gap-6">
      <p class="text-sm font-bold text-slate-800 mb-0">檔案：${fileName}</p>
      
      <div class="flex flex-col gap-2">
        <label class="text-sm font-bold text-slate-800">1. 選擇要讀取的工單分頁</label>
        <div class="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
          ${sheetNames.map(name => `
            <label class="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:border-brand transition-colors">
              <input type="checkbox" class="sheet-checkbox w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand" value="${name}" ${selectedSheets.includes(name) ? 'checked' : ''}>
              <span class="font-medium text-slate-700">${name}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-sm font-bold text-slate-800">2. 指定匯入月份（選填）</label>
        <input type="month" id="month-select" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand" value="${targetMonth}">
        <p class="text-xs text-slate-500">若留空，將匯入該分頁的所有月份資料。</p>
      </div>
    </div>
    <div class="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
      <button id="cancel-setup-modal" class="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">取消</button>
      <button id="confirm-setup-modal" class="px-4 py-2 rounded-xl text-sm font-medium text-white bg-brand hover:bg-brand-hover">確認並同步</button>
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();
  document.getElementById('close-setup-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-setup-modal').addEventListener('click', closeModal);

  document.getElementById('confirm-setup-modal').addEventListener('click', async () => {
    const checked = Array.from(modal.querySelectorAll('.sheet-checkbox:checked')).map(cb => cb.value);
    const selectedMonth = document.getElementById('month-select').value;
    
    if (checked.length === 0) {
      showToast('請至少選擇一個分頁', 'error');
      return;
    }

    targetFileName = fileName;
    selectedSheets = checked;
    targetMonth = selectedMonth;
    currentFile = buffer;
    
    localStorage.setItem('excel_sync_config', JSON.stringify({
      fileName: targetFileName,
      sheets: selectedSheets,
      month: targetMonth
    }));
    
    closeModal();
    
    currentState = { isBound: true, fileName: targetFileName, sheets: selectedSheets };
    notifyStateChange();
    
    showToast('設定成功，開始同步資料', 'success');
    await syncFromBuffer(buffer);
  });
}

export async function syncFromBuffer(buffer = currentFile) {
  if (!buffer || isSyncing) return;
  isSyncing = true;

  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
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
    } catch (err) {
      console.warn('[Sync Engine] 無法取得 settings', err);
    }

    const parsed = parseWorkbook(workbook, selectedSheets, salesMapping, statuses[0], schema, targetMonth);
    let added = 0, updated = 0;

    for (const order of parsed) {
      if (!order.id) continue;
      
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
        const orderCategory = String(order.data?.category || '其他').toUpperCase().trim();
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
    } else {
      showToast('同步完成，但沒有新增或更新資料（請檢查分頁或月份）', 'info');
    }
  } catch (err) {
    console.error('[Sync From Excel Error]', err);
    showToast(`讀取 Excel 失敗: ${err.message}`, 'error');
  } finally {
    isSyncing = false;
  }
}

export async function downloadLatestExcel() {
  if (!currentFile) {
    showToast('請先上傳 Excel 檔案', 'error');
    return;
  }

  try {
    const workbook = XLSX.read(currentFile, { type: 'array' });
    const allOrders = await getCollection('work_orders');

    const updatedWorkbook = updateWorkbookState(workbook, selectedSheets, allOrders);

    const downloadName = targetFileName.replace(/\.(xlsx|xls)$/i, '_已同步.xlsx');
    downloadWorkbook(updatedWorkbook, downloadName);
    
    showToast('已下載最新進度，請覆蓋原檔', 'success');
  } catch (err) {
    console.error('[Download Error]', err);
    showToast(`下載失敗: ${err.message}`, 'error');
  }
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/engine/sync-engine.js
V: 1794188100
W: UPGRADE-009
═══ */