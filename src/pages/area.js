import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { renderPageLayout } from '../ui/layout.js';
import { createIcons, Inbox, ChevronLeft, ChevronRight, MapPin, AlertCircle } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let areas = [];
let statuses = [];
let userRole = 'user';
let userAllowedAreas = [];

/**
 * 渲染單一工單 chip（工單號 + 上/下工序按鈕）
 * 按鈕事件由 order-view-editor.js 的全域委派處理（data-action="prev-step" / "next-step"）
 */
function renderOrderChip(order, allStatuses) {
  let route = order.route && order.route.length > 0 ? order.route : allStatuses;
  let idx = route.indexOf(order.status);
  if (idx === -1) idx = 0;
  const isFirst = idx <= 0;
  const isLast = idx >= route.length - 1;
  const routeStr = JSON.stringify(route).replace(/"/g, '&quot;');

  return `
    <div class="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
      <span class="text-sm font-medium text-slate-700">${order.id}</span>
      <button data-action="prev-step" data-id="${order.id}" data-route="${routeStr}" data-status="${order.status}"
        class="p-0.5 rounded text-slate-400 hover:bg-slate-100 transition-colors ${isFirst ? 'opacity-30 cursor-not-allowed' : ''}" ${isFirst ? 'disabled' : ''}>
        <i data-lucide="chevron-left" class="w-3 h-3"></i>
      </button>
      <button data-action="next-step" data-id="${order.id}" data-route="${routeStr}" data-status="${order.status}"
        class="p-0.5 rounded text-slate-400 hover:bg-slate-100 transition-colors ${isLast ? 'opacity-30 cursor-not-allowed' : ''}" ${isLast ? 'disabled' : ''}>
        <i data-lucide="chevron-right" class="w-3 h-3"></i>
      </button>
    </div>
  `;
}

/**
 * 渲染一組工序區塊（工序小標題 + 工單 chips）
 */
function renderStatusBlock(status, orders, allStatuses) {
  if (!orders || orders.length === 0) return '';
  return `
    <div>
      <div class="text-xs font-semibold text-slate-500 mb-1.5">${status}（${orders.length}）</div>
      <div class="flex flex-wrap gap-1.5">
        ${orders.map(o => renderOrderChip(o, allStatuses)).join('')}
      </div>
    </div>
  `;
}

/**
 * 取得工單的類別 (優先從 data.category，其次從工單號前兩碼)
 */
function getOrderCategory(order) {
  if (order.data && order.data.category) {
    return String(order.data.category).toUpperCase();
  }
  const match = String(order.id).match(/^[a-zA-Z]+/);
  return match ? match[0].toUpperCase() : '其他';
}

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    userRole = user.role;
    userAllowedAreas = Array.isArray(user.allowedAreas) ? user.allowedAreas : [];

    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        areas = settingsDoc.areas || [];
        statuses = settingsDoc.statuses || [];
      }
    } catch (err) {}

    renderPageLayout({
      title: '生產區域',
      subtitle: '依區域檢視工單狀態',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'area-container'
    });

    window.addEventListener('settings-updated', this.updateUI.bind(this));
    window.addEventListener('refresh-area', this.updateUI.bind(this));

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
    const container = document.getElementById('area-container');
    if (!container) return;

    const allStatuses = AppState.getStatuses() || statuses;

    // 1. 過濾垃圾資料
    const cleanOrders = currentOrders.filter(o => {
      const id = String(o.id || '');
      return id && !id.includes('***') && !id.includes('訂單');
    });

    // 2. 建立「全域」工序 → 區域映射
    // 因為一個工序可以綁定多個區域，所以值為 Array
    const statusToAreaIds = {};
    areas.forEach(area => {
      (area.statuses || []).forEach(s => {
        if (!statusToAreaIds[s]) statusToAreaIds[s] = [];
        statusToAreaIds[s].push(area.id);
      });
    });

    // 3. 權限過濾：決定「可見區域」
    let visibleAreas = areas;
    let showAllWarning = false;
    if (userRole !== 'admin') {
      if (userAllowedAreas.length > 0) {
        visibleAreas = areas.filter(a => userAllowedAreas.includes(a.id));
      } else {
        // 空陣列 = 看到全部（向後相容），但提示管理員應配置
        showAllWarning = true;
      }
    }
    const visibleAreaIds = new Set(visibleAreas.map(a => a.id));

    // 4. 真正未綁定的工序 = allStatuses 中不在 statusToAreaIds 者
    const unassignedStatuses = allStatuses.filter(s => !statusToAreaIds[s]);

    // 5. 收集「未知工序」：工單 status 不在 allStatuses 也不在 statusToAreaIds
    const knownStatuses = new Set([...allStatuses, ...Object.keys(statusToAreaIds)]);
    const unknownStatuses = new Set();
    cleanOrders.forEach(o => {
      if (o.status && !knownStatuses.has(o.status)) {
        unknownStatuses.add(o.status);
      }
    });

    // 6. 初始化分組容器
    const ordersByArea = {};
    visibleAreas.forEach(area => {
      ordersByArea[area.id] = {};
      (area.statuses || []).forEach(s => {
        ordersByArea[area.id][s] = [];
      });
    });

    const unassignedOrders = {};
    unassignedStatuses.forEach(s => {
      unassignedOrders[s] = [];
    });

    const unknownOrders = {}; // key: 未知工序名稱或 '__EMPTY__'

    // 7. 分派工單
    cleanOrders.forEach(order => {
      const status = order.status;
      const areaIds = statusToAreaIds[status] || [];
      const orderCategory = getOrderCategory(order);

      let isAssignedToAnyArea = false;

      // 檢查該工序所屬的所有區域
      areaIds.forEach(areaId => {
        isAssignedToAnyArea = true; // 標記此工序有被綁定到某個區域

        // 如果該區域不在當前使用者的可見範圍內，直接跳過
        if (!visibleAreaIds.has(areaId)) return;

        const area = areas.find(a => a.id === areaId);
        if (!area) return;

        // 類別過濾：若區域有設定類別，則必須與工單類別相符
        const areaCategory = area.category ? String(area.category).toUpperCase() : '';
        const categoryMatch = !areaCategory || areaCategory === orderCategory;

        if (categoryMatch && ordersByArea[areaId] && ordersByArea[areaId][status]) {
          ordersByArea[areaId][status].push(order);
        }
      });

      // 如果該工序完全沒有被綁定到任何區域，則進入「未分配區域」
      if (!isAssignedToAnyArea) {
        if (status && unassignedOrders[status]) {
          unassignedOrders[status].push(order);
        } else {
          const key = status || '__EMPTY__';
          if (!unknownOrders[key]) unknownOrders[key] = [];
          unknownOrders[key].push(order);
        }
      }
    });

    // 8. 組裝 HTML
    let html = '';

    if (showAllWarning) {
      html += `
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
          <i data-lucide="alert-circle" class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"></i>
          <p class="text-sm text-amber-700">尚未配置區域權限，目前可看到全部區域。請聯繫管理員於「帳號管理」配置可見區域。</p>
        </div>
      `;
    }

    // 非 admin 且沒有任何授權區域 → 空白提示
    if (userRole !== 'admin' && userAllowedAreas.length > 0 && visibleAreas.length === 0) {
      html += `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft">
          <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
          <span class="text-base font-medium">您沒有被授權查看任何區域</span>
        </div>
      `;
      container.innerHTML = html;
      createIcons({ icons: { Inbox, AlertCircle }, attrs: { class: 'w-4 h-4' } });
      return;
    }

    // 8-1. 各區域卡片
    const areaCardsHtml = visibleAreas.map(area => {
      const areaOrders = ordersByArea[area.id] || {};
      const totalCount = Object.values(areaOrders).reduce((sum, arr) => sum + arr.length, 0);

      const statusBlocks = (area.statuses || []).map(status =>
        renderStatusBlock(status, areaOrders[status] || [], allStatuses)
      ).join('');

      const categoryLabel = area.category 
        ? `<span class="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-bold">${area.category}</span>` 
        : '';

      return `
        <div class="glass-card p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            <i data-lucide="map-pin" class="w-5 h-5 text-brand"></i>
            <h2 class="text-base font-bold text-slate-800">${area.name}</h2>
            ${categoryLabel}
            <span class="text-xs px-2 py-0.5 bg-brand/10 text-brand rounded font-medium ml-auto">${totalCount} 單</span>
          </div>
          ${totalCount === 0 ? `<div class="text-sm text-slate-400 py-2">暫無工單</div>` : statusBlocks}
        </div>
      `;
    }).join('');

    // 8-2. 未分配區域（含真正未綁定 + 未知工序）
    const unassignedBlocks = unassignedStatuses.map(status =>
      renderStatusBlock(status, unassignedOrders[status] || [], allStatuses)
    ).join('');

    const unknownBlocks = Object.keys(unknownOrders).map(status => {
      const label = status === '__EMPTY__' ? '（無工序）' : status;
      return renderStatusBlock(label, unknownOrders[status], allStatuses);
    }).join('');

    const unassignedTotal = Object.values(unassignedOrders).reduce((sum, arr) => sum + arr.length, 0)
      + Object.values(unknownOrders).reduce((sum, arr) => sum + arr.length, 0);

    let unassignedHtml = '';
    if (unassignedTotal > 0) {
      unassignedHtml = `
        <div class="glass-card p-4 flex flex-col gap-3 border-dashed border-2 border-slate-200 shadow-none">
          <div class="flex items-center gap-2">
            <i data-lucide="inbox" class="w-5 h-5 text-slate-400"></i>
            <h2 class="text-base font-bold text-slate-600">未分配區域</h2>
            <span class="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-medium ml-auto">${unassignedTotal} 單</span>
          </div>
          ${unassignedBlocks}
          ${unknownBlocks}
        </div>
      `;
    }

    // 8-3. 空狀態
    if (!areaCardsHtml && !unassignedHtml) {
      html += `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft">
          <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
          <span class="text-base font-medium">目前尚無區域或工單資料</span>
        </div>
      `;
    } else {
      html += `<div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">${areaCardsHtml}${unassignedHtml}</div>`;
    }

    container.innerHTML = html;
    createIcons({
      icons: { Inbox, ChevronLeft, ChevronRight, MapPin, AlertCircle },
      attrs: { class: 'w-4 h-4' }
    });
  },

  destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
    window.removeEventListener('refresh-area', this.updateUI.bind(this));
  }
};

/*
F: AI-WA-UPWO/src/pages/area.js
V: 1792951000
W: UPGRADE-005
*/