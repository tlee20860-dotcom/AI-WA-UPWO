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
let currentCategory = '';

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
      title: '類別視圖',
      subtitle: '依發票前兩碼檢視工單狀態',
      headerActions: '',
      controls: `
        <div id="category-tabs" class="flex items-center gap-2 overflow-x-auto pb-2 mb-2 kanban-scroll"></div>
      `,
      listContainerId: 'category-container'
    });

    window.addEventListener('refresh-category', this.updateUI.bind(this));

    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      if (!currentCategory) {
        const cats = [...new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他'))].sort();
        if (cats.length > 0) currentCategory = cats[0];
      }
      this.updateUI();
    });
  },

  updateUI() {
    const cats = [...new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他'))].sort();
    
    if (cats.length > 0 && !cats.includes(currentCategory)) {
      currentCategory = cats[0];
    }

    const tabsContainer = document.getElementById('category-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = cats.map(c => `
        <button class="whitespace-nowrap px-4 py-2 rounded-xl text-sm font-medium border ${c === currentCategory ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'}" data-cat="${c}">
          ${c} <span class="ml-1 text-xs px-1.5 py-0.5 rounded-md ${c === currentCategory ? 'bg-white/20' : 'bg-slate-100'}">${currentOrders.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === c).length}</span>
        </button>
      `).join('');

      tabsContainer.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentCategory = btn.dataset.cat; this.updateUI(); };
      });
    }

    if (!currentCategory) return;

    const filtered = currentOrders.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === currentCategory);

    renderOrderView({
      containerId: 'category-container',
      orders: filtered,
      visibleFields: schema.filter(f => (viewConfig['category'] || []).includes(f.key)).map(f => ({ ...f, isVisible: true })),
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'category',
      onAction: async (action, id, newStatus) => {
        if (action === 'delete') {
          if (await openConfirm({ title: '刪除', message: `確定刪除 ${id}？`, isDanger: true })) {
            await deleteDocument('work_orders', id);
            showToast('已刪除', 'success');
          }
        } else if (action === 'status_change') {
          if (newStatus) {
            await updateDocument('work_orders', id, { status: newStatus, statusUpdateDate: new Date().toISOString() });
            showToast('已更新生產進度', 'success');
          }
        }
      }
    });
  },

  destroy() {
    if (unsubscribe) unsubscribe();
    window.removeEventListener('refresh-category', this.updateUI.bind(this));
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/category.js
V: 1792915200
W: UPGRADE-002
═══ */