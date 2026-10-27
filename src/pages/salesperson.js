import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { updateDocument, deleteDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderOrderView } from '../ui/order-view.js';
import { createIcons } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let schema = [];
let viewConfig = {};
let currentRep = '';

export default {
  async render() {
    if (!AppState.getUser()) return;

    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        schema = settingsDoc.schema || [];
        viewConfig = settingsDoc.view_configs || {};
      }
    } catch (err) {}

    renderPageLayout({
      title: '銷售員視圖',
      subtitle: '依銷售員檢視名下工單與狀態分佈',
      headerActions: '',
      controls: `
        <div id="rep-tabs" class="flex items-center gap-2 overflow-x-auto pb-2 mb-2 kanban-scroll"></div>
      `,
      listContainerId: 'salesperson-container'
    });

    window.addEventListener('refresh-salesperson', this.updateUI.bind(this));

    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      // 如果第一次載入，自動選中第一個銷售員
      if (!currentRep) {
        const reps = [...new Set(currentOrders.flatMap(o => o.salesReps || ['未填寫']))].sort();
        if (reps.length > 0) currentRep = reps[0];
      }
      this.updateUI();
    });
  },

  updateUI() {
    // 提取所有銷售員
    const reps = [...new Set(currentOrders.flatMap(o => o.salesReps || ['未填寫']))].sort();
    
    // 若當前選中的銷售員不存在了，重置為第一個
    if (reps.length > 0 && !reps.includes(currentRep)) {
      currentRep = reps[0];
    }

    const tabsContainer = document.getElementById('rep-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = reps.map(r => `
        <button class="whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium border ${r === currentRep ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'}" data-rep="${r}">
          ${r} <span class="ml-1 text-xs px-1.5 py-0.5 rounded-md ${r === currentRep ? 'bg-white/20' : 'bg-slate-100'}">${currentOrders.filter(o => (o.salesReps || ['未填寫']).includes(r)).length}</span>
        </button>
      `).join('');

      tabsContainer.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentRep = btn.dataset.rep; this.updateUI(); };
      });
    }

    if (!currentRep) return;

    const filtered = currentOrders.filter(o => (o.salesReps || ['未填寫']).includes(currentRep));

    renderOrderView({
      containerId: 'salesperson-container',
      orders: filtered,
      visibleFields: schema.filter(f => (viewConfig['salesperson'] || []).includes(f.key)).map(f => ({ ...f, isVisible: true })),
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'salesperson',
      onAction: async (action, id) => {
        if (action === 'delete') {
          if (await openConfirm({ title: '刪除', message: `確定刪除 ${id}？`, isDanger: true })) {
            await deleteDocument('work_orders', id);
            showToast('已刪除', 'success');
          }
        } else if (action === 'flow') {
          const newStatus = window.prompt('輸入目標狀態：');
          if (newStatus) {
            await updateDocument('work_orders', id, { status: newStatus.trim(), statusUpdateDate: new Date().toISOString() });
            showToast('已流轉', 'success');
          }
        }
      }
    });
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    window.removeEventListener('refresh-salesperson', this.updateUI.bind(this));
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/salesperson.js
V: 1792914400
W: UPGRADE-002
═══ */