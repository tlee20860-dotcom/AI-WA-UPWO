~~~javascript
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

    // 2. 建立「全域」工序 → 區域映射（基於全部 areas，不受權限影響）
    //    這一步必須用全部 areas，否則未授權區域的工序會被誤判為「未分配」而外洩。
    const statusToArea = {};
    areas.forEach(area => {
      (area.statuses || []).forEach(s => {
        statusToArea[s] = area.id;
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

    // 4. 真正未綁定的工序 = allStatuses 中不在 statusToArea 者
    const unassignedStatuses = allStatuses.filter(s => !statusToArea[s]);

    // 5. 收集「未知工序」：工單 status 不在 allStatuses 也不在 statusToArea
    const knownStatuses = new Set([...allStatuses, ...Object.keys(statusToArea)]);
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
      const areaId = statusToArea[status];

      if (areaId) {
        // 屬於某區域的工序
        if (visibleAreaIds.has(areaId) && ordersByArea[areaId] && ordersByArea[areaId][status]) {
          ordersByArea[areaId][status].push(order);
        }
        // 未授權區域的工單：完全不出現（不進未分配）
        return;
      }

      // 未綁定任何區域的工序
      if (status && unassignedOrders[status]) {
        unassignedOrders[status].push(order);
        return;
      }

      // 未知工序（status 不在 allStatuses 也不在 statusToArea）
      const key = status || '__EMPTY__';
      if (!unknownOrders[key]) unknownOrders[key] = [];
      unknownOrders[key].push(order);
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

      return `
        <div class="glass-card p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <i data-lucide="map-pin" class="w-5 h-5 text-brand"></i>
            <h2 class="text-base font-bold text-slate-800">${area.name}</h2>
            <span class="text-xs px-2 py-0.5 bg-brand/10 text-brand rounded font-medium">${totalCount} 單</span>
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
        <div class="glass-card p-4 flex flex-col gap-3 border-dashed">
          <div class="flex items-center gap-2">
            <i data-lucide="inbox" class="w-5 h-5 text-slate-400"></i>
            <h2 class="text-base font-bold text-slate-800">未分配區域</h2>
            <span class="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">${unassignedTotal} 單</span>
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
V: 1792937600
W: UPGRADE-005
*/
~~~