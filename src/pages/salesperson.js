import { AppState } from '../config/state.js';
import { listenCollection, getDocument } from '../db/read.js';
import { updateDocument, deleteDocument } from '../db/write.js';
import { renderPageLayout } from '../ui/layout.js';
import { showToast } from '../ui/toast.js';
import { openConfirm } from '../ui/modal.js';
import { renderTopTabs, renderViewToggle, bindViewToggle, renderOrders } from '../ui/order-view.js';
import { createIcons, Users, Activity, ClipboardList } from 'lucide';

let unsubscribe = null;
let currentOrders = [];
let allReps = [];
let currentRep = null;
let currentView = 'card';
let currentSchema = [];

export default {
  async render() {
    const user = AppState.getUser();
    if (!user) return;

    // 1. 讀取系統設定（取得動態 Schema）
    try {
      const settingsDoc = await getDocument('settings', 'main');
      if (settingsDoc && settingsDoc.schema) {
        currentSchema = settingsDoc.schema;
      }
    } catch (err) {
      console.warn('無法讀取欄位設定，將以預設模式顯示', err);
    }

    // 2. 渲染頁面骨架
    renderPageLayout({
      title: '銷售員視圖',
      subtitle: '依銷售員檢視名下工單與狀態分佈',
      headerActions: `
        <div id="view-toggle-container">${renderViewToggle(currentView)}</div>
      `,
      stats: [],
      controls: `
        <div id="top-tabs-container"></div>
      `,
      listContainerId: 'salesperson-container'
    });

    // 3. 綁定視圖切換
    bindViewToggle((view) => {
      currentView = view;
      this.renderContent();
    });

    createIcons({
      icons: { Users, Activity, ClipboardList },
      attrs: { class: 'w-4 h-4' }
    });

    // 4. 初始化資料監聽
    this.initDataListener();
  },

  initDataListener() {
    unsubscribe = listenCollection('work_orders', (orders) => {
      currentOrders = orders;
      this.extractRepsAndRender();
    });
  },

  extractRepsAndRender() {
    // 提取所有不重複的銷售員
    const repsSet = new Set();
    currentOrders.forEach(o => {
      (o.salesReps || ['未填寫']).forEach(r => repsSet.add(r));
    });
    allReps = Array.from(repsSet).sort();

    // 預設選中第一個銷售員（若還沒選過或選中的被刪除了）
    if (allReps.length > 0 && (!currentRep || !allReps.includes(currentRep))) {
      currentRep = allReps[0];
    }

    this.updateUI();
  },

  updateUI() {
    // 1. 更新頂部銷售員按鈕列
    const tabItems = allReps.map(rep => ({
      value: rep,
      label: rep,
      count: currentOrders.filter(o => (o.salesReps || []).includes(rep)).length
    }));

    renderTopTabs('top-tabs-container', tabItems, currentRep, (newRep) => {
      currentRep = newRep;
      this.updateUI(); // 重新渲染按鈕狀態與內容
    });

    // 2. 渲染工單內容
    this.renderContent();
  },

  renderContent() {
    if (!currentRep) return;

    // 過濾出當前選中銷售員的工單
    const filtered = currentOrders.filter(o => (o.salesReps || []).includes(currentRep));

    const user = AppState.getUser();
    const isAdmin = user && user.role === 'admin';

    renderOrders({
      containerId: 'salesperson-container',
      orders: filtered,
      viewType: currentView,
      schema: currentSchema,
      isAdmin: isAdmin,
      onDelete: async (id) => {
        const confirmed = await openConfirm({
          title: '刪除工單',
          message: `確定要徹底刪除工單「${id}」嗎？`,
          isDanger: true,
          confirmText: '確認刪除'
        });
        if (confirmed) {
          await deleteDocument('work_orders', id);
          showToast(`工單 ${id} 已刪除`, 'success');
        }
      },
      onStatusChange: async (id) => {
        const newStatus = window.prompt(`請輸入要流轉的狀態名稱（例如：印刷、裁切）：`);
        if (newStatus && newStatus.trim()) {
          const nowStr = new Date().toISOString();
          await updateDocument('work_orders', id, { status: newStatus.trim(), statusUpdateDate: nowStr });
          showToast(`工單 ${id} 已流轉至【${newStatus.trim()}】`, 'success');
        }
      }
    });

    // 為卡片視圖的流轉按鈕綁定事件
    if (currentView === 'card' && isAdmin) {
      const statuses = AppState.getStatuses() || [];
      document.querySelectorAll('.status-options').forEach(container => {
        const orderId = container.dataset.id;
        const currentOrder = currentOrders.find(o => o.id === orderId);
        if (!currentOrder) return;

        const otherStatuses = statuses.filter(s => s !== currentOrder.status);
        container.innerHTML = otherStatuses.map(s => `
          <button class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors btn-change-status" data-new-status="${s}">
            移至 ${s}
          </button>
        `).join('');

        container.querySelectorAll('.btn-change-status').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newStatus = btn.dataset.newStatus;
            btn.disabled = true;
            btn.textContent = '處理中...';
            try {
              const nowStr = new Date().toISOString();
              await updateDocument('work_orders', orderId, { status: newStatus, statusUpdateDate: nowStr });
              showToast(`工單 ${orderId} 已流轉至【${newStatus}】`, 'success');
            } catch (err) {
              showToast('更新失敗', 'error');
            }
          });
        });
      });

      // 綁定下拉選單的開關
      document.querySelectorAll('.btn-dropdown').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = btn.nextElementSibling;
          document.querySelectorAll('.dropdown-menu').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
          });
          menu.classList.toggle('hidden');
        });
      });
      document.addEventListener('click', () => {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.add('hidden'));
      }, { once: true });
    }
  },

  destroy() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    currentOrders = [];
    allReps = [];
    currentRep = null;
  }
};

/* ═══ EOF ═══
F: AI-WA-UPWO/src/pages/salesperson.js
V: 1792913200
W: UPGRADE-002
═══ */