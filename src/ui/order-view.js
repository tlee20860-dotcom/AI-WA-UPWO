import { AppState } from '../config/state.js';
import { createIcons, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Inbox, Search, ChevronLeft, ChevronRight, Settings } from 'lucide';

/**
 * 將 Excel 日期轉為 YYYY-MM-DD，並防呆過濾
 */
export function formatExcelDate(val) {
  if (!val) return "";
  if (typeof val === 'string') {
    if (val.includes('T')) return val.split('T')[0];
    if (val.includes('-') || val.includes('/')) return val.trim();
  }
  const num = Number(val);
  if (!isNaN(num) && num > 20000 && num < 80000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }
  return String(val).trim();
}

// 全域狀態暫存，避免切換頁面時遺失
const viewStates = {};

/**
 * 核心渲染器：完全數據驅動
 */
export function renderOrderView({ containerId, orders, visibleFields = [], isAdmin = false, pageKey, onAction }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!viewStates[pageKey]) {
    viewStates[pageKey] = { viewType: 'table', sortKey: '', sortOrder: 'asc', filters: {} };
  }
  const state = viewStates[pageKey];

  // 1. 資料清洗：過濾垃圾資料 (含 *** 或無單號)
  let cleanOrders = orders.filter(o => {
    const id = String(o.id || '');
    return id && !id.includes('***') && !id.includes('訂單');
  });

  // 2. 依配置提取顯示欄位 (若無配置，保底顯示 id 與 status)
  let displayFields = visibleFields.filter(f => f.isVisible);
  if (displayFields.length === 0) {
    displayFields = [
      { key: 'id', label: '發票', isVisible: true, isEditable: false },
      { key: 'status', label: '生產進度', isVisible: true, isEditable: false }
    ];
  }

  // 3. 全域事件委派 (確保全站按鈕絕不失效)
  if (!window._orderViewListenerAdded) {
    // 點擊事件
    document.addEventListener('click', (e) => {
      // 切換視圖
      const viewBtn = e.target.closest('[data-action="switch-view"]');
      if (viewBtn) {
        const key = viewBtn.dataset.pageKey;
        if (viewStates[key]) {
          viewStates[key].viewType = viewBtn.dataset.view;
          window.dispatchEvent(new Event(`refresh-${key}`));
        }
        return;
      }

      // 排序
      const th = e.target.closest('th[data-sort]');
      if (th) {
        const key = th.dataset.pageKey;
        const sortKey = th.dataset.sort;
        if (viewStates[key]) {
          if (viewStates[key].sortKey === sortKey) {
            viewStates[key].sortOrder = viewStates[key].sortOrder === 'asc' ? 'desc' : 'asc';
          } else {
            viewStates[key].sortKey = sortKey;
            viewStates[key].sortOrder = 'asc';
          }
          window.dispatchEvent(new Event(`refresh-${key}`));
        }
        return;
      }
      
      // 動作按鈕 (刪除)
      const actionBtn = e.target.closest('[data-action="delete"]');
      if (actionBtn) {
        if (onAction) onAction('delete', actionBtn.dataset.id);
      }
    });

    // 輸入事件 (全域搜尋)
    document.addEventListener('input', (e) => {
      const searchInput = e.target.closest('input[data-action="global-search"]');
      if (searchInput) {
        const key = searchInput.dataset.pageKey;
        if (viewStates[key]) {
          viewStates[key].filters['__GLOBAL__'] = searchInput.value.toLowerCase();
          window.dispatchEvent(new Event(`refresh-${key}`));
        }
      }
    });

    // 改變事件 (行內編輯)
    document.addEventListener('change', (e) => {
      // 行內編輯（日期或文字）
      const inlineInput = e.target.closest('input[data-action="inline-edit"]');
      if (inlineInput) {
        const id = inlineInput.dataset.id;
        const key = inlineInput.dataset.key;
        const value = inlineInput.value;
        
        // 拋出全域事件，由 order-view-editor.js 接手處理存檔
        window.dispatchEvent(new CustomEvent('inline-edit', { 
          detail: { id, key, value } 
        }));
      }
    });

    window._orderViewListenerAdded = true;
  }

  // 4. 處理排序與全域篩選
  if (state.sortKey) {
    cleanOrders.sort((a, b) => {
      let valA = getOrderValue(a, state.sortKey);
      let valB = getOrderValue(b, state.sortKey);
      return (valA < valB ? -1 : 1) * (state.sortOrder === 'asc' ? 1 : -1);
    });
  }

  const globalFilter = state.filters['__GLOBAL__'];
  if (globalFilter) {
    cleanOrders = cleanOrders.filter(o => {
      // 檢查所有顯示欄位是否包含關鍵字
      return displayFields.some(f => {
        const val = String(getOrderValue(o, f.key) || '').toLowerCase();
        return val.includes(globalFilter);
      });
    });
  }

  const allStatuses = AppState.getStatuses() || [];

  // 5. 生成 HTML
  const viewToggleHtml = `
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div class="segmented-control">
        <button data-action="switch-view" data-view="card" data-page-key="${pageKey}" class="segment-btn ${state.viewType === 'card' ? 'active' : ''}">卡片</button>
        <button data-action="switch-view" data-view="table" data-page-key="${pageKey}" class="segment-btn ${state.viewType === 'table' ? 'active' : ''}">表格</button>
      </div>
      <div class="relative w-full sm:w-64">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <i data-lucide="search" class="w-4 h-4"></i>
        </div>
        <input type="text" data-action="global-search" data-page-key="${pageKey}" value="${state.filters['__GLOBAL__'] || ''}" class="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors shadow-sm" placeholder="搜尋所有欄位&#8230;">
      </div>
    </div>
  `;

  if (cleanOrders.length === 0) {
    container.innerHTML = viewToggleHtml + `
      <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft mt-4">
        <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
        <span class="text-base font-medium">目前無工單資料</span>
      </div>
    `;
    createIcons({ icons: { Inbox }, attrs: { class: 'w-12 h-12' } });
    return;
  }

  let contentHtml = '';
  if (state.viewType === 'card') {
    // 動態卡片
    contentHtml = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">` + 
      cleanOrders.map(order => `
        <div class="glass-card p-4 flex flex-col gap-2">
          ${displayFields.map(f => {
            const val = getOrderValue(order, f.key);
            
            if (f.key === 'status') {
              let route = order.route && order.route.length > 0 ? order.route : allStatuses;
              let idx = route.indexOf(order.status);
              if (idx === -1) idx = 0;
              const isFirst = idx <= 0;
              const isLast = idx >= route.length - 1;
              const prevStep = isFirst ? '' : route[idx - 1];
              const nextStep = isLast ? '' : route[idx + 1];
              const routeStr = JSON.stringify(route).replace(/"/g, '&quot;');

              return `
                <div class="text-sm flex flex-col gap-1">
                  <span class="text-slate-400">${f.label}:</span>
                  <div class="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1 py-0.5 w-fit max-w-full">
                    <button data-action="prev-step" data-id="${order.id}" data-route="${routeStr}" data-status="${order.status}" 
                      class="flex items-center text-xs p-1 rounded text-slate-600 hover:bg-slate-200 transition-colors ${isFirst ? 'opacity-30 cursor-not-allowed' : ''}" ${isFirst ? 'disabled' : ''}>
                      <i data-lucide="chevron-left" class="w-4 h-4"></i>
                      <span class="truncate max-w-[60px]">${prevStep}</span>
                    </button>
                    <span class="font-bold text-slate-700 text-sm px-1 min-w-[60px] text-center truncate max-w-[100px]">${order.status}</span>
                    <button data-action="next-step" data-id="${order.id}" data-route="${routeStr}" data-status="${order.status}" 
                      class="flex items-center text-xs p-1 rounded text-slate-600 hover:bg-slate-200 transition-colors ${isLast ? 'opacity-30 cursor-not-allowed' : ''}" ${isLast ? 'disabled' : ''}>
                      <span class="truncate max-w-[60px]">${nextStep}</span>
                      <i data-lucide="chevron-right" class="w-4 h-4"></i>
                    </button>
                    <div class="w-px h-4 bg-slate-200 mx-1"></div>
                    <button data-action="edit-route" data-id="${order.id}" data-route="${routeStr}" data-status="${order.status}" 
                      class="p-1 rounded text-slate-400 hover:text-brand hover:bg-white transition-colors" title="編輯製程">
                      <i data-lucide="settings" class="w-4 h-4"></i>
                    </button>
                  </div>
                </div>
              `;
            }
            
            // 判斷是否可編輯
            if (f.isEditable) {
              const inputType = f.type === 'date' ? 'date' : (f.type === 'number' ? 'number' : 'text');
              const displayVal = f.type === 'date' ? formatExcelDate(val) : val;
              
              return `
                <div class="text-sm flex flex-col gap-1">
                  <span class="text-slate-400">${f.label}:</span>
                  <input type="${inputType}" data-action="inline-edit" data-id="${order.id}" data-key="${f.key}" value="${displayVal || ''}" 
                    class="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand transition-colors">
                </div>
              `;
            }
            
            return `<div class="text-sm"><span class="text-slate-400">${f.label}:</span> <span class="font-medium text-slate-700">${val || '-'}</span></div>`;
          }).join('')}
          ${isAdmin ? `
            <div class="mt-auto pt-2 border-t border-slate-100 flex justify-end">
              <button data-action="delete" data-id="${order.id}" class="text-xs text-rose-500 hover:bg-rose-50 px-2 py-1 rounded">刪除</button>
            </div>
          ` : ''}
        </div>
      `).join('') + `</div>`;
  } else {
    // 動態表格
    contentHtml = `
      <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-x-auto w-full">
        <table class="w-full text-left border-collapse min-w-full">
          <thead class="sticky top-0 bg-slate-50 z-10 shadow-sm">
            <tr class="border-b border-slate-200/60 text-sm font-semibold text-slate-600">
              ${displayFields.map(f => `
                <th class="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap min-w-[120px]" data-sort="${f.key}" data-page-key="${pageKey}">
                  <div class="flex items-center gap-1">${f.label} <i data-lucide="${state.sortKey === f.key ? (state.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'}" class="w-3 h-3 ${state.sortKey === f.key ? 'text-brand' : 'text-slate-300'}"></i></div>
                </th>
              `).join('')}
              ${isAdmin ? `<th class="px-4 py-3 text-center whitespace-nowrap min-w-[100px]">操作</th>` : ''}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-sm text-slate-700">
            ${cleanOrders.map(order => `
              <tr class="hover:bg-slate-50/50 transition-colors">
                ${displayFields.map(f => {
                  if (f.key === 'status') {
                    let route = order.route && order.route.length > 0 ? order.route : allStatuses;
                    let idx = route.indexOf(order.status);
                    if (idx === -1) idx = 0;
                    const isFirst = idx <= 0;
                    const isLast = idx >= route.length - 1;
                    const prevStep = isFirst ? '' : route[idx - 1];
                    const nextStep = isLast ? '' : route[idx + 1];
                    const routeStr = JSON.stringify(route).replace(/"/g, '&quot;');

                    return `
                      <td class="px-4 py-3 whitespace-nowrap">
                        <div class="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1 py-0.5 w-fit max-w-full">
                          <button data-action="prev-step" data-id="${order.id}" data-route="${routeStr}" data-status="${order.status}" 
                            class="flex items-center text-xs p-1 rounded text-slate-600 hover:bg-slate-200 transition-colors ${isFirst ? 'opacity-30 cursor-not-allowed' : ''}" ${isFirst ? 'disabled' : ''}>
                            <i data-lucide="chevron-left" class="w-4 h-4"></i>
                            <span class="truncate max-w-[60px]">${prevStep}</span>
                          </button>
                          <span class="font-bold text-slate-700 text-sm px-1 min-w-[60px] text-center truncate max-w-[100px]">${order.status}</span>
                          <button data-action="next-step" data-id="${order.id}" data-route="${routeStr}" data-status="${order.status}" 
                            class="flex items-center text-xs p-1 rounded text-slate-600 hover:bg-slate-200 transition-colors ${isLast ? 'opacity-30 cursor-not-allowed' : ''}" ${isLast ? 'disabled' : ''}>
                            <span class="truncate max-w-[60px]">${nextStep}</span>
                            <i data-lucide="chevron-right" class="w-4 h-4"></i>
                          </button>
                          <div class="w-px h-4 bg-slate-200 mx-1"></div>
                          <button data-action="edit-route" data-id="${order.id}" data-route="${routeStr}" data-status="${order.status}" 
                            class="p-1 rounded text-slate-400 hover:text-brand hover:bg-white transition-colors" title="編輯製程">
                            <i data-lucide="settings" class="w-4 h-4"></i>
                          </button>
                        </div>
                      </td>
                    `;
                  }
                  
                  // 判斷是否可編輯
                  if (f.isEditable) {
                    const inputType = f.type === 'date' ? 'date' : (f.type === 'number' ? 'number' : 'text');
                    const displayVal = f.type === 'date' ? formatExcelDate(getOrderValue(order, f.key)) : getOrderValue(order, f.key);
                    
                    return `
                      <td class="px-2 py-2 whitespace-nowrap">
                        <input type="${inputType}" data-action="inline-edit" data-id="${order.id}" data-key="${f.key}" value="${displayVal || ''}" 
                          class="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-slate-200 focus:border-brand focus:bg-white rounded-lg text-sm transition-colors outline-none">
                      </td>
                    `;
                  }
                  
                  return `<td class="px-4 py-3 whitespace-nowrap">${getOrderValue(order, f.key) || '-'}</td>`;
                }).join('')}
                ${isAdmin ? `
                  <td class="px-4 py-3 text-center whitespace-nowrap">
                    <button data-action="delete" data-id="${order.id}" class="text-xs text-rose-500 hover:bg-rose-50 px-2 py-1 rounded">刪除</button>
                  </td>
                ` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  container.innerHTML = viewToggleHtml + contentHtml;
  createIcons({ icons: { ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronLeft, ChevronRight, Settings }, attrs: { class: 'w-4 h-4' } });
}

/**
 * 取得欄位值 (處理巢狀 data 與特殊日期格式)
 */
function getOrderValue(order, key) {
  if (key === 'uploadDate' || key === 'dueDate' || key === 'statusUpdateDate') {
    return formatExcelDate(order[key]);
  }
  if (key === 'status') {
    return order.status || '未知'; 
  }
  if (order.data && order.data[key] !== undefined) {
    return order.data[key];
  }
  return order[key] !== undefined ? order[key] : '';
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/ui/order-view.js
V: 1792925500
W: UPGRADE-004
═══ */