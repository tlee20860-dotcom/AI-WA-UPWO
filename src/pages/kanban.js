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
let currentCategory = 'ALL';
let schema = [];
let viewConfig = {};
let route_templates = [];
let settingsCategories = [];

export default {
  async render() {
    if (!AppState.getUser()) return;

    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc) {
        schema = settingsDoc.schema || [];
        viewConfig = settingsDoc.view_configs || {};
        route_templates = settingsDoc.route_templates || [];
        settingsCategories = settingsDoc.categories || [];
      }
    } catch (err) {}

    renderPageLayout({
      title: '生產進度控制台',
      subtitle: '即時追蹤工單狀態與生產進度',
      headerActions: '', // 💡 已移除匯入與自動同步按鈕
      controls: `
        <div id="category-tabs" class="flex flex-wrap gap-2 mb-4"></div>
      `,
      listContainerId: 'kanban-container'
    });

    window.addEventListener('refresh-kanban', this.updateUI.bind(this));
    window.addEventListener('settings-updated', async () => {
      try {
        const settingsDoc = await getDocument('settings', 'main');
        if (settingsDoc) {
          schema = settingsDoc.schema || [];
          viewConfig = settingsDoc.view_configs || {};
          route_templates = settingsDoc.route_templates || [];
          settingsCategories = settingsDoc.categories || [];
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
      this.updateUI();
    });
  },

  updateUI() {
    const orderCats = Array.from(new Set(currentOrders.map(o => o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他')));
    const combinedCats = settingsCategories.concat(orderCats);
    const allCats = Array.from(new Set(combinedCats)).filter(c => c !== 'ALL').sort();

    const tabsContainer = document.getElementById('category-tabs');
    if (tabsContainer) {
      const tabs = ['ALL'].concat(allCats);
      tabsContainer.innerHTML = tabs.map(c => {
        const label = c === 'ALL' ? '全部類別' : c;
        const count = c === 'ALL' 
          ? currentOrders.length 
          : currentOrders.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === c).length;
        
        return `
          <button class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border ${c === currentCategory ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600 border-slate-200'}" data-cat="${c}">
            <span>${label}</span>
            <span class="text-xs px-1.5 py-0.5 rounded-md ${c === currentCategory ? 'bg-white/20' : 'bg-slate-100'}">${count}</span>
          </button>
        `;
      }).join('');

      tabsContainer.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => { currentCategory = btn.dataset.cat; this.updateUI(); };
      });
    }

    let filtered = currentOrders;
    if (currentCategory !== 'ALL') {
      filtered = filtered.filter(o => (o.data?.category || o.id.match(/^[a-zA-Z]+/)?.[0] || '其他') === currentCategory);
    }

    const visibleFields = (viewConfig['kanban'] || []).map(key => {
      const field = schema.find(f => f.key === key);
      return field ? Object.assign({}, field, { isVisible: true }) : null;
    }).filter(Boolean);

    renderOrderView({
      containerId: 'kanban-container',
      orders: filtered,
      visibleFields: visibleFields,
      isAdmin: AppState.getUser()?.role === 'admin',
      pageKey: 'kanban',
      route_templates: route_templates,
      groupBy: 'status', // 確保看板保留狀態上下步功能
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
    window.removeEventListener('refresh-kanban', this.updateUI.bind(this));
    window.removeEventListener('settings-updated', this.updateUI.bind(this));
  }
};

/*
F: AI-WA-UPWO/src/pages/kanban.js
V: 1793053000
W: UPGRADE-007
*/