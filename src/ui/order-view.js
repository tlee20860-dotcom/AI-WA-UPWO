import { AppState } from '../config/state.js';
import { createIcons, ArrowUpDown, ArrowUp, ArrowDown, Trash2, ArrowRightLeft, User, Calendar, ChevronDown, Inbox } from 'lucide';

/**
 * 將 Excel 日期轉為 YYYY-MM-DD，並防呆過濾
 */
export function formatExcelDate(val) {
  if (!val) return "-";
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

/**
 * 彈出狀態選擇視窗
 */
function showStatusModal(currentStatus, onSelect) {
  const statuses = AppState.getStatuses() || [];
  const otherStatuses = statuses.filter(s => s !== currentStatus);
  
  if (otherStatuses.length === 0) return;

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/40 z-[999] flex items-center justify-center p-4';
  overlay.innerHTML = `
    <div class="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
      <div class="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
        <h3 class="font-bold text-slate-800">選擇目標狀態</h3>
        <button class="text-slate-400 hover:text-slate-600 close-modal text-xl leading-none">&times;</button>
      </div>
      <div class="p-4 flex flex-col gap-2">
        ${otherStatuses.map(s => `
          <button class="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-brand hover:text-brand font-medium transition-colors btn-select-status" data-status="${s}">
            ${s}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const close = () => overlay.remove();
  overlay.querySelector('.close-modal').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  
  overlay.querySelectorAll('.btn-select-status').forEach(btn => {
    btn.onclick = () => {
      close();
      onSelect(btn.dataset.status);
    };
  });
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

  // 2. 依配置提取顯示欄位
  const displayFields = visibleFields.filter(f => f.isVisible);

  // 3. 全域事件委派 (確保全站按鈕絕不失效)
  if (!window._orderViewListenerAdded) {
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
      
      // 動作按鈕 (流轉、刪除)
      const actionBtn = e.target.closest('[data-action="flow"], [data-action="delete"]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const id = actionBtn.dataset.id;
        if (action === 'flow') {
          const order = cleanOrders.find(o => o.id === id);
          if (order) {
            showStatusModal(order.status, (newStatus) => {
              if (onAction) onAction('flow', id, newStatus);
            });
          }
        } else {
          if (onAction) onAction(action, id);
        }
      }
    });

    // 篩選輸入
    document.addEventListener('input', (e) => {
      const input = e.target.closest('input[data-filter]');
      if (input) {
        const key = input.dataset.pageKey;
        if (viewStates[key]) {
          viewStates[key].filters[input.dataset.filter] = input.value;
          window.dispatchEvent(new Event(`refresh-${key}`));
        }
      }
    });
    window._orderViewListenerAdded = true;
  }

  // 4. 處理排序與篩選
  if (state.sortKey) {
    cleanOrders.sort((a, b) => {
      let valA = getOrderValue(a, state.sortKey);
      let valB = getOrderValue(b, state.sortKey);
      return (valA < valB ? -1 : 1) * (state.sortOrder === 'asc' ? 1 : -1);
    });
  }
  Object.keys(state.filters).forEach(k => {
    const v = state.filters[k].toLowerCase();
    if (v) cleanOrders = cleanOrders.filter(o => String(getOrderValue(o, k)).toLowerCase().includes(v));
  });

  // 5. 生成 HTML
  const viewToggleHtml = `
    <div class="segmented-control mb-4">
      <button data-action="switch-view" data-view="card" data-page-key="${pageKey}" class="segment-btn ${state.viewType === 'card' ? 'active' : ''}">卡片</button>
      <button data-action="switch-view" data-view="table" data-page-key="${pageKey}" class="segment-btn ${state.viewType === 'table' ? 'active' : ''}">表格</button>
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
            return `<div class="text-sm"><span class="text-slate-400">${f.label}:</span> <span class="font-medium text-slate-700">${val || '-'}</span></div>`;
          }).join('')}
          ${isAdmin ? `
            <div class="mt-auto pt-2 border-t border-slate-100 flex gap-2 justify-end">
              <button data-action="flow" data-id="${order.id}" class="text-xs text-brand hover:bg-brand/10 px-2 py-1 rounded">流轉</button>
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
                <th class="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors" data-sort="${f.key}" data-page-key="${pageKey}">
                  <div class="flex items-center gap-1">${f.label} <i data-lucide="${state.sortKey === f.key ? (state.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'}" class="w-3 h-3 ${state.sortKey === f.key ? 'text-brand' : 'text-slate-300'}"></i></div>
                </th>
              `).join('')}
              ${isAdmin ? `<th class="px-4 py-3 text-center">操作</th>` : ''}
            </tr>
            <tr class="bg-white border-b border-slate-100">
              ${displayFields.map(f => `<th class="px-2 py-2"><input type="text" data-filter="${f.key}" data-page-key="${pageKey}" value="${state.filters[f.key] || ''}" class="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none"></th>`).join('')}
              ${isAdmin ? `<th></th>` : ''}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-sm text-slate-700">
            ${cleanOrders.map(order => `
              <tr class="hover:bg-slate-50/50 transition-colors">
                ${displayFields.map(f => `<td class="px-4 py-3 whitespace-nowrap">${getOrderValue(order, f.key) || '-'}</td>`).join('')}
                ${isAdmin ? `
                  <td class="px-4 py-3 text-center whitespace-nowrap">
                    <button data-action="flow" data-id="${order.id}" class="text-xs text-brand hover:bg-brand/10 px-2 py-1 rounded mr-1">流轉</button>
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
  createIcons({ icons: { ArrowUpDown, ArrowUp, ArrowDown }, attrs: { class: 'w-3 h-3' } });
}

/**
 * 取得欄位值 (處理巢狀 data 與特殊日期格式)
 */
function getOrderValue(order, key) {
  if (key === 'uploadDate' || key === 'dueDate' || key === 'statusUpdateDate') {
    return formatExcelDate(order[key]);
  }
  if (key === 'status') {
    return `<span class="px-2 py-1 bg-brand/10 text-brand rounded-md text-xs font-semibold">${order.status || '未知'}</span>`;
  }
  if (order.data && order.data[key] !== undefined) {
    return order.data[key];
  }
  return order[key] !== undefined ? order[key] : '';
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/ui/order-view.js
V: 1792914500
W: UPGRADE-002
═══ */