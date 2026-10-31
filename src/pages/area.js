import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { setDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { createIcons, Inbox, ChevronLeft, ChevronRight, MapPin, AlertCircle, Activity } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let areas = [];
let statuses = [];
let areaStatuses = [];
let userRole = 'viewer';
let userAllowedAreas = [];

/**
 * 渲染單一工單 chip（工單號 + 上/下工序按鈕）
 * 按鈕事件由 order-view-editor.js 的全域委派處理
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
 * 取得工單類別
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

    await this.loadSettings();

    renderPageLayout({
      title: '生產區域',
      subtitle: '依區域檢視工單狀態',
      headerActions: '',
      stats: [],
      controls: '',
      listContainerId: 'area-container'
    });

    // 全域事件委派：處理區域狀態切換
    document.addEventListener('change', async (e) => {
      const select = e.target.closest('.area-status-select');
      if (select) {
        const areaId = select.dataset.areaId;
        const newStatus = select.value;
        
        // 權限檢查
        if (userRole !== 'admin' && userRole !== 'worker') return;

        try {
          const settingsDoc = await getDocument('settings', 'main');
          if (!settingsDoc) return;
          
          const targetAreaIndex = (settingsDoc.areas || []).findIndex(a => a.id === areaId);
          if (targetAreaIndex === -1) return;

          // 生產員檢查是否在允許的狀態清單內
          if (userRole === 'worker') {
            const allowed = settingsDoc.areas[targetAreaIndex].allowedStatuses || [];
            if (!allowed.includes(newStatus)) {
              showToast('您沒有權限切換至該狀態', 'error');
              return;
            }
          }

          settingsDoc.areas[targetAreaIndex].currentStatus = newStatus;
          await setDocument('settings', 'main', settingsDoc);
          
          showToast('區域狀態已更新', 'success');
        } catch (err) {
          console.error(err);
          showToast('更新失敗', 'error');
        }
      }
    });

    window.addEventListener('settings-updated', async () => {
      await this.loadSettings();
      this.updateUI();
    });
    window.addEventListener('refresh-area', this.updateUI.bind(this));

    this.initDataListener();
  },

  async loadSettings() {
    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        areas = settingsDoc.areas || [];
        statuses = settingsDoc.statuses || [];
        areaStatuses = settingsDoc.areaStatuses || ['正常', '壞機', '休息中'];
      }
    } catch (err) {}
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
    const statusToAreas = {};
    areas.forEach(area => {
      (area.statuses || []).forEach(s => {
        if (!statusToAreas[s]) statusToAreas[s] = [];
        statusToAreas[s].push(area);
      });
    });

    // 3. 權限過濾：決定「可見區域」
    let visibleAreas = areas;
    let showAllWarning = false;
    if (userRole === 'worker') {
      if (userAllowedAreas.length > 0) {
        visibleAreas = areas.filter(a => userAllowedAreas.includes(a.id));
      } else {
        // 生產員且未設定授權，提示管理員
        showAllWarning = true;
      }
    } else if (userRole === 'viewer') {
      // 一般使用者看到全部，但沒有編輯權限（用 UI 隱藏處理）
    }
    const visibleAreaIds = new Set(visibleAreas.map(a => a.id));

    // 4. 真正未綁定的工序
    const unassignedStatuses = allStatuses.filter(s => !statusToAreas[s]);

    // 5. 收集「未知工序」
    const knownStatuses = new Set([...allStatuses, ...Object.keys(statusToAreas)]);
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

    const unknownOrders = {};

    // 7. 分派工單
    cleanOrders.forEach(order => {
      const status = order.status;
      const orderCategory = getOrderCategory(order);
      const matchedAreas = statusToAreas[status] || [];
      
      let isAssignedToAnyVisibleArea = false;

      matchedAreas.forEach(area => {
        if (!visibleAreaIds.has(area.id)) return;

        // 相容類別檢查
        let areaCats = [];
        if (Array.isArray(area.categories)) {
          areaCats = area.categories.map(c => String(c).toUpperCase());
        } else if (typeof area.category === 'string' && area.category.trim() !== '') {
          areaCats = area.category.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
        }

        const isCategoryMatch = areaCats.length === 0 || areaCats.includes(orderCategory);

        if (isCategoryMatch && ordersByArea[area.id] && ordersByArea[area.id][status]) {
          ordersByArea[area.id][status].push(order);
          isAssignedToAnyVisibleArea = true;
        }
      });

      // 若該工序完全沒有被綁定到任何區域（或未授權），則進入「未分配區域」
      if (!isAssignedToAnyVisibleArea) {
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

    if (userRole === 'worker' && userAllowedAreas.length > 0 && visibleAreas.length === 0) {
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

      // 類別標籤
      const areaCats = Array.isArray(area.categories) ? area.categories : (area.category ? area.category.split(',') : []);
      const categoryLabel = areaCats.length > 0 
        ? areaCats.map(c => `<span class="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded font-bold">${c}</span>`).join('')
        : '';

      // 狀態 Tag / 下拉選單
      const allowedSts = area.allowedStatuses || [];
      let statusHtml = '';
      
      if (userRole === 'admin' || (userRole === 'worker' && allowedSts.length > 0)) {
        // 可編輯狀態
        const options = (userRole === 'admin' ? areaStatuses : allowedSts)
          .map(st => `<option value="${st}" ${area.currentStatus === st ? 'selected' : ''}>${st}</option>`).join('');
        
        statusHtml = `
          <select class="area-status-select appearance-none bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 px-2 py-0.5 rounded cursor-pointer hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20 ml-auto" data-area-id="${area.id}">
            ${options}
          </select>
        `;
      } else {
        // 唯讀顯示（一般使用者或無授權狀態的生產員）
        statusHtml = `<span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded ml-auto">${area.currentStatus || '正常'}</span>`;
      }

      return `
        <div class="glass-card p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2 flex-wrap border-b border-slate-100 pb-2">
            <i data-lucide="map-pin" class="w-5 h-5 text-brand"></i>
            <h2 class="text-base font-bold text-slate-800">${area.name}</h2>
            ${categoryLabel}
            <span class="text-xs px-2 py-0.5 bg-brand/10 text-brand rounded font-medium">${totalCount} 單</span>
            ${statusHtml}
          </div>
          ${totalCount === 0 ? `<div class="text-sm text-slate-400 py-2">暫無工單</div>` : statusBlocks}
        </div>
      `;
    }).join('');

    // 8-2. 未分配區域
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
      icons: { Inbox, ChevronLeft, ChevronRight, MapPin, AlertCircle, Activity },
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
V: 1792983000
W: UPGRADE-005
*/