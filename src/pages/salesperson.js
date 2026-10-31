import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { renderPageLayout } from '../ui/layout.js';
import { renderOrderView } from '../ui/order-view.js';
import { createIcons } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let schema = [];
let viewConfig = {};
let areas = [];
let currentRep = '';

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        schema = settingsDoc.schema || [];
        viewConfig = settingsDoc.view_configs || {};
        areas = settingsDoc.areas || [];
      }
    } catch (err) {}

    renderPageLayout({
      title: '銷售員視圖',
      subtitle: '依銷售員檢視名下工單與狀態分佈',
      headerActions: '',
      controls: `
        <div id="rep-tabs" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 mb-4"></div>
      `,
      listContainerId: 'salesperson-container'
    });

    window.addEventListener('refresh-salesperson', this.updateUI.bind(this));
    window.addEventListener('settings-updated', async () => {
      try {
        const settingsDoc = await getDocument('settings', 'main');
        if (settingsDoc) {
          schema = settingsDoc.schema || [];
          viewConfig = settingsDoc.view_configs || {};
          areas = settingsDoc.areas || [];
          this.updateUI();
        }
      } catch (err) {}
    });

    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      
      const user = AppState.getUser();
      if (!user) return;
      
      const allowedSales = Array.isArray(user.allowedSales) ? user.allowedSales : [];
      
      // 提取所有銷售員
      let reps = Array.from(new Set(currentOrders.flatMap(o => o.salesReps || ['未填寫']))).sort();
      
      // 權限過濾：銷售員只能看到被授權的銷售員分頁
      if (user.role === 'sales') {
        if (allowedSales.length > 0) {
          reps = reps.filter(r => allowedSales.includes(r));
        }
      }

      // 如果第一次載入，自動選中第一個銷售員
      if (!currentRep || !reps.includes(currentRep)) {
        if (reps.length > 0) currentRep = reps[0];
        else currentRep = '';
      }
      
      this.updateUI(reps);
    });
  },

  updateUI(preCalculatedReps = null) {
    const user = AppState.getUser();
    if (!user) return;

    const allowedSales = Array.isArray(user.allowedSales) ? user.allowedSales : [];
    
    // 提取所有銷售員
    let reps = preCalculatedReps;
    if (!reps) {
      reps = Array.from(new Set(currentOrders.flatMap(o => o.salesReps || ['未填寫']))).sort();
      if (user.role === 'sales' && allowedSales.length > 0) {
        reps = reps.filter(r => allowedSales.includes(r));
      }
    }
    
    const tabsContainer = document.getElementById('rep-tabs');
    if (tabsContainer) {
      if (reps.length === 0) {
        tabsContainer.innerHTML = '<div class="text-slate-400 text-sm">無可見的銷售員資料</div>';
      } else {
        tabsContainer.innerHTML = reps.map(r => `
          <button class="w-full flex justify-between items-center px-3 py-2 rounded-xl text-sm font-medium border ${r === currentRep ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'}" data-rep="${r}">
            <span class="truncate pr-2">${r}</span>
            <span class="text-xs px-1.5 py-0.5 rounded-md flex-shrink-0 ${r === currentRep ? 'bg-white/20' : 'bg-slate-100'}">${currentOrders.filter(o => (o.salesReps || ['未填寫']).includes(r)).length}</span>
          </button>
        `).join('');

        tabsContainer.querySelectorAll('button').forEach(btn => {
          btn.onclick = () => { currentRep = btn.dataset.rep; this.updateUI(reps); };
        });
      }
    }

    if (!currentRep) {
      const container = document.getElementById('salesperson-container');
      if (container) {
        container.innerHTML = `
          <div class="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 bg-white rounded-2xl border border-slate-100 shadow-soft mt-4">
            <i data-lucide="inbox" class="w-12 h-12 opacity-30"></i>
            <span class="text-base font-medium">目前無銷售員資料</span>
          </div>
        `;
        createIcons({ icons: {}, attrs: { class: 'w-4 h-4' } });
      }
      return;
    }

    const filtered = currentOrders.filter(o => (o.salesReps || ['未填寫']).includes(currentRep));

    // 依使用者設定的順序對齊欄位
    let visibleFields = (viewConfig['salesperson'] || []).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    // 強制加入「區域」欄位，插在「發票」之後（或最前面）
    if (!visibleFields.some(f => f.key === 'area_name')) {
      visibleFields.splice(1, 0, { key: 'area_name', label: '所在區域', isVisible: true });
    }

    renderOrderView({
      containerId: 'salesperson-container',
      orders: filtered,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'salesperson',
      isReadOnly: true, // 設定為唯讀
      groupBy: 'status', // 按工序分區塊顯示
      areas: areas, // 傳入區域資料供比對
      onAction: async (action, id, newStatus) => {
        // 唯讀模式下不會觸發這些
      }
    });
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    window.removeEventListener('refresh-salesperson', this.updateUI.bind(this));
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/*
F: AI-WA-UPWO/src/pages/salesperson.js
V: 1792988000
W: UPGRADE-005
*/