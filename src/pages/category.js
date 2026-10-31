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
        <div id="category-tabs" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 mb-4"></div>
      `,
      listContainerId: 'category-container'
    });

    window.addEventListener('refresh-category', this.updateUI.bind(this));
    window.addEventListener('settings-updated', this.updateUI.bind(this));

    this.initDataListener();
  },

  initDataListener() {
    if (unsubscribe) unsubscribe();
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      if (!currentCategory) {
        const cats = Array.from(new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他'))).sort();
        if (cats.length > 0) currentCategory = cats[0];
      }
      this.updateUI();
    });
  },

  updateUI() {
    const cats = Array.from(new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他'))).sort();
    
    if (cats.length > 0 && !cats.includes(currentCategory)) {
      currentCategory = cats[0];
    }

    const tabsContainer = document.getElementById('category-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = cats.map(c => `
        <button class="w-full flex justify-between items-center px-3 py-2 rounded-xl text-sm font-medium border ${c === currentCategory ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'}" data-cat="${c}">
          <span class="truncate pr-2">${c}</span>
          <span class="text-xs px-1.5 py-0.5 rounded-md flex-shrink-0 ${c === currentCategory ? 'bg-white/20' : 'bg-slate-100'}">${currentOrders.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === c).length}</span>
        </button>
      `).join('');

      tabsContainer.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentCategory = btn.dataset.cat; this.updateUI(); };
      });
    }

    if (!currentCategory) return;

    const filtered = currentOrders.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === currentCategory);

    // 依使用者設定的順序對齊欄位
    const visibleFields = (viewConfig['category'] || []).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    renderOrderView({
      containerId: 'category-container',
      orders: filtered,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'category',
      isReadOnly: true, // 設定為唯讀
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
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/*
F: AI-WA-UPWO/src/pages/category.js
V: 1792963000
W: UPGRADE-005
*/