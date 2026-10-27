import { createIcons, ChevronDown, User, Calendar, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide';

/**
 * 將 Excel 日期序列號轉換為 YYYY-MM-DD 格式
 */
export function formatExcelDate(val) {
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

/**
 * 產生上方獨立按鈕清單 (像 Tabs)
 * @param {string} containerId 容器 ID
 * @param {Array} items 按鈕項目清單
 * @param {string} activeItem 當前選中的項目
 * @param {function} onSelect 點擊回呼
 * @param {string} extraHtml 右側附加的 HTML (如視圖切換按鈕)
 */
export function renderTopTabs(containerId, items, activeItem, onSelect, extraHtml = '') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
      <div class="flex items-center gap-2 overflow-x-auto w-full pb-2 sm:pb-0 kanban-scroll">
        ${items.map(item => `
          <button class="tab-btn whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${item.value === activeItem ? 'bg-brand text-white border-brand shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}" data-value="${item.value}">
            ${item.label} ${item.count !== undefined ? `<span class="ml-1 text-xs ${item.value === activeItem ? 'bg-white/20' : 'bg-slate-100'} px-1.5 py-0.5 rounded-md">${item.count}</span>` : ''}
          </button>
        `).join('')}
      </div>
      <div class="flex-shrink-0">
        ${extraHtml}
      </div>
    </div>
  `;

  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = e.currentTarget.dataset.value;
      if (val !== activeItem) {
        onSelect(val);
      }
    });
  });
}

/**
 * 產生視圖切換按鈕 (卡片 / 表格)
 */
export function renderViewToggle(currentView, onChange) {
  return `
    <div class="segmented-control">
      <button id="btn-view-card" class="segment-btn ${currentView === 'card' ? 'active' : ''} flex items-center gap-1">
        卡片
      </button>
      <button id="btn-view-table" class="segment-btn ${currentView === 'table' ? 'active' : ''} flex items-center gap-1">
        表格
      </button>
    </div>
  `;
}

/**
 * 綁定視圖切換事件
 */
export function bindViewToggle(onChange) {
  document.getElementById('btn-view-card')?.addEventListener('click', () => {
    document.getElementById('btn-view-card').classList.add('active');
    document.getElementById('btn-view-table').classList.remove('active');
    onChange('card');
  });
  document.getElementById('btn-view-table')?.addEventListener('click', () => {
    document.getElementById('btn-view-table').classList.add('active');
    document.getElementById('btn-view-card').classList.remove('active');
    onChange('table');
  });
}

// 表格內部狀態
let sortKey = '';
let sortOrder = 'asc'; // 'asc' | 'desc'
let filters = {};

/**
 * 渲染工單清單（卡片或表格）
 * @param {Object} options
 * @param {string} options.containerId 容器 ID
 * @param {Array} options.orders 工單陣列
 * @param {string} options.viewType 'card' | 'table'
 * @param {Array} options.schema 動態欄位設定
 * @param {boolean} options.isAdmin 是否為管理員
 * @param {function} options.onStatusChange 狀態流轉回呼
 * @param {function} options.onDelete 刪除回呼
 */
export function renderOrders({ containerId, orders, viewType, schema = [], isAdmin = false, onStatusChange = null, onDelete = null }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft">
        <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
        <span class="text-base font-medium">目前無工單資料</span>
      </div>
    `;
    createIcons({ attrs: { class: 'w-12 h-12' } });
    return;
  }

  if (viewType === 'card') {
    renderCardView(container, orders, isAdmin, onStatusChange);
  } else {
    renderTableView(container, orders, schema, isAdmin, onStatusChange, onDelete);
  }
}

// ═══════════ 卡片視圖 ═══════════
function renderCardView(container, orders, isAdmin, onStatusChange) {
  container.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
      ${orders.map(order => {
        const uploadDate = formatExcelDate(order.uploadDate);
        const salesReps = order.salesReps ? order.salesReps.join(', ') : '未填寫';
        const category = order.data && order.data.category ? order.data.category : '其他';
        let customerName = order.data ? (order.data['customerNameZh'] || order.data['customerNameEn'] || '') : '';
        if (customerName.includes('***')) customerName = '';
        
        return `
          <div class="glass-card p-4 relative card-item !overflow-visible" data-id="${order.id}" data-status="${order.status}">
            <div class="flex justify-between items-start mb-2">
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-900">${order.id}</span>
                <span class="text-[10px] font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded">${category}</span>
              </div>
              <span class="text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded-md">${uploadDate}</span>
            </div>
            
            <div class="flex flex-col gap-1.5 mb-3">
              ${customerName ? `<div class="text-sm text-slate-600 truncate">客戶：${customerName}</div>` : ''}
              <div class="flex items-center gap-1.5 text-xs text-slate-500">
                <i data-lucide="user" class="w-3.5 h-3.5"></i> ${salesReps}
              </div>
              ${order.dueDate ? `<div class="text-xs text-amber-600 flex items-center gap-1.5"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> 交期：${formatExcelDate(order.dueDate)}</div>` : ''}
            </div>

            ${isAdmin && onStatusChange ? `
              <div class="mt-3 pt-3 border-t border-slate-100 relative">
                <button class="w-full flex items-center justify-between text-xs font-medium text-slate-500 hover:text-brand transition-colors btn-dropdown">
                  <span>流轉工序</span>
                  <i data-lucide="chevron-down" class="w-4 h-4 transition-transform"></i>
                </button>
                <div class="dropdown-menu hidden absolute left-0 right-0 bottom-full mb-1 bg-white border border-slate-100 shadow-xl rounded-xl p-1 z-[999]">
                  <div class="text-xs text-slate-400 px-3 py-1 mb-1 border-b border-slate-50">選擇目標狀態</div>
                  <!-- 由外部傳入的狀態清單動態產生 -->
                  <div class="status-options" data-id="${order.id}">
                    <!-- 這裡用 JS 動態注入，或由調用方傳入 -->
                  </div>
                </div>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
  createIcons({ icons: { User, Calendar, ChevronDown }, attrs: { class: 'w-4 h-4' } });
  // 狀態流轉事件交由外部處理（因為需要 AppState 的狀態清單）
}

// ═══════════ 表格視圖 ═══════════
function renderTableView(container, orders, schema, isAdmin, onStatusChange, onDelete) {
  // 1. 處理排序
  let sortedOrders = [...orders];
  if (sortKey) {
    sortedOrders.sort((a, b) => {
      let valA = getOrderValue(a, sortKey);
      let valB = getOrderValue(b, sortKey);
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // 2. 處理篩選
  Object.keys(filters).forEach(key => {
    const filterVal = filters[key].toLowerCase();
    if (filterVal) {
      sortedOrders = sortedOrders.filter(o => String(getOrderValue(o, key)).toLowerCase().includes(filterVal));
    }
  });

  const customFields = schema.filter(f => !f.isSystem);

  const getSortIcon = (key) => {
    if (sortKey !== key) return `<i data-lucide="arrow-up-down" class="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"></i>`;
    return sortOrder === 'asc' ? `<i data-lucide="arrow-up" class="w-3 h-3 text-brand"></i>` : `<i data-lucide="arrow-down" class="w-3 h-3 text-brand"></i>`;
  };

  container.innerHTML = `
    <div class="bg-white rounded-[20px] border border-slate-200/60 shadow-soft overflow-hidden flex flex-col w-full h-full">
      <div class="overflow-auto flex-1 kanban-scroll">
        <table class="w-full text-left border-collapse min-w-[1000px]">
          <thead class="sticky top-0 bg-slate-50 z-10 shadow-sm">
            <tr class="border-b border-slate-200/60 text-sm font-semibold text-slate-600">
              ${renderTh('id', '工單號碼')}
              ${renderTh('category', '類別')}
              ${renderTh('status', '當前狀態')}
              ${renderTh('uploadDate', '上傳日期')}
              ${renderTh('dueDate', '交期')}
              ${customFields.map(f => renderTh(f.key, f.label)).join('')}
              ${(onStatusChange || onDelete) ? `<th class="px-4 py-3 text-center min-w-[100px]">操作</th>` : ''}
            </tr>
            <tr class="bg-white border-b border-slate-100">
              ${renderFilterInput('id', '搜尋號碼...')}
              ${renderFilterInput('category', '搜尋類別...')}
              ${renderFilterInput('status', '搜尋狀態...')}
              ${renderFilterInput('uploadDate', '搜尋日期...')}
              ${renderFilterInput('dueDate', '搜尋交期...')}
              ${customFields.map(f => renderFilterInput(f.key, '搜尋...')).join('')}
              ${(onStatusChange || onDelete) ? `<th class="px-4 py-1"></th>` : ''}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-sm text-slate-700">
            ${sortedOrders.map(order => {
              const cat = order.data && order.data.category ? order.data.category : '其他';
              return `
                <tr class="hover:bg-slate-50/50 transition-colors">
                  <td class="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">${order.id}</td>
                  <td class="px-4 py-3 whitespace-nowrap"><span class="px-2 py-1 bg-slate-100 rounded-md text-xs">${cat}</span></td>
                  <td class="px-4 py-3 whitespace-nowrap"><span class="px-2 py-1 bg-brand/10 text-brand rounded-md text-xs font-semibold">${order.status}</span></td>
                  <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${formatExcelDate(order.uploadDate)}</td>
                  <td class="px-4 py-3 font-medium ${order.dueDate ? 'text-amber-600' : 'text-slate-400'} whitespace-nowrap">${formatExcelDate(order.dueDate) || '-'}</td>
                  ${customFields.map(f => {
                    const val = order.data && order.data[f.key] !== undefined ? order.data[f.key] : '-';
                    return `<td class="px-4 py-3 text-slate-600 whitespace-nowrap truncate max-w-[200px]" title="${val}">${val}</td>`;
                  }).join('')}
                  
                  ${(onStatusChange || onDelete) ? `
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                      <div class="flex items-center justify-center gap-2">
                        ${onDelete ? `
                          <button class="btn-delete p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" data-id="${order.id}" title="刪除">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                          </button>
                        ` : ''}
                        ${onStatusChange && isAdmin ? `
                          <button class="btn-flow p-1.5 text-slate-400 hover:text-brand hover:bg-brand/5 rounded-lg transition-colors" data-id="${order.id}" title="流轉">
                            <i data-lucide="arrow-right-left" class="w-4 h-4"></i>
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  ` : ''}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="bg-slate-50/50 px-6 py-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center">
        <span>共計 ${sortedOrders.length} 筆工單（已過濾）</span>
      </div>
    </div>
  `;

  createIcons({ icons: { ArrowUpDown, ArrowUp, ArrowDown, Trash2, ArrowRightLeft }, attrs: { class: 'w-4 h-4' } });

  // 綁定排序事件
  container.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortOrder = 'asc';
      }
      renderTableView(container, orders, schema, isAdmin, onStatusChange, onDelete);
    });
  });

  // 綁定篩選事件
  container.querySelectorAll('input[data-filter]').forEach(input => {
    input.value = filters[input.dataset.filter] || '';
    input.addEventListener('input', (e) => {
      filters[e.target.dataset.filter] = e.target.value;
      renderTableView(container, orders, schema, isAdmin, onStatusChange, onDelete);
    });
  });

  // 綁定操作事件
  if (onDelete) {
    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => onDelete(btn.dataset.id));
    });
  }
  if (onStatusChange && isAdmin) {
    container.querySelectorAll('.btn-flow').forEach(btn => {
      btn.addEventListener('click', () => onStatusChange(btn.dataset.id));
    });
  }
}

function renderTh(key, label) {
  return `
    <th class="px-4 py-3 cursor-pointer group hover:bg-slate-100 transition-colors min-w-[120px] resize-x overflow-auto" data-sort="${key}">
      <div class="flex items-center gap-1">
        ${label} ${getSortIcon(key)}
      </div>
    </th>
  `;
}

function renderFilterInput(key, placeholder) {
  return `
    <th class="px-2 py-2">
      <input type="text" class="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-brand" data-filter="${key}" placeholder="${placeholder}">
    </th>
  `;
}

function getOrderValue(order, key) {
  if (key === 'id') return order.id || '';
  if (key === 'status') return order.status || '';
  if (key === 'uploadDate') return formatExcelDate(order.uploadDate);
  if (key === 'dueDate') return formatExcelDate(order.dueDate);
  if (key === 'category') return order.data && order.data.category ? order.data.category : '';
  if (key === 'salesReps') return (order.salesReps || []).join(',');
  return order.data && order.data[key] !== undefined ? order.data[key] : '';
}

/* ═══ EOF ═══
F: AI-WA-UPWO/src/ui/order-view.js
V: 1792912700
W: UPGRADE-002
═══ */